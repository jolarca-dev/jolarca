"""Payments models — webhook event log is the reconciliation spine.

PCI scope note: we store ONLY Stripe object IDs and amounts. Card data,
tokens, and customer payment methods never enter this database (SAQ-A).
"""

from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class StripeWebhookEvent(UUIDModel, TimeStampedModel):
    """Every inbound Stripe event is persisted BEFORE processing.

    - event_id uniqueness gives webhook-level idempotency (Stripe retries).
    - raw payload retention is required for dispute/audit reconstruction.
    """

    event_id = models.CharField(max_length=64, unique=True, help_text="Stripe evt_... id")
    event_type = models.CharField(max_length=128)
    payload = models.JSONField(
        help_text="Raw verified event JSON (retention: 7y, financial evidence)"
    )
    processed_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(blank=True, default="")

    class Meta:
        indexes = [models.Index(fields=["event_type", "processed_at"])]

    @property
    def is_processed(self) -> bool:
        return self.processed_at is not None

    def __str__(self) -> str:
        return f"{self.event_id} [{self.event_type}]"


class PaymentRecord(UUIDModel, TimeStampedModel):
    """Our ledger view of a charge lifecycle (mirrors Stripe, never card data)."""

    order = models.OneToOneField(
        "orders_app.Order", on_delete=models.PROTECT, related_name="payment"
    )
    payment_intent_id = models.CharField(max_length=64, blank=True, default="", db_index=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="EUR")
    status = models.CharField(max_length=32, default="requires_payment_method")
    refunded_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
