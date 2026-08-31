"""Public search API — lead-to-catalog discovery.

Privacy posture (ADR-0009): the main query travels as a JSON BODY via POST
so typed terms never land in access logs or browser history as URL query
strings. Palette suggestions stay GET (ephemeral, short, rate-throttled).

Ranking honesty (MVP-Q1): the postgres backend is an icontains + recency
STUB — the payload says so (`"ranking": "stub"`) and the frontend degrades
gracefully around it. SearchVector + GIN + trigram ranking replaces the
stub behind the same contract (SEARCH_BACKEND swap, no API change).
"""

from __future__ import annotations

import math

from django.utils import translation
from django.utils.text import slugify
from django.utils.translation import get_language_from_request
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers as drf_serializers
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from apps.products_app.models import ListingStatus, ProductListing
from apps.products_app.serializers import ListingHomeSerializer
from apps.sellers_app.models import SellerProfile, SellerStatus

from .services import search

# Recall pool pulled from the backend before commerce filters thin it.
RECALL_LIMIT = 200
PAGE_SIZE_DEFAULT = 24
PAGE_SIZE_MAX = 48
SUGGEST_LIMIT = 3


def _parse_pagination(data) -> tuple[int, int] | None:
    try:
        page = max(1, int(data.get("page", 1)))
        page_size = min(PAGE_SIZE_MAX, max(1, int(data.get("page_size", PAGE_SIZE_DEFAULT))))
    except (TypeError, ValueError):
        return None
    return page, page_size


@extend_schema(
    request=inline_serializer(
        name="SearchQuery",
        fields={
            "q": drf_serializers.CharField(),
            "page": drf_serializers.IntegerField(required=False),
            "page_size": drf_serializers.IntegerField(required=False),
            "category": drf_serializers.CharField(required=False),
            "price_min": drf_serializers.CharField(required=False),
            "price_max": drf_serializers.CharField(required=False),
            "seller": drf_serializers.CharField(required=False),
            "availability": drf_serializers.CharField(required=False),
            "delivery": drf_serializers.CharField(required=False),
        },
    ),
    responses=inline_serializer(
        name="SearchResults",
        fields={
            "results": ListingHomeSerializer(many=True),
            "page": drf_serializers.IntegerField(),
            "total_pages": drf_serializers.IntegerField(),
            "ranking": drf_serializers.CharField(),
        },
    ),
)
class SearchView(APIView):
    """POST /api/v1/search/ — full-text search over published listings (GAP-S01).

    Commerce filters (category slug, price range, seller name fragment)
    apply server-side after the recall pool. `availability`/`delivery` are
    accepted but no-ops until inventory/shipping models land — filtering on
    data we do not have would be fake UX (ADR-0007).
    """

    permission_classes = [AllowAny]
    authentication_classes: list[type[BaseAuthentication]] = []
    throttle_classes = [AnonRateThrottle]

    def post(self, request):
        from decimal import Decimal, InvalidOperation

        q = str(request.data.get("q", "")).strip()
        if not q:
            return Response({"error": "invalid_query"}, status=400)
        pagination = _parse_pagination(request.data)
        if pagination is None:
            return Response({"error": "invalid_pagination"}, status=400)
        page, page_size = pagination

        price_min = price_max = None
        try:
            if request.data.get("price_min"):
                price_min = Decimal(str(request.data["price_min"]))
            if request.data.get("price_max"):
                price_max = Decimal(str(request.data["price_max"]))
        except InvalidOperation:
            return Response({"error": "invalid_price"}, status=400)
        category_slug = str(request.data.get("category", "")).strip()
        seller_fragment = str(request.data.get("seller", "")).strip()

        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            hits = search(q, locale=language, limit=RECALL_LIMIT)
            listings = ProductListing.objects.filter(
                pk__in=[h["id"] for h in hits], status=ListingStatus.PUBLISHED
            ).select_related("seller")
            by_id = {str(listing.pk): listing for listing in listings}
            # Preserve the backend's ranking order (stub: recency within
            # the icontains match set — honest until GIN/trigram lands).
            ranked = [by_id[hit["id"]] for hit in hits if hit["id"] in by_id]

            if category_slug:
                ranked = [item for item in ranked if item.category.slug == category_slug]
            if price_min is not None:
                ranked = [item for item in ranked if item.price >= price_min]
            if price_max is not None:
                ranked = [item for item in ranked if item.price <= price_max]
            if seller_fragment:
                fragment = seller_fragment.casefold()
                ranked = [
                    item
                    for item in ranked
                    if fragment in (item.seller.company_name or "").casefold()
                    or fragment in slugify(item.seller.company_name)
                ]

            total = len(ranked)
            total_pages = max(1, math.ceil(total / page_size))
            start = (page - 1) * page_size
            payload = {
                "results": ListingHomeSerializer(ranked[start : start + page_size], many=True).data,
                "page": page,
                "total_pages": total_pages,
                "ranking": "stub",
            }
        return Response(payload)


@extend_schema(
    responses=inline_serializer(
        name="SearchSuggestions",
        fields={
            "categories": drf_serializers.ListField(child=drf_serializers.DictField()),
            "products": ListingHomeSerializer(many=True),
            "sellers": drf_serializers.ListField(child=drf_serializers.DictField()),
        },
    ),
)
class SearchSuggestView(APIView):
    """GET /api/v1/search/suggest/ — command-palette suggestions (GAP-S02).

    Tiny result sets by design (3 per facet); suggestions are ephemeral
    keystroke aids, so a light GET is acceptable here while the full query
    stays POST-only.
    """

    permission_classes = [AllowAny]
    authentication_classes: list[type[BaseAuthentication]] = []
    throttle_classes = [AnonRateThrottle]

    def get(self, request):
        from apps.products_app.models import Category

        q = request.query_params.get("q", "").strip()
        if not q:
            return Response({"categories": [], "products": [], "sellers": []})

        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            categories = Category.objects.filter(name__icontains=q)[:SUGGEST_LIMIT]
            sellers = SellerProfile.objects.filter(
                status=SellerStatus.VERIFIED, company_name__icontains=q
            )[:SUGGEST_LIMIT]
            hits = search(q, locale=language, limit=SUGGEST_LIMIT)
            products = ProductListing.objects.filter(
                pk__in=[h["id"] for h in hits], status=ListingStatus.PUBLISHED
            ).select_related("seller")

            payload = {
                "categories": [{"slug": c.slug, "name": c.name} for c in categories],
                "products": ListingHomeSerializer(products, many=True).data,
                "sellers": [
                    {"slug": slugify(s.company_name), "name": s.company_name} for s in sellers
                ],
            }
        return Response(payload)
