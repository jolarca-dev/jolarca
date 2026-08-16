"""Order service layer: checkout is the money path — idempotent, audited,
and transactional. Never bypass core.idempotency here."""

from __future__ import annotations

from decimal import Decimal

import structlog
from django.db import transaction

from apps.core import idempotency

from .models import Cart, CartStatus, Order, OrderItem

audit = structlog.get_logger("jol.audit")

CHECKOUT_SCOPE = "orders.checkout"


class CheckoutError(Exception):
    pass


def _next_order_number() -> str:
    from django.utils import timezone

    seq = Order.objects.count() + 1
    return f"JOL-{timezone.now():%Y}-{seq:06d}"


@transaction.atomic
def checkout(cart: Cart, *, idempotency_key: str, shipping_country: str = "") -> Order:
    """Convert an active cart into an Order.

    - Idempotent: same key+payload replays the stored outcome.
    - Snapshots prices/titles (consumer-law evidence).
    - Tax computed by tax_app; payment intent requested via payments_app.
    """
    payload = {
        "cart_id": str(cart.pk),
        "items": sorted(
            (str(item.listing_id), item.quantity) for item in cart.items.select_related("listing")
        ),
    }

    cached = idempotency.get_cached_response(CHECKOUT_SCOPE, idempotency_key, payload)
    if cached is not None and cached.response_body:
        return Order.objects.get(pk=cached.response_body["order_id"])

    if cart.status != CartStatus.ACTIVE:
        raise CheckoutError(f"Cart is not active (status={cart.status}).")
    items = list(cart.items.select_related("listing", "listing__seller"))
    if not items:
        raise CheckoutError("Cart is empty.")

    order = Order(
        number=_next_order_number(),
        buyer=cart.user,
        shipping_country=shipping_country,
        idempotency_key=idempotency_key,
    )

    total_net = Decimal("0.00")
    for item in items:
        listing = item.listing
        if listing.price is None:
            raise CheckoutError(f"Listing {listing.pk} has no price.")
        total_net += listing.price * item.quantity

    # Tax domain owns VAT computation (Stripe Tax or snapshot fallback).
    from apps.tax_app.services import calculate_for_order

    tax_result = calculate_for_order(
        order_items=[], ship_country=shipping_country, net_total=total_net
    )
    order.total_net = total_net
    order.total_vat = tax_result.vat_amount
    order.total_gross = total_net + tax_result.vat_amount

    order.save()
    OrderItem.objects.bulk_create(
        OrderItem(
            order=order,
            listing=item.listing,
            title_snapshot=item.listing.title,
            unit_price=item.listing.price,
            quantity=item.quantity,
            seller_id=item.listing.seller_id,
        )
        for item in items
    )

    cart.status = CartStatus.CHECKED_OUT
    cart.save(update_fields=["status", "modified_at"])

    # Payment intent via the single Stripe boundary. Not-configured is a
    # valid MVP state — order stays PENDING until payments is wired.
    from apps.payments_app.services import PaymentsNotConfigured, create_payment_intent

    try:
        create_payment_intent(order)
    except (PaymentsNotConfigured, NotImplementedError):
        audit.warning("checkout_without_payment_intent", order_id=str(order.pk))

    idempotency.store_response(
        CHECKOUT_SCOPE,
        idempotency_key,
        payload,
        status=201,
        body={"order_id": str(order.pk), "order_number": order.number},
    )
    audit.info("checkout_completed", order_id=str(order.pk), gross=str(order.total_gross))
    return order
