"""Stripe webhook ingestion — signature-verified, idempotent, replay-safe.

Processing contract:
1. Verify signature with STRIPE_WEBHOOK_SECRET (rejects forgery).
2. Persist the raw event FIRST (evidence + dedupe by event id).
3. Dispatch to a handler; handlers must be idempotent themselves.
4. Never trust unverified payloads — construct_event is the only parser.
"""

from __future__ import annotations

import json

import structlog
from django.conf import settings
from django.http import HttpResponseBadRequest, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .models import StripeWebhookEvent

audit = structlog.get_logger("jol.audit")


def _verify_and_parse(body: bytes, signature: str):
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise ValueError("STRIPE_WEBHOOK_SECRET not configured")
    try:
        import stripe
    except ImportError as exc:  # pragma: no cover
        raise ValueError("stripe SDK not installed") from exc
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe.Webhook.construct_event(body, signature, settings.STRIPE_WEBHOOK_SECRET)


def _is_signature_error(exc: Exception) -> bool:
    """C4 fix (STEP 20): Stripe raises SignatureVerificationError, which is
    NOT a ValueError subclass — forged webhooks must yield 400, not 500."""
    for klass in type(exc).__mro__:
        if klass.__name__ in ("SignatureVerificationError", "InvalidRequestError"):
            return True
    return False


HANDLERS: dict[str, str] = {
    # event type → dotted task path (processed async for throughput + retries)
    "payment_intent.succeeded": "apps.payments_app.tasks.handle_payment_succeeded",
    "payment_intent.payment_failed": "apps.payments_app.tasks.handle_payment_failed",
    "charge.refunded": "apps.payments_app.tasks.handle_charge_refunded",
    "account.updated": "apps.payments_app.tasks.handle_connect_account_updated",
}


@csrf_exempt
@require_POST
def stripe_webhook(request):
    signature = request.headers.get("Stripe-Signature", "")
    try:
        event = _verify_and_parse(request.body, signature)
    except ValueError:
        audit.warning("stripe_webhook_rejected", reason="signature_invalid")
        return HttpResponseBadRequest("invalid signature")
    except Exception as exc:  # C4: SDK signature errors -> 400, never 500
        if _is_signature_error(exc):
            audit.warning("stripe_webhook_rejected", reason="signature_invalid")
            return HttpResponseBadRequest("invalid signature")
        raise

    record, created = StripeWebhookEvent.objects.get_or_create(
        event_id=event["id"],
        defaults={"event_type": event["type"], "payload": json.loads(str(event))},
    )
    if not created and record.is_processed:
        return JsonResponse({"status": "duplicate_ignored"})

    task_path = HANDLERS.get(event["type"])
    if task_path:
        # Resolve to the task object and use .delay(): unlike send_task it
        # honors CELERY_TASK_ALWAYS_EAGER (tests) and enqueues normally in
        # production.
        from importlib import import_module

        module_name, _, attr_name = task_path.rpartition(".")
        getattr(import_module(module_name), attr_name).delay(str(record.pk))

    record.processed_at = timezone.now()
    record.save(update_fields=["processed_at"])
    return JsonResponse({"status": "accepted"})
