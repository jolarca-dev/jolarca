"""Consent API — GDPR Art. 7(1) demonstrability (GAP-C01 / GAP-C04).

POST records an immutable consent snapshot; GET returns the user's
consent history. Both require authentication — consent is always
user-scoped.

Design decisions:
- Each POST creates one ConsentRecord per toggleable category
  (analytics, marketing, personalization) — the Art. 7 ledger.
- Additionally, one AuditLog entry per POST stores the full snapshot
  as JSON. The GET endpoint queries AuditLog for history, avoiding
  fragile timestamp-based reconstruction from individual records.
- The frontend field `preferences` maps to the backend purpose
  `personalization` — see _FRONTEND_TO_PURPOSE.
- `necessary` is accepted in the request but never stored — it is
  legally exempt (session, security, payments).
- Pagination is disabled for GET: the frontend reads `response.history`
  as a flat array; a paginated envelope would silently yield [].
  A hard limit of 50 entries caps the query.
"""

from __future__ import annotations

import structlog
from django.db import transaction
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.users_app.models import ConsentPurpose, ConsentRecord

from .models import AuditLog
from .serializers import ConsentHistoryEntrySerializer, ConsentRecordRequestSerializer

audit = structlog.get_logger("jol.audit")

# Frontend category name → backend ConsentPurpose value.
# "preferences" (FE) ↔ "personalization" (BE) — the mapping is confined
# to this dict so views and tests stay declarative.
_FRONTEND_TO_PURPOSE: dict[str, str] = {
    "analytics": ConsentPurpose.ANALYTICS,
    "marketing": ConsentPurpose.MARKETING,
    "preferences": ConsentPurpose.PERSONALIZATION,
}


def _client_ip(request) -> str:
    """First hop of X-Forwarded-For — matches gdpr_middleware._client_ip."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "")


@extend_schema(
    request=ConsentRecordRequestSerializer,
    responses={201: None},
)
class ConsentView(APIView):
    """POST /api/v1/compliance/consent/ — append consent snapshot (GAP-C01).

    Creates one ConsentRecord per toggleable category. The records are
    immutable — a withdrawal is a NEW batch with granted=False.

    POST is intentionally idempotent at the snapshot level: each call
    creates new rows, but the LATEST snapshot (most recent created_at)
    always reflects the user's current decision.
    """

    def post(self, request):
        serializer = ConsentRecordRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = serializer.validated_data
        ip = _client_ip(request)
        ua = request.headers.get("User-Agent", "")
        version = str(data["version"])

        with transaction.atomic():
            for fe_category, purpose in _FRONTEND_TO_PURPOSE.items():
                ConsentRecord.objects.create(
                    user=request.user,
                    purpose=purpose,
                    consent_version=version,
                    granted=data[fe_category],
                    ip_address=ip or None,
                    user_agent=ua,
                )

            # AuditLog snapshot: one entry per POST, stores the full decision
            # as JSON. The GET endpoint reads these for history — avoids
            # fragile timestamp-based grouping of individual ConsentRecords.
            AuditLog.objects.create(
                actor_id=request.user.pk,
                action="consent_record",
                ip_address=ip or None,
                data={
                    "analytics": data["analytics"],
                    "marketing": data["marketing"],
                    "preferences": data["preferences"],
                    "version": data["version"],
                    "client_timestamp": data["timestamp"].isoformat(),
                },
            )

        audit.info(
            "consent_record",
            user_id=str(request.user.pk),
            analytics=data["analytics"],
            marketing=data["marketing"],
            preferences=data["preferences"],
            version=version,
        )
        return Response(status=status.HTTP_201_CREATED)

    @extend_schema(
        responses=inline_serializer(
            name="ConsentHistoryResponse",
            fields={
                "history": ConsentHistoryEntrySerializer(many=True),
            },
        ),
    )
    def get(self, request):
        """GET /api/v1/compliance/consent/ — consent history (GAP-C04).

        Returns immutable audit records grouped by decision event.
        Each entry is a snapshot of all toggleable categories at the
        time of the decision. Entries are ordered most-recent-first.

        Pagination is intentionally disabled: the frontend contract
        reads `response.history` as a flat array. A hard LIMIT of 50
        entries caps the query.
        """
        # Read from AuditLog — each POST creates exactly one snapshot
        # entry, so no grouping is needed. Ordered most-recent-first.
        entries = AuditLog.objects.filter(
            actor_id=request.user.pk, action="consent_record"
        ).order_by("-created_at")[:50]

        history = []
        for entry in entries:
            data = entry.data or {}
            history.append(
                {
                    "timestamp": entry.created_at.isoformat(),
                    "version": data.get("version", 0),
                    "analytics": data.get("analytics", False),
                    "marketing": data.get("marketing", False),
                    "preferences": data.get("preferences", False),
                }
            )

        return Response({"history": history})
