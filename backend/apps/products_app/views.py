"""Public storefront catalog views — read-only browse surface.

Anonymous by design (public catalog); writes never happen here — listing
mutations live behind sellers_app services + moderation. Content language
follows Accept-Language via modeltranslation (no LocaleMiddleware on the
API stack, so the view activates the language explicitly).
"""

from django.utils import translation
from django.utils.translation import get_language_from_request
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.authentication import BaseAuthentication
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView

from .models import Category, HomeHeroContent, ListingStatus, ProductListing
from .serializers import (
    CategoryHomeSerializer,
    CategoryPickerSerializer,
    CategoryProductsPageSerializer,
    HeroSerializer,
    HomeContentSerializer,
    ListingDetailSerializer,
    ListingHomeSerializer,
)

CURATED_CATEGORY_LIMIT = 8
FEATURED_LIMIT = 8
RELATED_LIMIT = 4


@extend_schema(responses=HomeContentSerializer)
class CatalogHomeView(APIView):
    """GET /api/v1/catalog/home/ — hero + curated categories + featured rail.

    Curation is explicit and editorial (Category.homepage_rank,
    ProductListing.is_featured): nothing "trending" is synthesized from
    behavioral data — zero analytics until consent infra v2.
    """

    permission_classes = [AllowAny]
    authentication_classes: list[type[BaseAuthentication]] = []  # public catalog
    throttle_classes = [AnonRateThrottle]  # same anon floor as registration

    def get(self, request):
        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            hero = HomeHeroContent.objects.filter(active=True).order_by("-modified_at").first()
            categories = Category.objects.filter(homepage_rank__isnull=False).order_by(
                "homepage_rank"
            )[:CURATED_CATEGORY_LIMIT]
            featured = (
                ProductListing.objects.filter(status=ListingStatus.PUBLISHED, is_featured=True)
                .select_related("seller")
                .order_by("-published_at")[:FEATURED_LIMIT]
            )
            payload = {
                # Micro-CMS: admin-managed hero; null when nothing is
                # active and the frontend renders no hero (ADR-0007).
                "hero": HeroSerializer(hero).data if hero else None,
                "categories": CategoryHomeSerializer(categories, many=True).data,
                "featured": ListingHomeSerializer(featured, many=True).data,
            }
        return Response(payload)


@extend_schema(responses=ListingDetailSerializer)
class ProductDetailView(APIView):
    """GET /api/v1/products/{slug}/ — public product detail (GAP-P03).

    The public identifier is the listing UUID (no slug field yet); the
    /p/{slug} route passes it verbatim. Unpublished or unknown ids return
    404 — no enumeration of drafts (same posture as the home rail).
    """

    permission_classes = [AllowAny]
    authentication_classes: list[type[BaseAuthentication]] = []
    throttle_classes = [AnonRateThrottle]

    def get(self, request, slug: str):
        import uuid

        try:
            listing_id = uuid.UUID(slug)
        except ValueError:
            return Response({"error": "not_found"}, status=404)

        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            listing = (
                ProductListing.objects.filter(pk=listing_id, status=ListingStatus.PUBLISHED)
                .select_related("seller")
                .first()
            )
            if listing is None:
                return Response({"error": "not_found"}, status=404)
            return Response(ListingDetailSerializer(listing).data)


@extend_schema(responses=ListingHomeSerializer(many=True))
class RelatedProductsView(APIView):
    """GET /api/v1/products/{slug}/related/ — PDP rail (GAP-P04).

    Same-category siblings of a published listing, newest first, capped at
    RELATED_LIMIT. The frontend streams this inside Suspense — the rail is
    optional merchandising, so an empty list simply renders nothing there.
    Unknown or unpublished ids return 404 (same posture as the detail view:
    no enumeration of drafts).
    """

    permission_classes = [AllowAny]
    authentication_classes: list[type[BaseAuthentication]] = []
    throttle_classes = [AnonRateThrottle]

    def get(self, request, slug: str):
        import uuid

        try:
            listing_id = uuid.UUID(slug)
        except ValueError:
            return Response({"error": "not_found"}, status=404)

        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            listing = ProductListing.objects.filter(
                pk=listing_id, status=ListingStatus.PUBLISHED
            ).first()
            if listing is None:
                return Response({"error": "not_found"}, status=404)
            related = (
                ProductListing.objects.filter(
                    category=listing.category, status=ListingStatus.PUBLISHED
                )
                .exclude(pk=listing.pk)
                .select_related("seller")
                .order_by("-published_at", "pk")[:RELATED_LIMIT]
            )
            return Response(ListingHomeSerializer(related, many=True).data)


SORTS = {"newest", "price_asc", "price_desc", "name"}


@extend_schema(
    responses=CategoryProductsPageSerializer,
    parameters=[
        OpenApiParameter("page", int, OpenApiParameter.QUERY, required=False),
        OpenApiParameter("page_size", int, OpenApiParameter.QUERY, required=False),
        OpenApiParameter("price_min", str, OpenApiParameter.QUERY, required=False),
        OpenApiParameter("price_max", str, OpenApiParameter.QUERY, required=False),
        OpenApiParameter(
            "sellers",
            str,
            OpenApiParameter.QUERY,
            required=False,
            description="Comma-separated derived seller slugs.",
        ),
        OpenApiParameter(
            "sort",
            str,
            OpenApiParameter.QUERY,
            required=False,
            enum=sorted(SORTS),
        ),
    ],
)
class CategoryProductsView(APIView):
    """GET /api/v1/categories/{slug}/products/ — public category grid (GAP-P02).

    Server-side pagination + commerce filters (price range, seller set,
    sort). All parameters are non-PII commerce state, safe to share in
    URLs (ADR-0009); the frontend island rewrites the query string and
    this view re-renders. `in_stock` is accepted but a no-op until the
    inventory model lands (MVP-P2) — silently faking stock would breach
    ADR-0007, so the storefront omits the toggle for now.
    """

    permission_classes = [AllowAny]
    authentication_classes: list[type[BaseAuthentication]] = []
    throttle_classes = [AnonRateThrottle]

    def get(self, request, slug: str):
        from decimal import Decimal, InvalidOperation

        from django.db.models import Count

        params = request.query_params
        try:
            page = max(1, int(params.get("page", "1")))
            page_size = min(48, max(1, int(params.get("page_size", "24"))))
        except ValueError:
            return Response({"error": "invalid_pagination"}, status=400)

        price_min = price_max = None
        try:
            if params.get("price_min"):
                price_min = Decimal(params["price_min"])
            if params.get("price_max"):
                price_max = Decimal(params["price_max"])
        except InvalidOperation:
            return Response({"error": "invalid_price"}, status=400)
        seller_slugs = [s for s in params.get("sellers", "").split(",") if s]
        sort = params.get("sort", "newest")
        if sort not in SORTS:
            return Response({"error": "invalid_sort"}, status=400)

        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            category = Category.objects.filter(slug=slug).first()
            if category is None:
                return Response({"error": "not_found"}, status=404)

            qs = ProductListing.objects.filter(
                category=category, status=ListingStatus.PUBLISHED
            ).select_related("seller")
            if price_min is not None:
                qs = qs.filter(price__gte=price_min)
            if price_max is not None:
                qs = qs.filter(price__lte=price_max)

            # Facets: category-level seller counts using the same derived
            # slug the ref serializer exposes (slugify of company name) —
            # sellers_app has no slug column until GAP-V05.
            from django.utils.text import slugify

            facet_rows = (
                ProductListing.objects.filter(category=category, status=ListingStatus.PUBLISHED)
                .values("seller_id", "seller__company_name")
                .annotate(count=Count("pk"))
                .order_by("-count", "seller__company_name")
            )
            facets = [
                {
                    "id": r["seller_id"],
                    "slug": slugify(r["seller__company_name"]),
                    "name": r["seller__company_name"],
                    "count": r["count"],
                }
                for r in facet_rows
            ]
            if seller_slugs:
                # Stable facet set (ignores the seller filter itself) so
                # boxes can always be re-enabled.
                wanted = set(seller_slugs)
                qs = qs.filter(seller_id__in=[f["id"] for f in facets if f["slug"] in wanted])

            if sort == "price_asc":
                qs = qs.order_by("price", "pk")
            elif sort == "price_desc":
                qs = qs.order_by("-price", "pk")
            elif sort == "name":
                # Order by the active-language title column (modeltranslation
                # default language is "en"; bare "title" is that column).
                lang = translation.get_language() or "en"
                field = f"title_{lang}" if lang != "en" else "title"
                qs = qs.order_by(field, "pk")
            else:
                qs = qs.order_by("-published_at", "pk")

            count = qs.count()
            start = (page - 1) * page_size
            results = qs[start : start + page_size]

            payload = {
                "count": count,
                "page": page,
                "page_size": page_size,
                "results": ListingHomeSerializer(results, many=True).data,
                "category": CategoryHomeSerializer(category).data,
                "facets": {
                    "sellers": [
                        {"slug": f["slug"], "name": f["name"], "count": f["count"]}
                        for f in facets[:6]
                    ]
                },
            }
        return Response(payload)


@extend_schema(responses=CategoryPickerSerializer(many=True))
class CategoriesIndexView(APIView):
    """GET /api/v1/categories/ — flat category index (GAP-P05).

    Two consumers, one payload: the seller listing form needs the UUID
    (`id`) for category_id, the search facet needs the URL slug. Both are
    returned; names follow Accept-Language.
    """

    permission_classes = [AllowAny]
    authentication_classes: list[type[BaseAuthentication]] = []
    throttle_classes = [AnonRateThrottle]

    def get(self, request):
        language = get_language_from_request(request, check_path=False)
        with translation.override(language):
            categories = Category.objects.order_by("name", "pk")
            payload = {"results": CategoryPickerSerializer(categories, many=True).data}
        return Response(payload)
