"""Contract tests for order creation — GAP-O08 (+O03/O04 history/detail).

Consumer-driven against frontend/src/components/client/checkout/
checkout-provider.tsx (createOrder envelope: order_id + client_secret) and
the success/account pages (order list + detail). Stripe is switched OFF for
the suite: the honest posture is client_secret=null with the order pending —
never a fabricated secret, never a live Stripe call from tests.
"""

from __future__ import annotations

import datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from django.test import Client

from apps.products_app.models import Category, ListingStatus, ProductListing
from apps.sellers_app.models import Country, SellerProfile, SellerStatus
from apps.tax_app.models import VatRateSnapshot
from apps.users_app.models import User

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def no_stripe(settings):
    """Payments unconfigured → orders stay pending, client_secret is null."""
    settings.STRIPE_SECRET_KEY = ""


@pytest.fixture(autouse=True)
def vat_rates():
    for country, rate in (("LT", "21.00"), ("LV", "21.00"), ("EE", "22.00")):
        VatRateSnapshot.objects.create(
            country=country, rate=Decimal(rate), valid_from=datetime.date(2020, 1, 1)
        )


def make_user() -> User:
    return User.objects.create_user(email=f"{uuid4().hex[:10]}@example.com", password="x")


@pytest.fixture()
def listing() -> ProductListing:
    category = Category.objects.create(slug=f"orders-{uuid4().hex[:6]}", name="Orders test")
    user = User.objects.create_user(email=f"seller-{uuid4().hex[:8]}@example.com", password="x")
    seller = SellerProfile.objects.create(
        user=user,
        company_name="Orders Seller UAB",
        country=Country.LT,
        status=SellerStatus.VERIFIED,
    )
    return ProductListing.objects.create(
        seller=seller,
        category=category,
        title="Amber rosary",
        price=Decimal("45.00"),
        status=ListingStatus.PUBLISHED,
    )


def order_payload(listing: ProductListing, **overrides) -> dict:
    payload = {
        "items": [{"product_id": str(listing.pk), "quantity": 2}],
        "shipping": {
            "method": "courier",
            "address": {
                "full_name": "Ona Testauskienė",
                "street": "Gedimino pr. 1",
                "city": "Vilnius",
                "postal_code": "LT-01103",
                "country": "LT",
                "phone": "+370 600 12345",
            },
        },
    }
    payload.update(overrides)
    return payload


class TestOrderCreation:
    def test_anonymous_is_refused(self, client: Client, listing):
        res = client.post(
            "/api/v1/orders/",
            order_payload(listing),
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        assert res.status_code == 403

    def test_idempotency_key_is_required(self, client: Client, listing):
        client.force_login(make_user())
        res = client.post(
            "/api/v1/orders/", order_payload(listing), content_type="application/json"
        )
        assert res.status_code == 400
        assert res.json()["error"] == "idempotency_key_required"

    def test_creates_order_with_server_pricing_and_null_secret(self, client: Client, listing):
        client.force_login(make_user())
        res = client.post(
            "/api/v1/orders/",
            order_payload(listing),
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        assert res.status_code == 201
        body = res.json()
        assert body["order_number"].startswith("JOL-")
        assert body["client_secret"] is None  # honest: Stripe is off
        # 2 × 45.00 goods + 3.49 LT courier, plus 21% VAT over the sum.
        base = Decimal("90.00") + Decimal("3.49")
        expected = base + (base * Decimal("0.21")).quantize(Decimal("0.01"))
        assert Decimal(body["total_gross"]) == expected

    def test_replay_with_same_key_returns_same_order(self, client: Client, listing):
        client.force_login(make_user())
        key = str(uuid4())
        first = client.post(
            "/api/v1/orders/",
            order_payload(listing),
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        second = client.post(
            "/api/v1/orders/",
            order_payload(listing),
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        assert first.json()["order_id"] == second.json()["order_id"]

    def test_key_reuse_with_different_payload_is_409(self, client: Client, listing):
        client.force_login(make_user())
        key = str(uuid4())
        client.post(
            "/api/v1/orders/",
            order_payload(listing),
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        changed = order_payload(listing)
        changed["items"][0]["quantity"] = 5
        res = client.post(
            "/api/v1/orders/",
            changed,
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=key,
        )
        assert res.status_code == 409

    def test_unknown_or_unpublished_items_are_404(self, client: Client):
        client.force_login(make_user())
        body = {
            "items": [{"product_id": str(uuid4()), "quantity": 1}],
            "shipping": {
                "method": "courier",
                "address": {
                    "full_name": "Ona Testauskienė",
                    "street": "Gedimino pr. 1",
                    "city": "Vilnius",
                    "postal_code": "LT-01103",
                    "country": "LT",
                    "phone": "+370 600 12345",
                },
            },
        }
        res = client.post(
            "/api/v1/orders/",
            body,
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        assert res.status_code == 404

    def test_unoffered_delivery_method_is_400(self, client: Client, listing):
        client.force_login(make_user())
        payload = order_payload(listing)
        payload["shipping"]["method"] = "dpd_locker"  # not offered in the LT table
        res = client.post(
            "/api/v1/orders/",
            payload,
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        assert res.status_code == 400
        assert res.json()["error"] == "delivery_method_unavailable"

    def test_invalid_vat_id_is_400_and_valid_passes(self, client: Client, listing):
        client.force_login(make_user())
        bad = order_payload(listing, vat_id="LT123")
        res = client.post(
            "/api/v1/orders/",
            bad,
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        assert res.status_code == 400
        assert res.json()["error"] == "invalid_vat_id"

        good = order_payload(listing, vat_id="LT123456789")
        res = client.post(
            "/api/v1/orders/",
            good,
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        assert res.status_code == 201


class TestOrderHistoryAndDetail:
    def _create_order(self, client: Client, listing: ProductListing) -> dict:
        res = client.post(
            "/api/v1/orders/",
            order_payload(listing),
            content_type="application/json",
            HTTP_IDEMPOTENCY_KEY=str(uuid4()),
        )
        assert res.status_code == 201
        return res.json()

    def test_list_and_detail_scoped_to_the_buyer(self, client: Client, listing):
        buyer = make_user()
        client.force_login(buyer)
        created = self._create_order(client, listing)

        body = client.get("/api/v1/orders/").json()
        assert [entry["order_id"] for entry in body["results"]] == [created["order_id"]]

        detail = client.get(f"/api/v1/orders/{created['order_id']}/").json()
        assert detail["order_number"] == created["order_number"]
        assert detail["eta_days"] == "1-2"  # LT courier from the rate table
        assert detail["items"][0]["title"] == "Amber rosary"
        assert detail["items"][0]["quantity"] == 2

        # Another buyer sees nothing and cannot probe the order.
        client.force_login(make_user())
        assert client.get("/api/v1/orders/").json()["results"] == []
        assert client.get(f"/api/v1/orders/{created['order_id']}/").status_code == 404
