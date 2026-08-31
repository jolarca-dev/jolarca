"""Contract tests for the search API — GAP-S01/S02 — and GAP-P05 index.

Consumer-driven against frontend/src/lib/search.ts (fetchSearch POST body,
{results, page, total_pages} envelope) and frontend/src/lib/seller.ts
(fetchCategories → {id, slug, name}). The ranking is a SANCTIONED STUB
(MVP-Q1 icontains+recency): the tests pin the honest "stub" marker and the
filter/pagination contract, not relevance quality.
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


def make_seller(name: str) -> SellerProfile:
    user = User.objects.create_user(email=f"{uuid4().hex[:8]}@example.com", password="x")
    return SellerProfile.objects.create(
        user=user,
        company_name=name,
        country=Country.LT,
        status=SellerStatus.VERIFIED,
    )


@pytest.fixture()
def catalog() -> tuple[Category, Category, SellerProfile]:
    crafts = Category.objects.create(slug=f"crafts-{uuid4().hex[:6]}", name="Crafts")
    candles = Category.objects.create(slug=f"candles-{uuid4().hex[:6]}", name="Candles")
    seller = make_seller("Vilnius Workshops UAB")

    def make(cat: Category, title: str, price: str, status=ListingStatus.PUBLISHED):
        return ProductListing.objects.create(
            seller=seller,
            category=cat,
            title=title,
            price=Decimal(price),
            status=status,
        )

    make(crafts, "Amber rosary", "45.00")
    make(crafts, "Amber pendant", "79.00")
    make(candles, "Beeswax candle", "12.00")
    make(crafts, "Amber draft", "10.00", status=ListingStatus.DRAFT)
    return crafts, candles, seller


class TestSearchEndpoint:
    def test_post_query_returns_card_envelope_with_stub_marker(self, client: Client, catalog):
        res = client.post("/api/v1/search/", {"q": "amber"}, content_type="application/json")
        assert res.status_code == 200
        body = res.json()
        assert body["ranking"] == "stub"
        assert body["page"] == 1
        titles = {item["title"] for item in body["results"]}
        assert titles == {"Amber rosary", "Amber pendant"}  # draft excluded
        assert all(item["currency"] == "EUR" for item in body["results"])

    def test_empty_query_is_400(self, client: Client):
        assert client.post("/api/v1/search/", {"q": "  "}).status_code == 400
        assert client.post("/api/v1/search/", {}).status_code == 400

    def test_invalid_pagination_and_price_are_400(self, client: Client):
        assert client.post("/api/v1/search/", {"q": "amber", "page": "x"}).status_code == 400
        assert (
            client.post("/api/v1/search/", {"q": "amber", "price_min": "cheap"}).status_code == 400
        )

    def test_category_filter_restricts_results(self, client: Client, catalog):
        crafts, _, _ = catalog
        body = client.post("/api/v1/search/", {"q": "amber", "category": crafts.slug}).json()
        assert {item["title"] for item in body["results"]} == {"Amber rosary", "Amber pendant"}
        # Same query in the other category → nothing.
        _, candles, _ = catalog
        body = client.post("/api/v1/search/", {"q": "amber", "category": candles.slug}).json()
        assert body["results"] == []

    def test_price_range_filter(self, client: Client, catalog):
        body = client.post("/api/v1/search/", {"q": "amber", "price_max": "50"}).json()
        assert {item["title"] for item in body["results"]} == {"Amber rosary"}
        body = client.post("/api/v1/search/", {"q": "amber", "price_min": "50"}).json()
        assert {item["title"] for item in body["results"]} == {"Amber pendant"}

    def test_seller_fragment_filter(self, client: Client, catalog):
        body = client.post("/api/v1/search/", {"q": "amber", "seller": "vilnius"}).json()
        assert len(body["results"]) == 2
        body = client.post("/api/v1/search/", {"q": "amber", "seller": "nobody-here"}).json()
        assert body["results"] == []

    def test_pagination_math(self, client: Client, catalog):
        body = client.post("/api/v1/search/", {"q": "amber", "page_size": 1, "page": 2}).json()
        assert body["page"] == 2
        assert body["total_pages"] == 2
        assert len(body["results"]) == 1

    def test_localized_titles_match_accept_language(self, client: Client, catalog):
        _, _, _ = catalog
        listing = ProductListing.objects.filter(title="Amber rosary").first()
        with translation.override("lt"):
            listing.title = "Gintaro rožinis"
            listing.save()
        body = client.post("/api/v1/search/", {"q": "rožinis"}, HTTP_ACCEPT_LANGUAGE="lt").json()
        assert {item["title"] for item in body["results"]} == {"Gintaro rožinis"}


class TestSuggestEndpoint:
    def test_empty_query_returns_empty_facets(self, client: Client):
        body = client.get("/api/v1/search/suggest/").json()
        assert body == {"categories": [], "products": [], "sellers": []}

    def test_suggestions_cover_all_three_facets(self, client: Client, catalog):
        body = client.get("/api/v1/search/suggest/?q=amber").json()
        assert {item["title"] for item in body["products"]} == {
            "Amber rosary",
            "Amber pendant",
        }
        # Sellers facet matches company names, not product titles.
        body = client.get("/api/v1/search/suggest/?q=Vilnius").json()
        assert any(item["name"] == "Vilnius Workshops UAB" for item in body["sellers"])
        # Category facet matches on names, not titles — "crafts" query does.
        body = client.get("/api/v1/search/suggest/?q=Crafts").json()
        assert len(body["categories"]) >= 1
        assert all({"slug", "name"} <= set(item) for item in body["categories"])


class TestCategoriesIndex:
    def test_index_exposes_uuid_slug_and_localized_name(self, client: Client, catalog):
        crafts, candles, _ = catalog
        with translation.override("lt"):
            crafts.name = "Amatai"
            crafts.save()
        body = client.get("/api/v1/categories/", HTTP_ACCEPT_LANGUAGE="lt").json()
        by_slug = {item["slug"]: item for item in body["results"]}
        assert by_slug[crafts.slug]["name"] == "Amatai"
        assert by_slug[candles.slug]["name"] == "Candles"
        # id is the Category UUID (listing forms post it as category_id).
        assert by_slug[crafts.slug]["id"] == str(crafts.pk)
