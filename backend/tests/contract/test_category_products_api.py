"""Contract tests for the category products endpoint — GAP-P02.

Consumer-driven against frontend/src/server/catalog.ts
(paginatedSchema(ProductSchema) + category meta + facets): envelope math,
commerce filters, sort orders, facets, and published-only visibility.
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


def make_seller(name: str) -> SellerProfile:
    user = User.objects.create_user(email=f"{uuid4().hex[:8]}@example.com", password="x")
    return SellerProfile.objects.create(
        user=user,
        company_name=name,
        country=Country.LT,
        status=SellerStatus.VERIFIED,
    )


@pytest.fixture
def category() -> Category:
    return Category.objects.create(slug="crafts", name="Crafts")


@pytest.fixture
def listings(category: Category) -> list[ProductListing]:
    ann = make_seller("Ann Craft")
    bo = make_seller("Bo Craft")
    made = []
    for seller, title, price in [
        (ann, "Amber pendant", "45.00"),
        (ann, "Linen runner", "29.90"),
        (bo, "Oak cross", "120.00"),
    ]:
        made.append(
            ProductListing.objects.create(
                seller=seller,
                category=category,
                title=title,
                price=Decimal(price),
                status=ListingStatus.PUBLISHED,
            )
        )
    return made


class TestCategoryProducts:
    def test_envelope_shape_and_pagination_math(
        self, client: Client, category: Category, listings: list[ProductListing]
    ):
        res = client.get("/api/v1/categories/crafts/products/?page_size=2")
        assert res.status_code == 200
        body = res.json()
        assert body["count"] == 3
        assert body["page"] == 1
        assert body["page_size"] == 2
        assert len(body["results"]) == 2
        assert body["category"]["slug"] == "crafts"
        assert body["category"]["name"] == "Crafts"
        assert {f["slug"] for f in body["facets"]["sellers"]} == {
            "ann-craft",
            "bo-craft",
        }

        page2 = client.get("/api/v1/categories/crafts/products/?page_size=2&page=2")
        assert len(page2.json()["results"]) == 1

    def test_price_filter(self, client: Client, category: Category, listings):
        body = client.get("/api/v1/categories/crafts/products/?price_min=30&price_max=50").json()
        assert body["count"] == 1
        assert body["results"][0]["title"] == "Amber pendant"

    def test_seller_filter_and_sort(self, client: Client, category: Category, listings):
        body = client.get(
            "/api/v1/categories/crafts/products/?sellers=ann-craft&sort=price_desc"
        ).json()
        assert [r["title"] for r in body["results"]] == [
            "Amber pendant",
            "Linen runner",
        ]

        by_name = client.get("/api/v1/categories/crafts/products/?sort=name").json()
        assert [r["title"] for r in by_name["results"]][0] == "Amber pendant"

    def test_invalid_params_are_400(self, client: Client, category: Category):
        assert client.get("/api/v1/categories/crafts/products/?page=zz").status_code == 400
        assert client.get("/api/v1/categories/crafts/products/?sort=bogus").status_code == 400
        assert client.get("/api/v1/categories/crafts/products/?price_min=abc").status_code == 400

    def test_unknown_category_is_404_and_drafts_hidden(
        self, client: Client, category: Category, listings
    ):
        assert client.get("/api/v1/categories/nope/products/").status_code == 404
        listings[0].status = ListingStatus.DRAFT
        listings[0].save()
        body = client.get("/api/v1/categories/crafts/products/").json()
        assert body["count"] == 2
