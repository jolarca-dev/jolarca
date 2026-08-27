"""Order service layer: checkout is the money path — idempotent, audited,
and transactional. Never bypass core.idempotency here."""

from __future__ import annotations

from decimal import Decimal

import structlog
from django.db import transaction

from apps.core import idempotency

from .models import Cart, CartItem, CartStatus, Order, OrderItem

audit = structlog.get_logger("jol.audit")

CHECKOUT_SCOPE = "orders.checkout"
PLACE_ORDER_SCOPE = "orders.place"


class CheckoutError(Exception):
    pass


def _next_order_number(offset: int = 0) -> str:
    """Sequential per-year number derived from the MAX existing sequence.

    count()+1 collides whenever any order row is deleted (e.g. test-data
    cleanup) because the sequence collapses onto numbers still in use —
    the unique constraint then 500s the money path. Max-based derivation
    plus the save-retry in checkout() makes it race-safe.
    """
    from django.utils import timezone

    prefix = f"JOL-{timezone.now():%Y}-"
    seq = offset
    for number in Order.objects.filter(number__startswith=prefix).values_list("number", flat=True):
        try:
            seq = max(seq, int(number[len(prefix) :]))
        except ValueError:
            continue  # foreign-format numbers never block the sequence
    return f"{prefix}{seq + 1:06d}"


def _client_secret_for(order) -> str | None:
    """Client secret for an order's PaymentIntent; None while payments are
    unconfigured (order legitimately stays pending — honest, not faked)."""
    from apps.payments_app.services import (
        PaymentsNotConfigured,
        client_secret_for_order,
    )

    try:
        return client_secret_for_order(order)
    except (PaymentsNotConfigured, NotImplementedError):
        return None


@transaction.atomic
def checkout(
    cart: Cart,
    *,
    idempotency_key: str,
    shipping_country: str = "",
    shipping_method: str = "",
    shipping_locker_id: str = "",
    shipping_fee: Decimal = Decimal("0.00"),
    address: dict | None = None,
    buyer_vat_id: str = "",
) -> tuple[Order, str | None]:
    """Convert an active cart into an Order + PaymentIntent client secret.

    - Idempotent: same key+payload replays the stored outcome (the secret
      is re-fetched from Stripe for the stored order).
    - Snapshots prices/titles (consumer-law evidence).
    - Tax computed by tax_app over goods + shipping fee; payment intent
      requested via payments_app (SAQ-A: the secret goes to the browser,
      card data never touches this app).
    Returns (order, client_secret) — secret is None while payments are off.
    """
    payload = {
        "cart_id": str(cart.pk),
        "items": sorted(
            (str(item.listing_id), item.quantity) for item in cart.items.select_related("listing")
        ),
    }

    cached = idempotency.get_cached_response(CHECKOUT_SCOPE, idempotency_key, payload)
    if cached is not None and cached.response_body:
        order = Order.objects.get(pk=cached.response_body["order_id"])
        return order, _client_secret_for(order)

    if cart.status != CartStatus.ACTIVE:
        raise CheckoutError(f"Cart is not active (status={cart.status}).")
    items = list(cart.items.select_related("listing", "listing__seller"))
    if not items:
        raise CheckoutError("Cart is empty.")

    address = address or {}
    order = Order(
        number=_next_order_number(),
        buyer=cart.user,
        shipping_country=shipping_country,
        shipping_method=shipping_method,
        shipping_locker_id=shipping_locker_id,
        shipping_fee=shipping_fee,
        ship_full_name=str(address.get("full_name", "")),
        ship_street=str(address.get("street", "")),
        ship_city=str(address.get("city", "")),
        ship_postal_code=str(address.get("postal_code", "")),
        ship_phone=str(address.get("phone", "")),
        buyer_vat_id=buyer_vat_id,
        idempotency_key=idempotency_key,
    )

    goods_net = Decimal("0.00")
    for item in items:
        listing = item.listing
        if listing.price is None:
            raise CheckoutError(f"Listing {listing.pk} has no price.")
        goods_net += listing.price * item.quantity

    # Tax domain owns VAT computation (Stripe Tax or snapshot fallback);
    # the shipping fee joins the taxable base.
    from apps.tax_app.services import TaxError, calculate_for_order

    try:
        tax_result = calculate_for_order(
            order_items=[], ship_country=shipping_country, net_total=goods_net + shipping_fee
        )
    except TaxError as exc:
        # Missing rate snapshots are an ops problem, but the buyer must get
        # an actionable refusal, not a 500 on the money path.
        raise CheckoutError(f"Tax calculation unavailable: {exc}") from exc
    order.total_net = goods_net + shipping_fee
    order.total_vat = tax_result.vat_amount
    order.total_gross = order.total_net + tax_result.vat_amount

    # Unique order number is finalized at save; concurrent checkouts can
    # race to the same sequence, so retry with a fresh number on collision.
    # The savepoint keeps a collision from poisoning the outer transaction.
    from django.db import IntegrityError

    for attempt in range(5):
        order.number = _next_order_number(offset=attempt)
        try:
            with transaction.atomic():
                order.save()
            break
        except IntegrityError:
            if attempt == 4:
                raise
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

    client_secret = None
    try:
        client_secret = create_payment_intent(order)
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
    return order, client_secret


@transaction.atomic
def place_order(
    user,
    *,
    lines: list[tuple],
    shipping_method: str,
    address: dict,
    locker_id: str = "",
    vat_id: str = "",
    idempotency_key: str,
) -> tuple[Order, str | None]:
    """GAP-O08: create an order straight from catalog lines (the embedded
    Payment Element flow). The lines are validated PUBLISHED listings by the
    view; prices are read from the listings here — client-supplied money
    values are never accepted.

    Idempotency payload is built from the lines + shipping choices (stable
    across retries — it must NOT embed per-attempt ids like a fresh cart).
    """
    from apps.shipping_app.services import shipping_fee

    country = str(address.get("country", "")).upper()
    payload = {
        "lines": sorted((str(listing.pk), quantity) for listing, quantity in lines),
        "ship_country": country,
        "shipping_method": shipping_method,
        "vat_id": vat_id,
    }

    cached = idempotency.get_cached_response(PLACE_ORDER_SCOPE, idempotency_key, payload)
    if cached is not None and cached.response_body:
        order = Order.objects.get(pk=cached.response_body["order_id"])
        return order, _client_secret_for(order)

    if not lines:
        raise CheckoutError("Cart is empty.")

    fee = shipping_fee(country, shipping_method)
    if fee is None:
        raise CheckoutError(f"Delivery method '{shipping_method}' is not offered for {country}.")

    # The cart row doubles as fulfillment lineage (snapshot evidence).
    cart = Cart.objects.create(user=user, status=CartStatus.ACTIVE)
    CartItem.objects.bulk_create(
        CartItem(cart=cart, listing=listing, quantity=quantity) for listing, quantity in lines
    )

    order, client_secret = checkout(
        cart,
        idempotency_key=f"place:{idempotency_key}",
        shipping_country=country,
        shipping_method=shipping_method,
        shipping_locker_id=locker_id,
        shipping_fee=Decimal(fee),
        address=address,
        buyer_vat_id=vat_id,
    )

    idempotency.store_response(
        PLACE_ORDER_SCOPE,
        idempotency_key,
        payload,
        status=201,
        body={"order_id": str(order.pk), "order_number": order.number},
    )
    return order, client_secret
