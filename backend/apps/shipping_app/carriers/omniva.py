"""Omniva integration — parcel-locker selection is the Baltic differentiator."""

from __future__ import annotations

from typing import Any

from django.conf import settings

from .base import CarrierError


class OmnivaCarrier:
    name = "omniva"

    def __init__(self):
        if not settings.OMNIVA_API_USER or not settings.OMNIVA_API_KEY:
            raise CarrierError("Omniva is not configured (OMNIVA_API_USER/OMNIVA_API_KEY).")

    def create_label(self, *, order, recipient: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError("MVP-H2: Omniva label API not yet wired")

    def track(self, external_id: str) -> list[dict[str, Any]]:
        raise NotImplementedError("MVP-H2: Omniva tracking API not yet wired")

    def locker_points(self, country: str) -> list[dict[str, Any]]:
        """Sanctioned stub MVP-H2: return locker list with coordinates so the
        frontend LockerPicker can compute distance via PostGIS."""
        raise NotImplementedError("MVP-H2: Omniva locker-location API not yet wired")
