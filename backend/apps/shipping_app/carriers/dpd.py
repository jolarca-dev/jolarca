"""DPD integration (sanctioned stubs MVP-H1: credentials + contract tests)."""

from __future__ import annotations

from typing import Any

from django.conf import settings

from .base import CarrierError


class DpdCarrier:
    name = "dpd"

    def __init__(self):
        if not settings.DPD_API_KEY or not settings.DPD_API_BASE_URL:
            raise CarrierError("DPD is not configured (DPD_API_KEY/DPD_API_BASE_URL).")

    def create_label(self, *, order, recipient: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError("MVP-H1: DPD label API not yet wired")

    def track(self, external_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError("MVP-H1: DPD tracking API not yet wired")

    def locker_points(self, country: str) -> list[dict[str, Any]]:
        # DPD Pickup points; locker network is Omniva-led in the Baltics.
        raise NotImplementedError("MVP-H1: DPD pickup-point API not yet wired")
