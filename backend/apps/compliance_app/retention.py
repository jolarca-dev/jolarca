"""Retention policy — ANONYMIZE, DON'T DELETE (for financial evidence).

LT/LV/EE tax/accounting law requires retaining transaction records for
~7 years (RETENTION_FINANCIAL_YEARS). GDPR erasure and legal retention
collide here by design: personal identifiers are removed, the financial
fact remains, keyed by an irreversible pseudonymous token.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import structlog
from django.conf import settings
from django.utils import timezone

audit = structlog.get_logger("jol.audit")


def financial_cutoff() -> datetime:
    years = settings.RETENTION_FINANCIAL_YEARS
    return timezone.now() - timedelta(days=365 * years)


def anonymize_order_history(user) -> int:
    """Replace buyer linkage on retention-bound orders with a pseudonym.

    Called by the retention sweep for users whose data is no longer needed
    for the original purpose AND past all appeal windows. The financial fact
    survives as tax evidence, keyed by an irreversible per-user token; the
    direct buyer link is dropped. Idempotent: anonymized orders carry no
    buyer, so a repeat run matches nothing.
    """
    import hashlib

    from apps.orders_app.models import Order

    pseudonym = hashlib.sha256(f"jol-retention:{user.pk}".encode()).hexdigest()[:32]
    cutoff = financial_cutoff()
    count = Order.objects.filter(buyer=user, created_at__lt=cutoff).update(
        buyer=None, anonymized_ref=pseudonym
    )
    audit.info("order_history_anonymized", pseudonym=pseudonym, orders=count)
    return count
