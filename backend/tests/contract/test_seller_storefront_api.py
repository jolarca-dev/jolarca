"""Contract tests for the public seller storefront — GAP-V05/V06.

Consumer-driven against frontend/src/server/catalog.ts (SellerSchema +
paginated products): profile shape, verified-only visibility (no
onboarding-state enumeration), and pagination.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from django.test import Client

from apps.products_app.models import Category, ListingStatus, ProductListing
from apps.sellers_app.models import Country, SellerProfile, SellerStatus
from apps.users_app.models import User

pytestmark = pytest.mark.django_db


def make_seller(
    name: str = "Vilnius Workshops UAB",
    status: str = SellerStatus.VERIFIED,
) -> SellerProfile:
    user = User.objects.create_user(email=f"{uuid4().hex[:8]}@example.com", password="x")
    return SellerProfile.objects.create(
        user=user,
        company_name=name,
        country=Country.LT,
        city="Vilnius",
        public_description="Family workshop.",
        status=status,
    )


class TestSellerDetail:
    def test_profile_shape_and_no_pii(self, client: Client):
        make_seller()
        res = client.get("/api/v1/sellers/vilnius-workshops-uab/")
        assert res.status_code == 200
        body = res.json()
        assert body["slug"] == "vilnius-workshops-uab"
        assert body["name"] == "Vilnius Workshops UAB"
        assert body["description"] == "Family workshop."
        assert body["verified"] is True
        assert body["location"] == "Vilnius"
        assert body["country"] == "LT"
        assert body["member_since"]
        # PII must never leak: no email/phone/vat/stripe fields at all.
        for key in ("email", "phone", "vat_number", "stripe_account_id", "user"):
            assert key not in body

    def test_unknown_and_unapproved_are_404_no_enumeration(self, client: Client):
        assert client.get("/api/v1/sellers/nope/").status_code == 404
        for status in (
            SellerStatus.DRAFT,
            SellerStatus.SUBMITTED,
            SellerStatus.REJECTED,
            SellerStatus.SUSPENDED,
        ):
            seller = make_seller(name=f"X {status} Co", status=status)
            from django.utils.text import slugify

            assert client.get(f"/api/v1/sellers/{slugify(seller.company_name)}/").status_code == 404


class TestSellerProducts:
    def test_pagination_and_published_only(self, client: Client):
        seller = make_seller()
        category = Category.objects.create(slug="crafts", name="Crafts")
        for i in range(3):
            ProductListing.objects.create(
                seller=seller,
                category=category,
                title=f"Item {i}",
                price=Decimal("10.00"),
                status=ListingStatus.PUBLISHED,
            )
        ProductListing.objects.create(
            seller=seller,
            category=category,
            title="Draft",
            price=Decimal("10.00"),
            status=ListingStatus.DRAFT,
        )
        body = client.get("/api/v1/sellers/vilnius-workshops-uab/products/?page_size=2").json()
        assert body["count"] == 3
        assert len(body["results"]) == 2
        page2 = client.get(
            "/api/v1/sellers/vilnius-workshops-uab/products/?page_size=2&page=2"
        ).json()
        assert len(page2["results"]) == 1

    def test_unapproved_seller_products_are_404(self, client: Client):
        make_seller(status=SellerStatus.SUBMITTED)
        assert client.get("/api/v1/sellers/vilnius-workshops-uab/products/").status_code == 404
