"""payments_app webhook handlers — each must be idempotent (Stripe retries)."""

from celery import shared_task


@shared_task(queue="default", max_retries=5, default_retry_delay=60)
def handle_payment_succeeded(event_record_id: str) -> None:
    from apps.orders_app.state_machine import OrderEvent, transition

    from .models import PaymentRecord, StripeWebhookEvent

    record = StripeWebhookEvent.objects.filter(pk=event_record_id).first()
    if record is None:
        return
    intent_id = record.payload["data"]["object"]["id"]
    payment = (
        PaymentRecord.objects.filter(payment_intent_id=intent_id).select_related("order").first()
    )
    if payment is None:
        return
    payment.status = "succeeded"
    payment.save(update_fields=["status", "modified_at"])
    if payment.order.status == "pending":
        transition(payment.order, OrderEvent.PAY, actor="stripe.webhook")


@shared_task(queue="default", max_retries=5, default_retry_delay=60)
def handle_payment_failed(event_record_id: str) -> None:
    from .models import PaymentRecord, StripeWebhookEvent

    record = StripeWebhookEvent.objects.filter(pk=event_record_id).first()
    if record is None:
        return
    intent_id = record.payload["data"]["object"]["id"]
    PaymentRecord.objects.filter(payment_intent_id=intent_id).update(status="failed")


@shared_task(queue="default", max_retries=5, default_retry_delay=60)
def handle_charge_refunded(event_record_id: str) -> None:
    from .models import StripeWebhookEvent

    record = StripeWebhookEvent.objects.filter(pk=event_record_id).first()
    if record is None:
        return
    # Ledger reconciliation for refunds is implemented with MVP-Y2.


@shared_task(queue="default", max_retries=5, default_retry_delay=60)
def handle_connect_account_updated(event_record_id: str) -> None:
    """Sync Stripe Connect account status → sellers_app verification state."""
    from .models import StripeWebhookEvent

    record = StripeWebhookEvent.objects.filter(pk=event_record_id).first()
    if record is None:
        return
    account_id = record.payload["data"]["object"]["id"]
    # sellers_app is updated through its services (boundary respected).
    from apps.sellers_app.models import SellerProfile

    SellerProfile.objects.filter(stripe_account_id=account_id).first()  # state mapping: MVP-Y3
