"""Tax public API — B2B VAT ID validation at checkout (GAP-T01).

Honest contract: this endpoint FORMAT-VALIDATES the VAT ID. The live VIES
gateway is unwired (MVP-T3), so the response carries "vies_checked": false
— the UI must never present a format pass as VIES confirmation.
"""

from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .services import vat_id_format_valid


@extend_schema(
    request=inline_serializer(name="VatIdValidate", fields={"vat_id": drf_serializers.CharField()}),
    responses=inline_serializer(
        name="VatIdValidateResult",
        fields={
            "vat_id": drf_serializers.CharField(),
            "valid": drf_serializers.BooleanField(),
            "country": drf_serializers.CharField(),
            "vies_checked": drf_serializers.BooleanField(),
        },
    ),
)
class VatIdValidateView(APIView):
    """POST /api/v1/tax/vat-id/validate/ — Baltic VAT ID format check."""

    permission_classes = [AllowAny]
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        vat_id = str(request.data.get("vat_id", "")).strip()
        if not vat_id:
            return Response({"error": "vat_id_required"}, status=400)
        valid, country = vat_id_format_valid(vat_id)
        return Response(
            {
                "vat_id": vat_id,
                "valid": valid,
                "country": country if valid else "",
                "vies_checked": False,
            }
        )
