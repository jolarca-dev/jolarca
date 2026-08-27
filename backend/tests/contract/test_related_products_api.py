"""Contract tests for the related-products rail endpoint — GAP-P04.

Consumer-driven against frontend/src/server/catalog.ts
(getRelatedProducts → z.array(ProductSchema)): the rail returns a BARE
ARRAY of card projections — same-category published siblings only, the
anchor excluded, capped at 4 — with the same 404 posture as the detail
view (no draft enumeration).
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


@pytest.fixture()
def family() -> tuple[ProductListing, list[ProductListing], Category]:
    """One anchor listing plus five same-category siblings (one draft)."""
    user = User.objects.create_user(email=f"seller-{uuid4().hex[:8]}@example.com", password="x")
    seller = SellerProfile.objects.create(
        user=user,
        company_name="Vilnius Workshops UAB",
        country=Country.LT,
        status=SellerStatus.VERIFIED,
    )
    category = Category.objects.create(slug=f"crafts-{uuid4().hex[:6]}", name="Crafts")
    other = Category.objects.create(slug=f"other-{uuid4().hex[:6]}", name="Other")

    def make(cat: Category, title: str, status: str = ListingStatus.PUBLISHED) -> ProductListing:
        return ProductListing.objects.create(
            seller=seller,
            category=cat,
            title=title,
            price=Decimal("10.00"),
            status=status,
        )

    anchor = make(category, "Anchor pendant")
    siblings = [make(category, f"Sibling {i}") for i in range(4)]
    siblings.append(make(category, "Draft sibling", status=ListingStatus.DRAFT))
    make(other, "Stranger listing")  # different category — never in the rail
    return anchor, siblings, category


class TestRelatedProducts:
    def test_returns_bare_array_of_same_category_siblings(self, client: Client, family):
        anchor, _, _ = family
        res = client.get(f"/api/v1/products/{anchor.pk}/related/")
        assert res.status_code == 200
        body = res.json()
        assert isinstance(body, list)
        titles = {item["title"] for item in body}
        assert "Anchor pendant" not in titles  # the anchor excludes itself
        assert "Stranger listing" not in titles  # other categories excluded
        assert "Draft sibling" not in titles  # published-only
        assert all(item["currency"] == "EUR" for item in body)

    def test_rail_is_capped_at_four(self, client: Client, family):
        anchor, _, _ = family
        body = client.get(f"/api/v1/products/{anchor.pk}/related/").json()
        assert len(body) == 4  # 4 published siblings, cap holds

    def test_solo_listing_returns_empty_rail(self, client: Client):
        user = User.objects.create_user(email=f"seller-{uuid4().hex[:8]}@example.com", password="x")
        seller = SellerProfile.objects.create(
            user=user,
            company_name="Solo OÜ",
            country=Country.EE,
            status=SellerStatus.VERIFIED,
        )
        category = Category.objects.create(slug=f"solo-{uuid4().hex[:6]}", name="Solo")
        listing = ProductListing.objects.create(
            seller=seller,
            category=category,
            title="Only one",
            price=Decimal("5.00"),
            status=ListingStatus.PUBLISHED,
        )
        assert client.get(f"/api/v1/products/{listing.pk}/related/").json() == []

    def test_anchor_visibility_matches_detail_view(self, client: Client):
        # Draft anchors 404 exactly like the PDP (no draft enumeration).
        user = User.objects.create_user(email=f"seller-{uuid4().hex[:8]}@example.com", password="x")
        seller = SellerProfile.objects.create(
            user=user,
            company_name="Drafts UAB",
            country=Country.LT,
            status=SellerStatus.VERIFIED,
        )
        category = Category.objects.create(slug=f"d-{uuid4().hex[:6]}", name="D")
        hidden = ProductListing.objects.create(
            seller=seller,
            category=category,
            title="Hidden",
            price=Decimal("1.00"),
            status=ListingStatus.DRAFT,
        )
        assert client.get(f"/api/v1/products/{hidden.pk}/related/").status_code == 404
        assert client.get("/api/v1/products/not-a-uuid/related/").status_code == 404
        assert (
            client.get("/api/v1/products/00000000-0000-4000-8000-000000000000/related/").status_code
            == 404
        )

    def test_titles_follow_accept_language(self, client: Client, family):
        anchor, siblings, _ = family
        sibling = siblings[0]
        with translation.override("lt"):
            sibling.title = "Gintaro brolis"
            sibling.save()
        body = client.get(
            f"/api/v1/products/{anchor.pk}/related/", HTTP_ACCEPT_LANGUAGE="lt"
        ).json()
        assert "Gintaro brolis" in {item["title"] for item in body}
