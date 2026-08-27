"""Public shipping API — checkout delivery catalogue (GAP-H01/H02).

Posture: prices are marketplace policy (shipping_app.services.SHIPPING_RATES),
the locker directory is curated seed data (the live carrier APIs remain a
loud stub, MVP-H2) and the payload says so via "source": "curated".
"""

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .services import locker_directory, shipping_options

COUNTRIES = ("LT", "LV", "EE")


@extend_schema(
    request=inline_serializer(
        name="ShippingOptionsQuery",
        fields={"country": drf_serializers.ChoiceField(choices=list(COUNTRIES))},
    ),
    responses=inline_serializer(
        name="ShippingOptions",
        fields={
            "country": drf_serializers.CharField(),
            "options": drf_serializers.ListField(child=drf_serializers.DictField()),
        },
    ),
)
class ShippingOptionsView(APIView):
    """POST /api/v1/orders/shipping-options/ — per-country delivery methods."""

    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        country = str(request.data.get("country", "")).strip().upper()
        if country not in COUNTRIES:
            return Response({"error": "unsupported_country"}, status=400)
        return Response({"country": country, "options": shipping_options(country)})


@extend_schema(
    responses=inline_serializer(
        name="LockerDirectory",
        fields={
            "country": drf_serializers.CharField(),
            "carrier": drf_serializers.CharField(),
            "source": drf_serializers.CharField(),
            "lockers": drf_serializers.ListField(child=drf_serializers.DictField()),
        },
    ),
)
class LockerDirectoryView(APIView):
    """GET /api/v1/shipping/lockers/?country=…&carrier=… — locker picker data."""

    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def get(self, request):
        country = str(request.query_params.get("country", "")).strip().upper()
        carrier = str(request.query_params.get("carrier", "")).strip().lower()
        if country not in COUNTRIES:
            return Response({"error": "unsupported_country"}, status=400)
        if carrier not in ("dpd", "omniva"):
            return Response({"error": "unknown_carrier"}, status=400)
        return Response(
            {
                "country": country,
                "carrier": carrier,
                "source": "curated",
                "lockers": locker_directory(country, carrier),
            }
        )
