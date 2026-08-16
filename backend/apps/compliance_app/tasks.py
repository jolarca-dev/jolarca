"""compliance_app tasks — queue: compliance (isolated, SLA-tracked)."""

from celery import shared_task
from django.conf import settings
from django.utils import timezone


@shared_task(queue="compliance", max_retries=5, default_retry_delay=300)
def run_erasure_fanout(erasure_request_id: str) -> None:
    from .models import ErasureRequest
    from .services import execute_erasure

    request = ErasureRequest.objects.filter(pk=erasure_request_id).select_related("user").first()
    if request is None or request.status == "completed":
        return
    result = execute_erasure(request)
    if result.status == "partially_blocked":
        raise run_erasure_fanout.retry(exc=RuntimeError("erasure partially blocked"))


@shared_task(queue="compliance")
def nightly_retention_sweep() -> None:
    """Beat-driven: retention decisions are logged, never silent."""
    from .models import AuditLog

    AuditLog.objects.create(
        action="retention_sweep_executed", data={"policy_years": settings.RETENTION_FINANCIAL_YEARS}
    )
    # MVP-C2: iterate anonymization candidates per retention.anonymize_order_history.


@shared_task(queue="compliance")
def check_erasure_sla() -> None:
    """Beat-driven: escalate requests approaching the Art. 17 deadline."""
    from datetime import timedelta

    import structlog

    from .models import ErasureRequest

    audit = structlog.get_logger("jol.audit")
    horizon = timezone.now() + timedelta(days=3)
    at_risk = ErasureRequest.objects.filter(
        status__in=["requested", "in_progress", "partially_blocked"], due_at__lte=horizon
    )
    for request in at_risk.iterator():
        audit.warning("erasure_sla_at_risk", request_id=str(request.pk), due_at=str(request.due_at))
