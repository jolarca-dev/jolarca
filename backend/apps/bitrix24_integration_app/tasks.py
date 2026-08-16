"""Bitrix24 sync tasks — queue: default, kill-switch protected.

Sync direction: marketplace → CRM (contacts/leads/deals). CRM must never
write back into marketplace PII without going through the owning app's
services (that path does not exist yet by design).
"""

import structlog
from celery import shared_task
from django.conf import settings

audit = structlog.get_logger("jol.audit")


def _enabled() -> bool:
    return bool(settings.BITRIX24_ENABLED and settings.BITRIX24_WEBHOOK_URL)


@shared_task(queue="default", max_retries=3, default_retry_delay=120)
def sync_contact_to_crm(user_id: str) -> None:
    """Push a buyer/seller contact to Bitrix24. PII minimization: only the
    fields the CRM process needs (email, name if given, locale, segment)."""
    if not _enabled():
        return  # kill switch: silently skip, never fail core flows

    from apps.users_app.models import User

    user = User.objects.filter(pk=user_id).first()
    if user is None:
        return

    # Sanctioned stub MVP-B1: webhook REST call with timeout + retry budget.
    raise sync_contact_to_crm.retry(exc=NotImplementedError("MVP-B1: Bitrix24 webhook not wired"))


@shared_task(queue="default", max_retries=3, default_retry_delay=120)
def sync_order_to_crm(order_id: str) -> None:
    if not _enabled():
        return
    audit.info("bitrix24_order_sync_placeholder", order_id=order_id)
    # MVP-B2: deal creation from order snapshot.
