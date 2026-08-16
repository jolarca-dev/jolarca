"""GDPR compliance middleware — fail-closed by design.

Responsibilities:
1. Request correlation: every request gets an X-Request-ID (auditability,
   ISO 27001 A.8.15).
2. Kill switch: when settings.GDPR_PROCESSING_HALTED is true, ALL mutating
   requests receive 503. Read traffic continues (transparency obligation),
   health probes are exempt (orchestrators must keep seeing the service).
3. Audit emission: every authenticated mutation emits a structured audit
   event on the jol.audit channel; compliance_app persists durable copies
   for personal-data-modifying actions.

This middleware intentionally has no database dependency: it must keep working
even when the database is the subject of the incident.
"""

from __future__ import annotations

import uuid

import structlog
from django.conf import settings
from django.http import JsonResponse

audit = structlog.get_logger("jol.audit")

PROBE_PREFIXES = ("/healthz", "/readyz")
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


class JOLGDPRComplianceMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        request.request_id = request_id
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=request_id, method=request.method, path=request.path
        )

        is_probe = request.path.startswith(PROBE_PREFIXES)
        is_mutation = request.method not in SAFE_METHODS

        if getattr(settings, "GDPR_PROCESSING_HALTED", False) and not is_probe and is_mutation:
            audit.critical(
                "gdpr_processing_halted",
                detail="Mutating request rejected (fail-closed kill switch active).",
            )
            response = JsonResponse(
                {
                    "error": "processing_halted",
                    "detail": "Data processing is temporarily suspended. Please retry later.",
                },
                status=503,
            )
            response["Retry-After"] = "3600"
            response["X-Request-ID"] = request_id
            return response

        response = self.get_response(request)
        response["X-Request-ID"] = request_id

        if is_mutation:
            user = getattr(request, "user", None)
            if user is not None and getattr(user, "is_authenticated", False):
                audit.info(
                    "data_processing_event",
                    user_id=str(user.pk),
                    client_ip=self._client_ip(request),
                )
        return response

    @staticmethod
    def _client_ip(request) -> str:
        """First hop of X-Forwarded-For. Assumes a single trusted edge proxy;
        the proxy topology is documented in docs/architecture/07-communication-protocols.md."""
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
        return request.META.get("REMOTE_ADDR", "")
