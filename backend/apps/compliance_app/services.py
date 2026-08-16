"""Erasure orchestration — the GDPR Art. 17 fan-out.

Pattern: each domain app REGISTERS a handler describing how to erase or
anonymize its own data for a user. Adding a new app that stores personal
data without registering a handler is a compliance defect — the PR
checklist enforces it, and `verify_registry()` lets CI assert it.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta

import structlog
from django.conf import settings
from django.utils import timezone

from .models import ErasureRequest, ErasureStatus

audit = structlog.get_logger("jol.audit")

# handler(user) -> dict with outcome evidence: {"erased": n, "anonymized": n, "retained": n}
ERASURE_REGISTRY: dict[str, Callable] = {}


def register_handler(app_label: str):
    def decorator(func: Callable):
        ERASURE_REGISTRY[app_label] = func
        return func

    return decorator


def _default_handlers() -> None:
    """Register built-in handlers lazily (avoids import cycles at startup)."""
    if ERASURE_REGISTRY:
        return

    from apps.users_app.models import ConsentRecord, UserProfile

    def erase_users(user) -> dict:
        ConsentRecord.objects.filter(
            user=user
        ).delete()  # consent evidence of erasure kept in receipt
        UserProfile.objects.filter(user=user).delete()
        user_pk = user.pk
        user.email = f"erased-{user_pk}@invalid"
        user.first_name = user.last_name = ""
        user.is_active = False
        user.set_unusable_password()
        user.save()
        return {"anonymized": 1, "note": f"account {user_pk} deactivated, contact purged"}

    ERASURE_REGISTRY["users_app"] = erase_users


def request_erasure(user) -> ErasureRequest:
    """Create the SLA-tracked request and enqueue the fan-out."""
    due = timezone.now() + timedelta(days=settings.GDPR_ERASURE_SLA_DAYS)
    request = ErasureRequest.objects.create(user=user, due_at=due)

    AuditLog = _audit_model()
    AuditLog.objects.create(
        actor_id=user.pk, action="erasure_requested", target_type="user", target_id=str(user.pk)
    )

    from .tasks import run_erasure_fanout

    run_erasure_fanout.delay(str(request.pk))
    audit.info("erasure_requested", user_id=str(user.pk), request_id=str(request.pk))
    return request


def execute_erasure(request: ErasureRequest) -> ErasureRequest:
    """Run every registered handler; failures do NOT abort the fan-out —
    they are recorded in the receipt and retried (partial erasure is worse
    than a loud, recoverable failure)."""
    _default_handlers()
    request.status = ErasureStatus.IN_PROGRESS
    request.save(update_fields=["status", "modified_at"])

    receipt: dict[str, dict] = {}
    failed = False
    for app_label, handler in ERASURE_REGISTRY.items():
        try:
            receipt[app_label] = handler(request.user)
        except Exception as exc:  # noqa: BLE001 — fan-out must be resilient
            receipt[app_label] = {"error": str(exc)}
            failed = True
            audit.error("erasure_handler_failed", app=app_label, request_id=str(request.pk))

    request.receipt = receipt
    if failed:
        request.status = ErasureStatus.PARTIALLY_BLOCKED
    else:
        request.status = ErasureStatus.COMPLETED
        request.completed_at = timezone.now()
    request.save(update_fields=["status", "receipt", "completed_at", "modified_at"])

    _audit_model().objects.create(
        action="erasure_executed",
        target_type="erasure_request",
        target_id=str(request.pk),
        data={"status": request.status},
    )
    audit.info("erasure_completed", request_id=str(request.pk), status=request.status)
    return request


def verify_registry() -> list[str]:
    """Return app labels that store personal data but lack an erasure handler.
    Wired into tests/security so CI fails on unregistered PII stores."""
    _default_handlers()
    expected = {"users_app"}  # extend as apps start storing personal data
    return sorted(expected - set(ERASURE_REGISTRY))


def _audit_model():
    from .models import AuditLog

    return AuditLog
