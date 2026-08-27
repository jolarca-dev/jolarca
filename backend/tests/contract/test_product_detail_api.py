"""Contract tests for the public product detail endpoint — GAP-P03.

Consumer-driven against frontend/src/server/catalog.ts (ProductSchema):
published-only visibility (no draft enumeration), UUID identifier,
localized content, and escaped description HTML (frontend sanitizes a
second time with DOMPurify).
"""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from django.test import Client
from django.utils import translation

from apps.products_app.models import Category, ListingStatus, ProductListing
from apps.sellers_app.models import Country, SellerProfile, SellerStatus
from apps.users_app.models import User

pytestmark = pytest.mark.django_db


def make_listing(
    *,
    status: str = ListingStatus.PUBLISHED,
    description: str = "",
) -> ProductListing:
    user = User.objects.create_user(email=f"seller-{uuid4().hex[:8]}@example.com", password="x")
    seller = SellerProfile.objects.create(
        user=user,
        company_name="Vilnius Workshops UAB",
        country=Country.LT,
        status=SellerStatus.VERIFIED,
    )
    category = Category.objects.create(slug=f"crafts-{uuid4().hex[:6]}", name="Crafts")
    return ProductListing.objects.create(
        seller=seller,
        category=category,
        title="Amber pendant",
        description=description,
        price=Decimal("45.00"),
        status=status,
    )


class TestProductDetail:
    def test_published_listing_returns_full_card_shape(self, client: Client):
        listing = make_listing()
        res = client.get(f"/api/v1/products/{listing.pk}/")
        assert res.status_code == 200
        body = res.json()
        assert body["id"] == str(listing.pk)
        assert body["slug"] == str(listing.pk)
        assert body["title"] == "Amber pendant"
        assert body["price_gross"] == "45.00"
        assert body["currency"] == "EUR"
        assert body["seller"]["name"] == "Vilnius Workshops UAB"
        assert body["seller"]["verified"] is True
        assert body["rating"] is None
        assert body["vat_note"] is None

    def test_draft_and_archived_are_404_no_enumeration(self, client: Client):
        draft = make_listing(status=ListingStatus.DRAFT)
        archived = make_listing(status=ListingStatus.ARCHIVED)
        assert client.get(f"/api/v1/products/{draft.pk}/").status_code == 404
        assert client.get(f"/api/v1/products/{archived.pk}/").status_code == 404

    def test_unknown_and_non_uuid_slugs_are_404(self, client: Client):
        assert client.get("/api/v1/products/not-a-uuid/").status_code == 404
        assert (
            client.get("/api/v1/products/00000000-0000-4000-8000-000000000000/").status_code == 404
        )

    def test_title_follows_accept_language(self, client: Client):
        listing = make_listing()
        with translation.override("lt"):
            listing.title = "Gintaro pakabukas"
            listing.save()
        body = client.get(f"/api/v1/products/{listing.pk}/", HTTP_ACCEPT_LANGUAGE="lt").json()
        assert body["title"] == "Gintaro pakabukas"

    def test_description_html_is_escaped_paragraphs(self, client: Client):
        listing = make_listing(description="Handcrafted.\n<script>alert(1)</script>")
        html = client.get(f"/api/v1/products/{listing.pk}/").json()["description_html"]
        assert "<script>" not in html
        assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
        assert html.startswith("<p>Handcrafted.</p>")
