"""Public seller projections (GAP-V05/V06).

Only trust-relevant, non-PII fields are exposed: contact details (email,
phone, address) never leave private surfaces (ADR-0009 / GDPR).
"""

from __future__ import annotations

from rest_framework import serializers

from apps.products_app.serializers import ListingHomeSerializer

from .models import SellerProfile


class PublicSellerSerializer(serializers.Serializer):
    """Buyer-facing seller profile.

    `slug` derives deterministically from the company name (slugify) —
    sellers_app ships no slug column; any consumer of this contract must
    use the same derivation (frontend storefront links, facets).
    """

    slug = serializers.SerializerMethodField()
    name = serializers.CharField(source="company_name")
    description = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()
    verified = serializers.SerializerMethodField()
    location = serializers.CharField(source="city")
    country = serializers.CharField()
    member_since = serializers.SerializerMethodField()

    def get_slug(self, obj: SellerProfile) -> str:
        from django.utils.text import slugify

        return slugify(obj.company_name)

    def get_description(self, obj: SellerProfile) -> str:
        return obj.public_description

    def get_logo_url(self, obj: SellerProfile) -> None:
        return None  # logo delivery pending media pipeline (MVP-P1)

    def get_verified(self, obj: SellerProfile) -> bool:
        from .models import SellerStatus

        return obj.status == SellerStatus.VERIFIED

    def get_member_since(self, obj: SellerProfile) -> str:
        return obj.created_at.date().isoformat()


class SellerProductsPageSerializer(serializers.Serializer):
    """Pagination envelope for the seller storefront grid (GAP-V06)."""

    count = serializers.IntegerField()
    page = serializers.IntegerField()
    page_size = serializers.IntegerField()
    results = ListingHomeSerializer(many=True)
