"""Cart API — GAP-O01 (transaction loop entry point).

Consumer-driven against frontend/src/stores/cart-store.ts (parseServerCart
envelope: {cart_id, items:[{id, product_id, slug, title, price, currency,
quantity, image_url?, seller_id?, seller_name?}]}) and the optimistic
mutation hooks in frontend/src/hooks/use-cart.ts.

Posture:
 - Authenticated only (global IsAuthenticated default; guests live in the
   frontend localStorage draft and merge in via /cart/sync/ on login).
 - Server is the source of truth for prices/titles: lines always serialize
   from the LIVE listing, never from client-submitted values — a stale or
   forged client price must never reach checkout.
 - No inventory model exists yet, so the payload carries NO max_stock —
   filtering/capping on data we do not have would be fake UX (ADR-0007).
   MAX_LINE_QUANTITY is the only hard ceiling.
"""

from __future__ import annotations

from django.utils import translation
from django.utils.translation import get_language_from_request
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.products_app.models import ListingStatus, ProductListing

from .models import Cart, CartItem, CartStatus

MAX_LINE_QUANTITY = 99


def _serialize_item(item: CartItem) -> dict:
    """Live listing projection — title/price are NEVER echoed from the client."""
    listing = item.listing
    seller = listing.seller
    return {
        "id": str(item.pk),
        "product_id": str(listing.pk),
        # Matches ListingHomeSerializer.get_slug: the UUID is the public
        # /p/{slug} identifier.
        "slug": str(listing.pk),
        "title": listing.title,
        "price": f"{listing.price:.2f}",
        "currency": listing.currency,
        "quantity": item.quantity,
        "image_url": None,  # projection lands with the media pipeline
        "seller_id": str(seller.pk),
        "seller_name": seller.company_name,
    }


def _cart_envelope(cart: Cart | None) -> dict:
    if cart is None:
        return {"cart_id": None, "items": []}
    items = cart.items.select_related("listing__seller").order_by("created_at")
    return {"cart_id": str(cart.pk), "items": [_serialize_item(item) for item in items]}


def _parse_quantity(value) -> int | None:
    try:
        quantity = int(value)
    except (TypeError, ValueError):
        return None
    if not 1 <= quantity <= MAX_LINE_QUANTITY:
        return None
    return quantity


class _ItemResponseSchema(drf_serializers.Serializer):
    id = drf_serializers.CharField()
    product_id = drf_serializers.CharField()
    slug = drf_serializers.CharField()
    title = drf_serializers.CharField()
    price = drf_serializers.CharField()
    currency = drf_serializers.CharField()
    quantity = drf_serializers.IntegerField()


class _CartEnvelopeSchema(drf_serializers.Serializer):
    cart_id = drf_serializers.CharField(allow_null=True)
    items = _ItemResponseSchema(many=True)


@extend_schema(responses=_CartEnvelopeSchema)
class CartView(APIView):
    """GET /api/v1/cart/ — the authenticated user's active cart (GAP-O01).

    Read-only: a GET never creates the cart. Users without one receive an
    empty envelope (cart_id=null) — the frontend treats that as "draft only".
    """

    def get(self, request):
        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            cart = (
                Cart.objects.filter(user=request.user, status=CartStatus.ACTIVE)
                .order_by("-created_at")
                .first()
            )
            return Response(_cart_envelope(cart))


@extend_schema(
    request=inline_serializer(
        name="CartAddItem",
        fields={
            "product_id": drf_serializers.CharField(),
            "quantity": drf_serializers.IntegerField(required=False),
        },
    ),
    responses={201: _ItemResponseSchema},
)
class CartItemsView(APIView):
    """POST /api/v1/cart/items/ — add a published listing (GAP-O02).

    Adding the same listing again SUMS the quantity (capped) instead of
    duplicating the line (uniq_cart_item_listing constraint).
    """

    def post(self, request):
        listing = (
            ProductListing.objects.filter(
                pk=request.data.get("product_id", ""), status=ListingStatus.PUBLISHED
            )
            .select_related("seller")
            .first()
        )
        if listing is None:
            # Unpublished/unknown listings are indistinguishable on purpose.
            return Response({"error": "not_found"}, status=404)
        quantity = _parse_quantity(request.data.get("quantity", 1))
        if quantity is None:
            return Response({"error": "invalid_quantity"}, status=400)

        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            cart, _ = Cart.objects.get_or_create(user=request.user, status=CartStatus.ACTIVE)
            item = cart.items.filter(listing=listing).first()
            if item is not None:
                item.quantity = min(item.quantity + quantity, MAX_LINE_QUANTITY)
                item.save(update_fields=["quantity", "modified_at"])
            else:
                item = CartItem.objects.create(cart=cart, listing=listing, quantity=quantity)
            return Response(_serialize_item(item), status=201)


@extend_schema(
    request=inline_serializer(
        name="CartUpdateItem", fields={"quantity": drf_serializers.IntegerField()}
    ),
    responses={200: _ItemResponseSchema},
)
class CartItemDetailView(APIView):
    """PATCH/DELETE /api/v1/cart/items/{id}/ (GAP-O05/O06).

    Lines are scoped through the requester's ACTIVE cart: foreign or stale
    ids answer 404, never another user's data.
    """

    def _own_item(self, request, item_id: str) -> CartItem | None:
        return (
            CartItem.objects.filter(
                pk=item_id, cart__user=request.user, cart__status=CartStatus.ACTIVE
            )
            .select_related("listing__seller")
            .first()
        )

    def patch(self, request, item_id: str):
        quantity = _parse_quantity(request.data.get("quantity"))
        if quantity is None:
            return Response({"error": "invalid_quantity"}, status=400)
        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            item = self._own_item(request, item_id)
            if item is None:
                return Response({"error": "not_found"}, status=404)
            item.quantity = quantity
            item.save(update_fields=["quantity", "modified_at"])
            return Response(_serialize_item(item))

    def delete(self, request, item_id: str):
        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            item = self._own_item(request, item_id)
            if item is None:
                return Response({"error": "not_found"}, status=404)
            item.delete()
        return Response(status=204)


@extend_schema(
    request=inline_serializer(
        name="CartSync",
        fields={
            "items": drf_serializers.ListField(
                child=inline_serializer(
                    name="CartSyncLine",
                    fields={
                        "product_id": drf_serializers.CharField(),
                        "slug": drf_serializers.CharField(required=False),
                        "quantity": drf_serializers.IntegerField(required=False),
                    },
                )
            )
        },
    ),
    responses={200: _CartEnvelopeSchema},
)
class CartSyncView(APIView):
    """POST /api/v1/cart/sync/ — merge the guest draft on login (GAP-O07).

    Merge contract: same product present on both sides SUMS quantities
    (capped at MAX_LINE_QUANTITY); product data (title/price) always comes
    from the server's live listing — server wins on conflict. Unknown or
    unpublished ids are skipped silently: the draft is best-effort input,
    and punishing a login for a stale draft would be hostile UX. Responds
    with the full merged envelope so the caller can apply it in one pass.
    """

    def post(self, request):
        raw_items = request.data.get("items")
        if not isinstance(raw_items, list):
            return Response({"error": "invalid_items"}, status=400)

        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            # Start from the existing active cart (if any) so an empty
            # draft still answers with the current envelope.
            cart = (
                Cart.objects.filter(user=request.user, status=CartStatus.ACTIVE)
                .order_by("-created_at")
                .first()
            )
            for raw in raw_items:
                if not isinstance(raw, dict):
                    continue
                quantity = _parse_quantity(raw.get("quantity", 1))
                if quantity is None:
                    continue
                listing = ProductListing.objects.filter(
                    pk=raw.get("product_id", ""), status=ListingStatus.PUBLISHED
                ).first()
                if listing is None:
                    continue
                if cart is None:
                    cart, _ = Cart.objects.get_or_create(
                        user=request.user, status=CartStatus.ACTIVE
                    )
                item = cart.items.filter(listing=listing).first()
                if item is not None:
                    item.quantity = min(item.quantity + quantity, MAX_LINE_QUANTITY)
                    item.save(update_fields=["quantity", "modified_at"])
                else:
                    CartItem.objects.create(cart=cart, listing=listing, quantity=quantity)
            return Response(_cart_envelope(cart))
