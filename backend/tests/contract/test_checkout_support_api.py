"""Contract tests for checkout support endpoints — GAP-H01/H02/T01.

Consumer-driven against frontend/src/components/client/checkout/
checkout-provider.tsx (fetchShippingOptions / fetchLockers / validateVatId).
Pins the honest posture: prices come from the in-repo policy table and the
locker directory is marked "curated" until the live carrier APIs land.
"""

from __future__ import annotations

import pytest
from django.test import Client

pytestmark = pytest.mark.django_db


class TestShippingOptions:
    def test_lt_offers_courier_and_omniva_locker_with_prices(self, client: Client):
        body = client.post(
            "/api/v1/orders/shipping-options/",
            {"country": "LT"},
            content_type="application/json",
        ).json()
        assert body["country"] == "LT"
        by_id = {option["id"]: option for option in body["options"]}
        assert by_id["courier"]["price"] == "3.49"
        assert by_id["courier"]["eta_days"] == "1-2"
        assert by_id["omniva_locker"]["price"] == "2.49"
        assert all(option["currency"] == "EUR" for option in body["options"])

    def test_every_launch_country_gets_at_least_one_option(self, client: Client):
        for country in ("LT", "LV", "EE"):
            body = client.post(
                "/api/v1/orders/shipping-options/",
                {"country": country},
                content_type="application/json",
            ).json()
            assert len(body["options"]) >= 1

    def test_unknown_country_is_400(self, client: Client):
        res = client.post(
            "/api/v1/orders/shipping-options/",
            {"country": "DE"},
            content_type="application/json",
        )
        assert res.status_code == 400


class TestLockerDirectory:
    def test_omniva_lt_returns_curated_lockers_with_source_marker(self, client: Client):
        body = client.get("/api/v1/shipping/lockers/?country=LT&carrier=omniva").json()
        assert body["source"] == "curated"
        assert len(body["lockers"]) >= 3
        first = body["lockers"][0]
        assert {"id", "name", "address", "city"} <= set(first)

    def test_dpd_has_no_locker_catalogue(self, client: Client):
        body = client.get("/api/v1/shipping/lockers/?country=LT&carrier=dpd").json()
        assert body["lockers"] == []

    def test_validation_errors(self, client: Client):
        assert client.get("/api/v1/shipping/lockers/?country=DE&carrier=omniva").status_code == 400
        assert client.get("/api/v1/shipping/lockers/?country=LT&carrier=fedex").status_code == 400


class TestVatIdValidation:
    @pytest.mark.parametrize(
        "vat_id",
        ["LT123456789", "LT123456789012", " LV12345678901 ", "EE123456789"],
    )
    def test_valid_baltic_formats(self, client: Client, vat_id: str):
        body = client.post(
            "/api/v1/tax/vat-id/validate/", {"vat_id": vat_id}, content_type="application/json"
        ).json()
        assert body["valid"] is True
        assert body["vies_checked"] is False  # honest: VIES is not wired

    @pytest.mark.parametrize("vat_id", ["LT123", "DE123456789", "123456789", ""])
    def test_invalid_inputs(self, client: Client, vat_id: str):
        res = client.post(
            "/api/v1/tax/vat-id/validate/", {"vat_id": vat_id}, content_type="application/json"
        )
        if vat_id == "":
            assert res.status_code == 400
        else:
            assert res.json()["valid"] is False
