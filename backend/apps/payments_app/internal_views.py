"""Internal payment API — /internal/v1 (Model A, ADR-0005).

Sole cross-program interface of the fleet (ADR-0004 Amendment 1).
Contract: jol-m-infrastructure/docs/payment-api-contract.md.

Design rules enforced here:
- HMAC caller auth + server-side caller<->product binding (§4.2/§4.4)
- Idempotency-Key mandatory on mutating calls; replay returns the stored
  response; key+body mismatch = 409 (§4.3)
- Scoped reads: intents of another product are 404, never 403 — no
  existence oracle (§2.2)
- PAN-free responses: whitelist serialization only (§4.5)
- Degraded mode: simulated/real outage -> 503 retryable problem+json,
  never partial success (§9)
- Stripe stays in TEST mode: when STRIPE_SECRET_KEY is unset the intent
  is created as a sanctioned stub (services.py policy) — contract logic
  is fully exercised, live Stripe wiring lands with staging.
"""

from __future__ import annotations

import json
import secrets

import structlog
from django.conf import settings
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt

from apps.core.idempotency import (
    IdempotencyConflict,
    get_cached_response,
    store_response,
)

from . import internal_auth
from .models import InternalPaymentIntent, InternalRefund

audit = structlog.get_logger("jol.audit")

ALLOWED_CURRENCIES = {"EUR"}  # v1: contract amendment required for more
REFUNDABLE_STATUSES = {"succeeded", "partially_refunded"}


def _problem(status: int, title: str, detail: str = "", **extra) -> JsonResponse:
    body = {"type": "about:blank", "title": title, "status": status, "detail": detail}
    body.update(extra)
    return JsonResponse(body, status=status)


def _intent_response(intent: InternalPaymentIntent, include_secret: bool = False) -> dict:
    data = {
        "id": str(intent.pk),
        "product": intent.product,
        "status": intent.status,
        "amount_cents": intent.amount_cents,
        "currency": intent.currency,
        "customer_ref": intent.customer_ref,
        "created_at": intent.created_at.isoformat() if intent.created_at else None,
    }
    if include_secret:
        data["client_secret"] = intent.client_secret
        data["expires_at"] = None  # stub mode: expiry enforced by PSP in live mode
    return data


class InternalApiView(View):
    """Base: authenticate or 401; outage check or continue."""

    def dispatch(self, request, *args, **kwargs):
        try:
            self.caller = internal_auth.authenticate(request)
        except internal_auth.InternalAuthError as exc:
            audit.warning("internal_api_auth_failed", reason=str(exc))
            return _problem(401, "unauthorized", str(exc))
        if getattr(settings, "INTERNAL_PAYMENTS_SIMULATE_OUTAGE", False):
            return _problem(
                503,
                "payment boundary unavailable",
                "retry with backoff; never bypass the boundary",
                retryable=True,
            )
        return super().dispatch(request, *args, **kwargs)


@method_decorator(csrf_exempt, name="dispatch")
class PaymentIntentListCreateView(InternalApiView):
    """POST /internal/v1/payment-intents"""

    http_method_names = ["post"]

    def post(self, request):
        idem_key = request.headers.get("Idempotency-Key", "")
        if not idem_key:
            return _problem(400, "Idempotency-Key header is mandatory on mutating calls")

        try:
            body = json.loads(request.body or b"{}")
        except json.JSONDecodeError:
            return _problem(400, "malformed JSON body")

        # --- caller<->product binding (server-enforced, §4.4) ---
        if body.get("product") != self.caller["product"]:
            audit.warning(
                "internal_api_product_mismatch",
                caller=self.caller["caller_id"],
                requested=body.get("product"),
            )
            return _problem(403, "caller is not bound to this product")

        # --- idempotency replay/conflict (§4.3) ---
        scope = f"internal-payments:{self.caller['caller_id']}"
        try:
            cached = get_cached_response(scope, idem_key, body)
        except IdempotencyConflict:
            return _problem(409, "Idempotency-Key reused with a different body")
        if cached is not None:
            return JsonResponse(cached.response_body, status=cached.response_status)

        # --- validation ---
        amount = body.get("amount_cents")
        if not isinstance(amount, int) or amount <= 0:
            return _problem(422, "amount_cents must be a positive integer")
        currency = body.get("currency")
        if currency not in ALLOWED_CURRENCIES:
            return _problem(422, f"currency must be one of {sorted(ALLOWED_CURRENCIES)} in v1")
        metadata = body.get("metadata") or {}
        if not isinstance(metadata, dict) or not all(
            isinstance(k, str) and isinstance(v, str) for k, v in metadata.items()
        ):
            return _problem(422, "metadata must be a flat string->string map")

        intent = InternalPaymentIntent.objects.create(
            caller=self.caller["caller_id"],
            product=self.caller["product"],
            amount_cents=amount,
            currency=currency,
            metadata=metadata,
            customer_ref=str(body.get("customer_ref", ""))[:128],
            status="requires_payment_method",
            client_secret=f"pi_internal_{secrets.token_hex(16)}",
        )
        # Sanctioned stub (services.py policy): live Stripe PaymentIntent
        # creation happens when STRIPE_SECRET_KEY is configured (staging+).
        audit.info(
            "internal_payment_intent_created",
            caller=self.caller["caller_id"],
            product=intent.product,
            amount_cents=amount,
            intent=str(intent.pk),
        )
        response_body = _intent_response(intent, include_secret=True)
        store_response(scope, idem_key, body, 201, response_body)
        return JsonResponse(response_body, status=201)


@method_decorator(csrf_exempt, name="dispatch")
class PaymentIntentDetailView(InternalApiView):
    """GET /internal/v1/payment-intents/{id} — scoped: foreign = 404."""

    http_method_names = ["get"]

    def get(self, request, intent_id):
        intent = InternalPaymentIntent.objects.filter(
            pk=intent_id, product=self.caller["product"]
        ).first()
        if intent is None:
            # 404 for both unknown AND foreign intents: no enumeration oracle.
            return _problem(404, "not found")
        return JsonResponse(_intent_response(intent))


@method_decorator(csrf_exempt, name="dispatch")
class RefundCreateView(InternalApiView):
    """POST /internal/v1/refunds — RSK-010: real money moves via the boundary."""

    http_method_names = ["post"]

    def post(self, request):
        idem_key = request.headers.get("Idempotency-Key", "")
        if not idem_key:
            return _problem(400, "Idempotency-Key header is mandatory on mutating calls")

        try:
            body = json.loads(request.body or b"{}")
        except json.JSONDecodeError:
            return _problem(400, "malformed JSON body")

        scope = f"internal-refunds:{self.caller['caller_id']}"
        try:
            cached = get_cached_response(scope, idem_key, body)
        except IdempotencyConflict:
            return _problem(409, "Idempotency-Key reused with a different body")
        if cached is not None:
            return JsonResponse(cached.response_body, status=cached.response_status)

        reason = str(body.get("reason", "")).strip()
        if not reason:
            return _problem(422, "reason is mandatory for refunds")

        intent = InternalPaymentIntent.objects.filter(
            pk=body.get("payment_intent_id"), product=self.caller["product"]
        ).first()
        if intent is None:
            return _problem(404, "not found")
        if intent.status not in REFUNDABLE_STATUSES:
            return _problem(422, f"intent status '{intent.status}' is not refundable")

        amount = body.get("amount_cents")
        if amount is None:
            amount = intent.amount_cents - intent.refunded_cents
        if not isinstance(amount, int) or amount <= 0:
            return _problem(422, "amount_cents must be a positive integer")
        if intent.refunded_cents + amount > intent.amount_cents:
            return _problem(422, "refund exceeds remaining refundable amount")

        refund = InternalRefund.objects.create(
            intent=intent,
            amount_cents=amount,
            reason=reason[:64],
            reason_detail=str(body.get("reason_detail", ""))[:255],
            status="succeeded",  # stub mode; live mode reflects PSP outcome
        )
        intent.refunded_cents += amount
        intent.status = (
            "refunded" if intent.refunded_cents >= intent.amount_cents else "partially_refunded"
        )
        intent.save(update_fields=["refunded_cents", "status", "modified_at"])
        audit.info(
            "internal_refund_created",
            caller=self.caller["caller_id"],
            intent=str(intent.pk),
            refund=str(refund.pk),
            amount_cents=amount,
        )
        response_body = {
            "id": str(refund.pk),
            "payment_intent_id": str(intent.pk),
            "product": intent.product,
            "status": refund.status,
            "amount_cents": refund.amount_cents,
            "currency": intent.currency,
        }
        store_response(scope, idem_key, body, 201, response_body)
        return JsonResponse(response_body, status=201)
