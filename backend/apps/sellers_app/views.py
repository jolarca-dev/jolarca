"""Public seller storefront endpoints (GAP-V05/V06).

Visibility rule: only VERIFIED sellers are addressable; every other
status (draft/submitted/rejected/suspended) and unknown slugs return the
same 404 — no enumeration of onboarding state.
"""

from __future__ import annotations

from django.utils import translation
from django.utils.text import slugify
from django.utils.translation import get_language_from_request
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.products_app.models import ListingStatus, ProductListing
from apps.products_app.serializers import ListingHomeSerializer

from .models import SellerProfile, SellerStatus
from .serializers import PublicSellerSerializer, SellerProductsPageSerializer


def seller_by_slug(slug: str) -> SellerProfile | None:
    """Reverse the derived slug (slugify of company name) for VERIFIED
    sellers only; everything else is a 404 by design."""
    for seller in SellerProfile.objects.filter(status=SellerStatus.VERIFIED):
        if slugify(seller.company_name) == slug:
            return seller
    return None


@extend_schema(responses=PublicSellerSerializer)
class SellerDetailView(APIView):
    """GET /api/v1/sellers/{slug}/ — public seller profile (GAP-V05)."""

    permission_classes = [AllowAny]
    authentication_classes: list[type[BaseAuthentication]] = []
    throttle_classes = [AnonRateThrottle]

    def get(self, request, slug: str):
        seller = seller_by_slug(slug)
        if seller is None:
            return Response({"error": "not_found"}, status=404)
        return Response(PublicSellerSerializer(seller).data)


@extend_schema(
    responses=SellerProductsPageSerializer,
    parameters=[
        OpenApiParameter("page", int, OpenApiParameter.QUERY, required=False),
        OpenApiParameter("page_size", int, OpenApiParameter.QUERY, required=False),
    ],
)
class SellerProductsView(APIView):
    """GET /api/v1/sellers/{slug}/products/ — storefront grid (GAP-V06)."""

    permission_classes = [AllowAny]
    authentication_classes: list[type[BaseAuthentication]] = []
    throttle_classes = [AnonRateThrottle]

    def get(self, request, slug: str):
        seller = seller_by_slug(slug)
        if seller is None:
            return Response({"error": "not_found"}, status=404)

        try:
            page = max(1, int(request.query_params.get("page", "1")))
            page_size = min(48, max(1, int(request.query_params.get("page_size", "24"))))
        except ValueError:
            return Response({"error": "invalid_pagination"}, status=400)

        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            qs = (
                ProductListing.objects.filter(seller=seller, status=ListingStatus.PUBLISHED)
                .select_related("seller")
                .order_by("-published_at", "pk")
            )
            count = qs.count()
            start = (page - 1) * page_size
            payload = {
                "count": count,
                "page": page,
                "page_size": page_size,
                "results": ListingHomeSerializer(qs[start : start + page_size], many=True).data,
            }
        return Response(payload)
