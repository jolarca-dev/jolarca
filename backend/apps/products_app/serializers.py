"""Read-only serializers for the public storefront catalog.

Response shapes mirror the frontend zod contract one-to-one
(frontend/src/server/catalog.ts — HomeContentSchema). Money is a decimal
string ("45.00"); content fields resolve through the active language
(django-modeltranslation), which the view activates from Accept-Language.

Fields this MVP cannot truthfully populate yet (images, ratings, VAT
notes, hero CMS) are emitted as explicit nulls/empties — the frontend
contract treats them as optional and renders nothing rather than
simulated content (ADR-0007).
"""

from django.utils.text import slugify
from rest_framework import serializers

from apps.sellers_app.models import SellerStatus

from .models import Category, ProductListing


class SellerRefSerializer(serializers.Serializer):
    """Minimal public seller projection embedded in catalog payloads.

    `slug` derives deterministically from the company name until
    sellers_app ships the storefront (GAP-V05); that endpoint must use
    the same derivation.
    """

    slug = serializers.CharField()
    name = serializers.CharField()
    verified = serializers.BooleanField()
    logo_url = serializers.CharField(allow_null=True)


class CategoryHomeSerializer(serializers.ModelSerializer):
    description = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ("slug", "name", "description", "image")

    def get_description(self, obj: Category) -> str:
        return ""  # no category descriptions until CMS content lands

    def get_image(self, obj: Category) -> None:
        return None  # category art pending media pipeline (image_keys)


class CategoryPickerSerializer(serializers.ModelSerializer):
    """Flat category index (GAP-P05): UUID for listing forms, slug for
    search facets/URLs, localized name for display."""

    id = serializers.CharField(source="pk")

    class Meta:
        model = Category
        fields = ("id", "slug", "name")


class ListingHomeSerializer(serializers.ModelSerializer):
    """Published-listing card projection for the home featured rail."""

    id = serializers.CharField(source="pk")
    # No dedicated slug field yet: the UUID is the stable public
    # identifier and the /p/{slug} route accepts it verbatim.
    slug = serializers.SerializerMethodField()
    price_gross = serializers.SerializerMethodField()
    image = serializers.SerializerMethodField()
    images = serializers.SerializerMethodField()
    description_html = serializers.SerializerMethodField()
    seller = serializers.SerializerMethodField()
    rating = serializers.SerializerMethodField()
    vat_note = serializers.SerializerMethodField()

    class Meta:
        model = ProductListing
        fields = (
            "id",
            "slug",
            "title",
            "price_gross",
            "currency",
            "image",
            "images",
            "description_html",
            "seller",
            "rating",
            "vat_note",
        )

    def get_slug(self, obj: ProductListing) -> str:
        return str(obj.pk)

    def get_price_gross(self, obj: ProductListing) -> str:
        return f"{obj.price:.2f}"

    def get_image(self, obj: ProductListing) -> None:
        return None  # image URL projection lands with the media pipeline

    def get_images(self, obj: ProductListing) -> list:
        return []

    def get_description_html(self, obj: ProductListing) -> str:
        return ""

    def get_seller(self, obj: ProductListing) -> dict:
        seller = obj.seller
        return SellerRefSerializer(
            {
                "slug": slugify(seller.company_name),
                "name": seller.company_name,
                "verified": seller.status == SellerStatus.VERIFIED,
                "logo_url": None,
            }
        ).data

    def get_rating(self, obj: ProductListing) -> None:
        return None  # no review model in MVP

    def get_vat_note(self, obj: ProductListing) -> None:
        return None  # localized VAT copy lands with tax_app surfaces


class ListingDetailSerializer(ListingHomeSerializer):
    """Product detail projection (GAP-P03).

    Extends the card projection with a safe HTML rendering of the
    description: seller text is escaped per paragraph and wrapped in our
    own <p> tags only — the frontend sanitizes again with DOMPurify.
    """

    def get_description_html(self, obj: ProductListing) -> str:
        from django.utils.html import escape

        paragraphs = [line.strip() for line in (obj.description or "").splitlines() if line.strip()]
        return "".join(f"<p>{escape(p)}</p>" for p in paragraphs)


class FacetSellerSerializer(serializers.Serializer):
    """Top sellers in a category, for the filter island (GAP-P02)."""

    slug = serializers.CharField()
    name = serializers.CharField()
    count = serializers.IntegerField()


class FacetsSerializer(serializers.Serializer):
    sellers = FacetSellerSerializer(many=True)


class CategoryProductsPageSerializer(serializers.Serializer):
    """Pagination envelope + category meta + facets (GAP-P02)."""

    count = serializers.IntegerField()
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    results = ListingHomeSerializer(many=True)
    category = CategoryHomeSerializer()
    facets = FacetsSerializer()


class ProductImageSerializer(serializers.Serializer):
    url = serializers.CharField()
    alt = serializers.CharField(allow_blank=True, required=False)
    width = serializers.IntegerField(required=False)
    height = serializers.IntegerField(required=False)


class HeroSerializer(serializers.Serializer):
    title = serializers.CharField()
    subtitle = serializers.CharField(allow_blank=True, required=False)
    image = ProductImageSerializer(allow_null=True, required=False)


class HomeContentSerializer(serializers.Serializer):
    """Envelope for GET /api/v1/catalog/home/ (OpenAPI documentation shape).

    `hero` is nullable: served from the admin-managed micro-CMS
    (HomeHeroContent); null when no active hero exists and the frontend
    renders no hero section (ADR-0007).
    """

    hero = HeroSerializer(allow_null=True)
    categories = CategoryHomeSerializer(many=True)
    featured = ListingHomeSerializer(many=True)
