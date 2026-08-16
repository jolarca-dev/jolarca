"""Payments service layer — the single Stripe boundary.

Sanctioned-stub policy: when STRIPE_SECRET_KEY is unset, functions raise
PaymentsNotConfigured (a loud, catchable state) rather than pretending to
succeed. Callers (orders_app.checkout) treat that as a valid MVP state.
"""

from __future__ import annotations

import structlog
from django.conf import settings

audit = structlog.get_logger("jol.audit")


class PaymentsNotConfigured(Exception):
    """STRIPE_SECRET_KEY absent — payments integration is switched off."""


def _stripe():
    """Lazy SDK import: keeps the boundary visible and avoids hard dep at boot."""
    if not settings.STRIPE_SECRET_KEY:
        raise PaymentsNotConfigured("STRIPE_SECRET_KEY is not configured.")
    try:
        import stripe
    except ImportError as exc:  # pragma: no cover — dep listed in pyproject
        raise PaymentsNotConfigured("stripe SDK not installed") from exc
    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


def create_payment_intent(order) -> str:
    """Create a PaymentIntent for the order gross amount. Returns client-secret-less id.

    Split payouts: transfer_data.destination is set per-seller in the
    multi-seller order flow (MVP pays single-seller orders first — MVP-Y1).
    """
    stripe = _stripe()
    intent = stripe.PaymentIntent.create(
        amount=int(order.total_gross * 100),
        currency=order.currency.lower(),
        metadata={"order_id": str(order.pk), "order_number": order.number},
        automatic_payment_methods={"enabled": True},
    )
    from .models import PaymentRecord

    PaymentRecord.objects.update_or_create(
        order=order,
        defaults={
            "payment_intent_id": intent["id"],
            "amount": order.total_gross,
            "currency": order.currency,
            "status": intent["status"],
        },
    )
    audit.info("payment_intent_created", order_id=str(order.pk), intent=intent["id"])
    return intent["id"]


def connect_onboarding(seller_profile) -> str:
    """Create/return the Stripe Connect account id for a seller (KYC via Stripe).

    The seller's stripe_account_id is written by sellers_app from our return
    value — this module never writes outside its own tables.
    """
    stripe = _stripe()
    if seller_profile.stripe_account_id:
        return seller_profile.stripe_account_id
    account = stripe.Account.create(
        type="express",
        country=seller_profile.country,
        capabilities={"card_payments": {"requested": True}, "transfers": {"requested": True}},
        business_type="company",
        metadata={"seller_id": str(seller_profile.pk)},
    )
    audit.info("stripe_connect_account_created", seller_id=str(seller_profile.pk))
    return account["id"]


def refund(order, amount=None) -> str:
    stripe = _stripe()
    record = order.payment
    params = {"payment_intent": record.payment_intent_id}
    if amount is not None:
        params["amount"] = int(amount * 100)
    refund_obj = stripe.Refund.create(**params)
    audit.info("refund_created", order_id=str(order.pk), refund=refund_obj["id"])
    return refund_obj["id"]


def stripe_tax_calc(*, net_amount, ship_country: str, seller_country: str):
    """Stripe Tax calculation entry point consumed by tax_app.

    Sanctioned stub (MVP-T2) until Stripe Tax registration is complete;
    tax_app falls back to VatRateSnapshot tables meanwhile.
    """
    if not settings.STRIPE_TAX_ENABLED:
        raise PaymentsNotConfigured("Stripe Tax is disabled (STRIPE_TAX_ENABLED=0).")
    raise NotImplementedError("MVP-T2: Stripe Tax calculation not yet wired")
