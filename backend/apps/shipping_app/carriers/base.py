"""Carrier protocol — the swap contract for DPD / Omniva / future carriers."""

from __future__ import annotations

from typing import Any, Protocol


class CarrierError(Exception):
    """Wrapped provider failure — never leak SDK/HTTP details upstream."""


class Carrier(Protocol):
    name: str

    def create_label(self, *, order, recipient: dict[str, Any]) -> dict[str, Any]:
        """Return {"external_id": str, "label_bytes": bytes}."""
        ...

    def track(self, external_id: str) -> list[dict[str, Any]]:
        """Return carrier tracking events, newest last."""
        ...

    def locker_points(self, country: str) -> list[dict[str, Any]]:
        """Parcel-locker locations for the LockerPicker UI."""
        ...
