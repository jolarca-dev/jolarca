"""Order API views."""

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.idempotency import IdempotencyConflict
from apps.products_app.models import ListingStatus, ProductListing
from apps.shipping_app.services import shipping_options
from apps.tax_app.services import vat_id_format_valid

from . import services
from .models import Cart, CartStatus, Order

ORDER_LINE_QUANTITY_MAX = 99


class CheckoutSerializer(serializers.Serializer):
    cart_id = serializers.UUIDField()
    shipping_country = serializers.ChoiceField(
        choices=["LT", "LV", "EE"], required=False, default=""
    )


class CheckoutResponseSerializer(serializers.Serializer):
    order_id = serializers.UUIDField()
    order_number = serializers.CharField()
    status = serializers.CharField()
    total_gross = serializers.DecimalField(max_digits=12, decimal_places=2)
    currency = serializers.CharField()


@extend_schema(request=CheckoutSerializer, responses={201: CheckoutResponseSerializer})
class CheckoutView(APIView):
    """POST /api/v1/orders/checkout/ — requires the Idempotency-Key header."""

    def post(self, request):
        idempotency_key = request.headers.get("Idempotency-Key", "")
        if not idempotency_key:
            return Response(
                {
                    "error": "idempotency_key_required",
                    "detail": "Provide an Idempotency-Key header for checkout.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = CheckoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        cart = Cart.objects.filter(
            pk=serializer.validated_data["cart_id"], user=request.user
        ).first()
        if cart is None:
            return Response({"error": "cart_not_found"}, status=status.HTTP_404_NOT_FOUND)

        try:
            order, _ = services.checkout(
                cart,
                idempotency_key=idempotency_key,
                shipping_country=serializer.validated_data["shipping_country"],
            )
        except services.CheckoutError as exc:
            return Response({"error": "checkout_failed", "detail": str(exc)}, status=409)

        return Response(
            {
                "order_id": str(order.pk),
                "order_number": order.number,
                "status": order.status,
                "total_gross": str(order.total_gross),
                "currency": order.currency,
            },
            status=status.HTTP_201_CREATED,
        )


class _OrderAddressSerializer(serializers.Serializer):
    full_name = serializers.CharField(min_length=2, max_length=255)
    street = serializers.CharField(min_length=3, max_length=255)
    city = serializers.CharField(min_length=2, max_length=128)
    postal_code = serializers.CharField(min_length=3, max_length=16)
    country = serializers.ChoiceField(choices=["LT", "LV", "EE"])
    phone = serializers.CharField(min_length=7, max_length=24)


class _OrderLineSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=ORDER_LINE_QUANTITY_MAX)


class _OrderShippingSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=["courier", "dpd_locker", "omniva_locker"])
    locker_id = serializers.CharField(required=False, allow_blank=True, max_length=32)
    address = _OrderAddressSerializer()


class OrderCreateSerializer(serializers.Serializer):
    """Either an existing active cart OR explicit lines — never both needed."""

    cart_id = serializers.UUIDField(required=False)
    items = _OrderLineSerializer(many=True, required=False)
    shipping = _OrderShippingSerializer()
    vat_id = serializers.CharField(required=False, allow_blank=True, max_length=32)


_ORDER_CREATE_RESPONSE = inline_serializer(
    name="OrderCreated",
    fields={
        "order_id": serializers.UUIDField(),
        "order_number": serializers.CharField(),
        "status": serializers.CharField(),
        "total_gross": serializers.CharField(),
        "currency": serializers.CharField(),
        "client_secret": serializers.CharField(allow_null=True),
    },
)


@extend_schema(request=OrderCreateSerializer, responses={201: _ORDER_CREATE_RESPONSE})
class OrderCreateView(APIView):
    """POST /api/v1/orders/ — order creation for the embedded Payment
    Element (GAP-O08, SAQ-A): returns the PaymentIntent client secret so the
    browser confirms payment directly with Stripe. Card data never touches
    this server. Requires the Idempotency-Key header (retry safety on the
    money path)."""

    def post(self, request):
        idempotency_key = request.headers.get("Idempotency-Key", "")
        if not idempotency_key:
            return Response(
                {
                    "error": "idempotency_key_required",
                    "detail": "Provide an Idempotency-Key header.",
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        shipping = data["shipping"]
        address = shipping["address"]
        country = address["country"]

        # Delivery method must actually be offered for the destination.
        offered = {option["id"] for option in shipping_options(country)}
        if shipping["method"] not in offered:
            return Response({"error": "delivery_method_unavailable"}, status=400)

        vat_id = (data.get("vat_id") or "").strip()
        if vat_id:
            valid, _ = vat_id_format_valid(vat_id)
            if not valid:
                return Response({"error": "invalid_vat_id"}, status=400)
            vat_id = vat_id.replace(" ", "").replace(".", "").replace("-", "").upper()

        try:
            lines = self._resolve_lines(request, data)
        except serializers.ValidationError:
            return Response(
                {"error": "not_found", "detail": "Unknown or unpublished item."}, status=404
            )
        if not lines:
            return Response({"error": "empty_order"}, status=400)

        try:
            order, client_secret = services.place_order(
                request.user,
                lines=lines,
                shipping_method=shipping["method"],
                address=address,
                locker_id=shipping.get("locker_id", ""),
                vat_id=vat_id,
                idempotency_key=idempotency_key,
            )
        except IdempotencyConflict:
            return Response({"error": "idempotency_conflict"}, status=409)
        except services.CheckoutError as exc:
            return Response({"error": "checkout_failed", "detail": str(exc)}, status=409)

        return Response(
            {
                "order_id": str(order.pk),
                "order_number": order.number,
                "status": order.status,
                "total_gross": str(order.total_gross),
                "currency": order.currency,
                "client_secret": client_secret,
            },
            status=status.HTTP_201_CREATED,
        )

    @staticmethod
    def _resolve_lines(request, data: dict) -> list[tuple]:
        """Prefer the user's active cart (server-held quantities); fall back
        to explicit items. Listings are re-loaded here — prices are never
        accepted from the client."""
        if data.get("cart_id"):
            cart = Cart.objects.filter(
                pk=data["cart_id"], user=request.user, status=CartStatus.ACTIVE
            ).first()
            if cart is None:
                raise serializers.ValidationError("cart_not_found")
            return [
                (item.listing, item.quantity)
                for item in cart.items.select_related("listing").filter(
                    listing__status=ListingStatus.PUBLISHED
                )
            ]
        raw_items = data.get("items") or []
        listings = {
            listing.pk: listing
            for listing in ProductListing.objects.filter(
                pk__in=[line["product_id"] for line in raw_items],
                status=ListingStatus.PUBLISHED,
            )
        }
        lines = []
        for line in raw_items:
            listing = listings.get(line["product_id"])
            if listing is None:
                raise serializers.ValidationError("not_found")
            lines.append((listing, line["quantity"]))
        return lines


@extend_schema(
    responses=inline_serializer(
        name="OrderList",
        fields={
            "results": serializers.ListField(
                child=inline_serializer(
                    name="OrderListEntry",
                    fields={
                        "order_id": serializers.UUIDField(),
                        "order_number": serializers.CharField(),
                        "status": serializers.CharField(),
                        "total_gross": serializers.CharField(),
                        "currency": serializers.CharField(),
                        "created_at": serializers.DateTimeField(),
                    },
                )
            )
        },
    )
)
class OrderListView(APIView):
    """GET /api/v1/orders/ — the buyer's order history (GAP-O03)."""

    HISTORY_LIMIT = 50

    def get(self, request):
        orders = Order.objects.filter(buyer=request.user).order_by("-created_at")[
            : self.HISTORY_LIMIT
        ]
        return Response(
            {
                "results": [
                    {
                        "order_id": str(order.pk),
                        "order_number": order.number,
                        "status": order.status,
                        "total_gross": str(order.total_gross),
                        "currency": order.currency,
                        "created_at": order.created_at,
                    }
                    for order in orders
                ]
            }
        )


@extend_schema(
    responses=inline_serializer(
        name="OrderDetail",
        fields={
            "order_id": serializers.UUIDField(),
            "order_number": serializers.CharField(),
            "status": serializers.CharField(),
            "currency": serializers.CharField(),
            "total_gross": serializers.CharField(),
            "shipping_fee": serializers.CharField(),
            "shipping_method": serializers.CharField(),
            "eta_days": serializers.CharField(allow_null=True),
            "items": serializers.ListField(child=serializers.DictField()),
        },
    )
)
class OrderDetailView(APIView):
    """GET /api/v1/orders/{id}/ — confirmation + tracking entry (GAP-O04).

    Scoped to the buyer: foreign ids answer 404 (no existence leak)."""

    def get(self, request, order_id):
        from apps.shipping_app.services import SHIPPING_RATES

        order = Order.objects.filter(pk=order_id, buyer=request.user).first()
        if order is None:
            return Response({"error": "not_found"}, status=status.HTTP_404_NOT_FOUND)

        eta_days = None
        for option in SHIPPING_RATES.get(order.shipping_country.upper(), []):
            if option["id"] == order.shipping_method:
                eta_days = option["eta_days"]
                break

        return Response(
            {
                "order_id": str(order.pk),
                "order_number": order.number,
                "status": order.status,
                "currency": order.currency,
                "total_gross": str(order.total_gross),
                "shipping_fee": str(order.shipping_fee),
                "shipping_method": order.shipping_method,
                "eta_days": eta_days,
                "items": [
                    {
                        "title": item.title_snapshot,
                        "unit_price": str(item.unit_price),
                        "quantity": item.quantity,
                        "line_total": str(item.unit_price * item.quantity),
                    }
                    for item in order.items.all()
                ],
            }
        )
