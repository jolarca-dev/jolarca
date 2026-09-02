"""Tax public API — B2B VAT ID validation at checkout.

Performs live VIES validation when the EU gateway is reachable.
Falls back to format-only validation with vies_available=False when
VIES is down. The UI must check vies_available before presenting
the result as "VIES-verified".
"""

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .vies_client import check_vat_live


@extend_schema(
    request=inline_serializer(name="VatIdValidate", fields={"vat_id": drf_serializers.CharField()}),
    responses=inline_serializer(
        name="VatIdValidateResult",
        fields={
            "vat_id": drf_serializers.CharField(),
            "valid": drf_serializers.BooleanField(),
            "country": drf_serializers.CharField(),
            "vies_checked": drf_serializers.BooleanField(),
            "vies_available": drf_serializers.BooleanField(),
            "source": drf_serializers.CharField(),
            "name": drf_serializers.CharField(),
            "address": drf_serializers.CharField(),
        },
    ),
)
class VatIdValidateView(APIView):
    """POST /api/v1/tax/vat-id/validate/ — live VIES VAT ID validation."""

    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        vat_id = str(request.data.get("vat_id", "")).strip()
        if not vat_id:
            return Response({"error": "vat_id_required"}, status=400)

        result = check_vat_live(vat_id)
        return Response(
            {
                "vat_id": result.vat_id,
                "valid": result.valid,
                "country": result.vat_id[:2] if result.valid else "",
                "vies_checked": result.vies_available and result.source != "format_only",
                "vies_available": result.vies_available,
                "source": result.source,
                "name": result.name,
                "address": result.address,
            }
        )
