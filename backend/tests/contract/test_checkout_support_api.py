"""Contract tests for checkout support endpoints — GAP-H01/H02/T01.

Consumer-driven against frontend/src/components/client/checkout/
checkout-provider.tsx (fetchShippingOptions / fetchLockers / validateVatId).
VIES validation is live (P6): tests mock the VIES client to avoid
hitting the EU gateway in CI.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest
from django.test import Client

from apps.tax_app.vies_client import ViesResult

pytestmark = pytest.mark.django_db


# ── VIES mock fixtures ───────────────────────────────────────────────

VALID_VIES_RESULT = ViesResult(
    vat_id="LT123456789",
    valid=True,
    name="UAB Testinė Įmonė",
    address="Vilniaus g. 1, Vilnius",
    vies_available=True,
    source="vies_live",
)

INVALID_VIES_RESULT = ViesResult(
    vat_id="LT999999999",
    valid=False,
    name="",
    address="",
    vies_available=True,
    source="vies_live",
)

VIES_DOWN_RESULT = ViesResult(
    vat_id="LT123456789",
    valid=True,  # Format-valid fallback
    name="",
    address="",
    vies_available=False,
    source="format_only",
)


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
    """VIES live validation tests (P6)."""

    @patch("apps.tax_app.views.check_vat_live")
    def test_valid_vies_check_returns_true(self, mock_vies, client: Client):
        mock_vies.return_value = VALID_VIES_RESULT
        body = client.post(
            "/api/v1/tax/vat-id/validate/",
            {"vat_id": "LT123456789"},
            content_type="application/json",
        ).json()
        assert body["valid"] is True
        assert body["vies_checked"] is True
        assert body["vies_available"] is True
        assert body["source"] == "vies_live"
        assert body["name"] == "UAB Testinė Įmonė"
        assert body["country"] == "LT"

    @patch("apps.tax_app.views.check_vat_live")
    def test_invalid_vat_returns_false(self, mock_vies, client: Client):
        mock_vies.return_value = INVALID_VIES_RESULT
        body = client.post(
            "/api/v1/tax/vat-id/validate/",
            {"vat_id": "LT999999999"},
            content_type="application/json",
        ).json()
        assert body["valid"] is False
        assert body["vies_checked"] is True  # VIES responded, just said no
        assert body["vies_available"] is True

    @patch("apps.tax_app.views.check_vat_live")
    def test_vies_down_returns_format_only(self, mock_vies, client: Client):
        mock_vies.return_value = VIES_DOWN_RESULT
        body = client.post(
            "/api/v1/tax/vat-id/validate/",
            {"vat_id": "LT123456789"},
            content_type="application/json",
        ).json()
        assert body["valid"] is True  # Format-valid fallback
        assert body["vies_checked"] is False  # NOT VIES-verified
        assert body["vies_available"] is False
        assert body["source"] == "format_only"

    def test_empty_vat_id_returns_400(self, client: Client):
        res = client.post(
            "/api/v1/tax/vat-id/validate/",
            {"vat_id": ""},
            content_type="application/json",
        )
        assert res.status_code == 400

    @patch("apps.tax_app.views.check_vat_live")
    def test_all_baltic_formats_supported(self, mock_vies, client: Client):
        """Verify LT (9/12 digit), LV (11 digit), EE (9 digit) formats."""
        for vat_id, country in [
            ("LT123456789", "LT"),
            ("LT123456789012", "LT"),
            ("LV12345678901", "LV"),
            ("EE123456789", "EE"),
        ]:
            mock_vies.return_value = ViesResult(
                vat_id=vat_id.replace(" ", ""),
                valid=True,
                name="Test",
                address="Test",
                vies_available=True,
                source="vies_live",
            )
            body = client.post(
                "/api/v1/tax/vat-id/validate/",
                {"vat_id": vat_id},
                content_type="application/json",
            ).json()
            assert body["valid"] is True, f"Failed for {vat_id}"
            assert body["country"] == country
