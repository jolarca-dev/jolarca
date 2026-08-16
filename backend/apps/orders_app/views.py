"""Order API views."""

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .models import Cart


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
            order = services.checkout(
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
