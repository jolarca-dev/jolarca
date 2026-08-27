"""Contract tests for the cart API — GAP-O01/O02/O05/O06/O07.

Consumer-driven against frontend/src/stores/cart-store.ts (parseServerCart
envelope + mutation helpers) and src/hooks/use-cart.ts (optimistic confirm
paths). Pins the envelope shape, the sum-on-duplicate merge, user scoping,
and the "live listing wins over client data" price posture.
"""

from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

import pytest
from django.test import Client
from django.utils import translation

from apps.orders_app.models import Cart, CartItem, CartStatus
from apps.products_app.models import Category, ListingStatus, ProductListing
from apps.sellers_app.models import Country, SellerProfile, SellerStatus
from apps.users_app.models import User

pytestmark = pytest.mark.django_db


def make_user(email: str | None = None) -> User:
    return User.objects.create_user(
        email=email or f"{uuid4().hex[:10]}@example.com", password="cart-test-pw"
    )


@pytest.fixture()
def catalog() -> tuple[ProductListing, ProductListing]:
    category = Category.objects.create(slug=f"cart-{uuid4().hex[:6]}", name="Cart test")
    user = make_user(f"seller-{uuid4().hex[:8]}@example.com")
    seller = SellerProfile.objects.create(
        user=user,
        company_name="Cart Seller UAB",
        country=Country.LT,
        status=SellerStatus.VERIFIED,
    )
    published = ProductListing.objects.create(
        seller=seller,
        category=category,
        title="Amber rosary",
        price=Decimal("45.00"),
        status=ListingStatus.PUBLISHED,
    )
    draft = ProductListing.objects.create(
        seller=seller,
        category=category,
        title="Amber draft",
        price=Decimal("10.00"),
        status=ListingStatus.DRAFT,
    )
    return published, draft


class TestAuthPosture:
    def test_all_cart_endpoints_refuse_anonymous(self, client: Client, catalog):
        published, _ = catalog
        assert client.get("/api/v1/cart/").status_code == 403
        assert (
            client.post("/api/v1/cart/items/", {"product_id": str(published.pk)}).status_code == 403
        )
        assert client.post("/api/v1/cart/sync/", {"items": []}).status_code == 403


class TestGetCart:
    def test_empty_cart_is_an_empty_envelope_without_creating_one(self, client: Client):
        user = make_user()
        client.force_login(user)
        body = client.get("/api/v1/cart/").json()
        assert body == {"cart_id": None, "items": []}
        assert not Cart.objects.filter(user=user).exists()

    def test_envelope_shape_matches_parse_server_cart(self, client: Client, catalog):
        published, _ = catalog
        user = make_user()
        client.force_login(user)
        client.post("/api/v1/cart/items/", {"product_id": str(published.pk)})
        body = client.get("/api/v1/cart/").json()
        assert body["cart_id"]
        (line,) = body["items"]
        assert line["product_id"] == str(published.pk)
        assert line["slug"] == str(published.pk)
        assert line["title"] == "Amber rosary"
        assert line["price"] == "45.00"
        assert line["currency"] == "EUR"
        assert line["quantity"] == 1
        assert line["seller_id"]
        assert line["seller_name"] == "Cart Seller UAB"

    def test_users_never_see_each_other_carts(self, client: Client, catalog):
        published, _ = catalog
        owner = make_user()
        client.force_login(owner)
        client.post("/api/v1/cart/items/", {"product_id": str(published.pk)})

        other = make_user()
        client.force_login(other)
        assert client.get("/api/v1/cart/").json()["items"] == []


class TestAddItem:
    def test_add_creates_cart_and_line(self, client: Client, catalog):
        published, _ = catalog
        user = make_user()
        client.force_login(user)
        res = client.post("/api/v1/cart/items/", {"product_id": str(published.pk), "quantity": 2})
        assert res.status_code == 201
        assert res.json()["quantity"] == 2
        assert Cart.objects.filter(user=user, status=CartStatus.ACTIVE).count() == 1

    def test_adding_twice_sums_quantity_on_one_line(self, client: Client, catalog):
        published, _ = catalog
        client.force_login(make_user())
        client.post("/api/v1/cart/items/", {"product_id": str(published.pk)})
        res = client.post("/api/v1/cart/items/", {"product_id": str(published.pk), "quantity": 3})
        assert res.status_code == 201
        assert res.json()["quantity"] == 4
        assert CartItem.objects.count() == 1

    def test_draft_and_unknown_listings_are_404(self, client: Client, catalog):
        _, draft = catalog
        client.force_login(make_user())
        assert client.post("/api/v1/cart/items/", {"product_id": str(draft.pk)}).status_code == 404
        assert client.post("/api/v1/cart/items/", {"product_id": str(uuid4())}).status_code == 404

    def test_invalid_quantity_is_400(self, client: Client, catalog):
        published, _ = catalog
        client.force_login(make_user())
        for bad in ("0", "-1", "100", "many"):
            assert (
                client.post(
                    "/api/v1/cart/items/",
                    {"product_id": str(published.pk), "quantity": bad},
                ).status_code
                == 400
            )


class TestUpdateAndRemove:
    def _line_id(self, client: Client, published: ProductListing) -> str:
        res = client.post("/api/v1/cart/items/", {"product_id": str(published.pk)})
        return res.json()["id"]

    def test_patch_updates_quantity(self, client: Client, catalog):
        published, _ = catalog
        client.force_login(make_user())
        item_id = self._line_id(client, published)
        res = client.patch(
            f"/api/v1/cart/items/{item_id}/",
            {"quantity": 5},
            content_type="application/json",
        )
        assert res.status_code == 200
        assert res.json()["quantity"] == 5

    def test_patch_rejects_bad_quantity(self, client: Client, catalog):
        published, _ = catalog
        client.force_login(make_user())
        item_id = self._line_id(client, published)
        res = client.patch(
            f"/api/v1/cart/items/{item_id}/",
            {"quantity": 0},
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_delete_removes_line(self, client: Client, catalog):
        published, _ = catalog
        client.force_login(make_user())
        item_id = self._line_id(client, published)
        assert client.delete(f"/api/v1/cart/items/{item_id}/").status_code == 204
        assert CartItem.objects.count() == 0

    def test_foreign_lines_are_404_not_403(self, client: Client, catalog):
        published, _ = catalog
        owner = make_user()
        client.force_login(owner)
        item_id = self._line_id(client, published)
        client.force_login(make_user())
        assert (
            client.patch(
                f"/api/v1/cart/items/{item_id}/",
                {"quantity": 9},
                content_type="application/json",
            ).status_code
            == 404
        )
        assert client.delete(f"/api/v1/cart/items/{item_id}/").status_code == 404
        assert CartItem.objects.count() == 1  # owner's line untouched


class TestSync:
    def test_sync_merges_guest_draft_with_server_cart(self, client: Client, catalog):
        published, draft = catalog
        user = make_user()
        client.force_login(user)
        # Server side already holds 1 × published.
        client.post("/api/v1/cart/items/", {"product_id": str(published.pk)})
        # Guest draft: +2 published (sums), 1 draft listing (skipped),
        # 1 unknown id (skipped), one malformed entry (skipped).
        res = client.post(
            "/api/v1/cart/sync/",
            {
                "items": [
                    {"product_id": str(published.pk), "slug": str(published.pk), "quantity": 2},
                    {"product_id": str(draft.pk), "quantity": 1},
                    {"product_id": str(uuid4()), "quantity": 1},
                    "junk",
                ]
            },
            content_type="application/json",
        )
        assert res.status_code == 200
        body = res.json()
        assert len(body["items"]) == 1
        assert body["items"][0]["quantity"] == 3

    def test_sync_with_empty_draft_returns_current_envelope(self, client: Client, catalog):
        published, _ = catalog
        client.force_login(make_user())
        client.post("/api/v1/cart/items/", {"product_id": str(published.pk)})
        body = client.post(
            "/api/v1/cart/sync/", {"items": []}, content_type="application/json"
        ).json()
        assert len(body["items"]) == 1
        assert body["items"][0]["quantity"] == 1

    def test_sync_body_must_be_a_list(self, client: Client):
        client.force_login(make_user())
        assert (
            client.post(
                "/api/v1/cart/sync/", {"items": "nope"}, content_type="application/json"
            ).status_code
            == 400
        )


class TestLocalization:
    def test_line_titles_follow_accept_language(self, client: Client, catalog):
        published, _ = catalog
        with translation.override("lt"):
            published.title = "Gintaro rožinis"
            published.save()
        client.force_login(make_user())
        client.post("/api/v1/cart/items/", {"product_id": str(published.pk)})
        body = client.get("/api/v1/cart/", HTTP_ACCEPT_LANGUAGE="lt").json()
        assert body["items"][0]["title"] == "Gintaro rožinis"
        body = client.get("/api/v1/cart/", HTTP_ACCEPT_LANGUAGE="en").json()
        assert body["items"][0]["title"] == "Amber rosary"
