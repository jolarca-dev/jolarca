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
    # Revenue attribution (ADR-0005 contract §5, STEP 20): order payments
    # are marketplace revenue; hub intents live in InternalPaymentIntent.
    product = models.CharField(max_length=16, default="marketplace", db_index=True)


class InternalPaymentIntent(UUIDModel, TimeStampedModel):
    """Cross-product intent ledger — the internal payment API's store.

    Revenue attribution (ADR-0005 contract §5): `product` separates
    hub-donation from marketplace-order revenue in every query.
    PAN-free by construction: only ids, amounts, and status tokens.
    `client_secret` is returned ONCE on create and never serialized
    again (contract §2.1).
    """

    PRODUCT_HUB = "hub"
    PRODUCT_MARKETPLACE = "marketplace"
    PRODUCT_CHOICES = [(PRODUCT_HUB, "hub"), (PRODUCT_MARKETPLACE, "marketplace")]

    caller = models.CharField(max_length=64, help_text="Authenticated service-account id")
    product = models.CharField(max_length=16, choices=PRODUCT_CHOICES, db_index=True)
    amount_cents = models.PositiveIntegerField()
    currency = models.CharField(max_length=3, default="EUR")
    metadata = models.JSONField(
        default=dict, blank=True, help_text="Sanctioned attribution keys only; PII-free"
    )
    customer_ref = models.CharField(
        max_length=128, blank=True, default="", help_text="Pseudonymized caller-side reference"
    )
    status = models.CharField(max_length=32, default="requires_payment_method", db_index=True)
    stripe_payment_intent_id = models.CharField(
        max_length=64, blank=True, default="", db_index=True
    )
    client_secret = models.CharField(
        max_length=255, blank=True, default="", help_text="Never serialized after create"
    )
    refunded_cents = models.PositiveIntegerField(default=0)
    finalized_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["product", "status"], name="payments_pr_product_idx")]

    def __str__(self) -> str:
        return f"{self.pk} [{self.product}/{self.status}]"


class InternalRefund(UUIDModel, TimeStampedModel):
    """Refund ledger for internal intents (RSK-010: real money moves here)."""

    intent = models.ForeignKey(
        InternalPaymentIntent, on_delete=models.PROTECT, related_name="refunds"
    )
    amount_cents = models.PositiveIntegerField()
    reason = models.CharField(max_length=64)
    reason_detail = models.CharField(max_length=255, blank=True, default="")
    status = models.CharField(max_length=16, default="succeeded")

    def __str__(self) -> str:
        return f"refund {self.pk} [{self.status}]"
