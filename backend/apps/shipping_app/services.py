"""Shipping service layer: carrier selection + circuit breaker protection.

Carriers are flaky third parties; a carrier outage must degrade checkout
delivery estimates, never take the API down. CircuitBreaker fails fast and
recovers automatically (half-open probe).
"""

from __future__ import annotations

import threading
import time

import structlog

from apps.core.exceptions import ExternalServiceUnavailable

from .carriers.base import CarrierError
from .carriers.dpd import DpdCarrier
from .carriers.omniva import OmnivaCarrier
from .models import CarrierName, Shipment, ShipmentStatus

audit = structlog.get_logger("jol.audit")

_CARRIERS: dict[str, type[DpdCarrier] | type[OmnivaCarrier]] = {
    CarrierName.DPD: DpdCarrier,
    CarrierName.OMNIVA: OmnivaCarrier,
}


class CircuitBreaker:
    """Per-carrier breaker: CLOSED → OPEN after `threshold` consecutive
    failures; HALF_OPEN after `recovery_s` permits one probe call."""

    def __init__(self, name: str, threshold: int = 5, recovery_s: float = 60.0):
        self.name = name
        self.threshold = threshold
        self.recovery_s = recovery_s
        self._failures = 0
        self._opened_at: float | None = None
        self._lock = threading.Lock()

    @property
    def is_open(self) -> bool:
        with self._lock:
            if self._opened_at is None:
                return False
            if time.monotonic() - self._opened_at >= self.recovery_s:
                return False  # half-open: allow a probe
            return True

    def record_success(self) -> None:
        with self._lock:
            self._failures = 0
            self._opened_at = None

    def record_failure(self) -> None:
        with self._lock:
            self._failures += 1
            if self._failures >= self.threshold:
                self._opened_at = time.monotonic()
                audit.error("carrier_circuit_open", carrier=self.name)


_BREAKERS: dict[str, CircuitBreaker] = {}


def _breaker(name: str) -> CircuitBreaker:
    if name not in _BREAKERS:
        _BREAKERS[name] = CircuitBreaker(name)
    return _BREAKERS[name]


def get_carrier(name: str):
    try:
        cls = _CARRIERS[name]
    except KeyError as exc:
        raise CarrierError(f"Unknown carrier '{name}'") from exc
    return cls()


def call_with_breaker(carrier_name: str, func, *args, **kwargs):
    breaker = _breaker(carrier_name)
    if breaker.is_open:
        raise ExternalServiceUnavailable(f"Carrier '{carrier_name}' is temporarily unavailable.")
    try:
        result = func(*args, **kwargs)
    except (CarrierError, NotImplementedError):
        breaker.record_failure()
        raise
    except Exception as exc:  # noqa: BLE001 — network boundary
        breaker.record_failure()
        raise CarrierError(str(exc)) from exc
    breaker.record_success()
    return result


def create_shipment(order, carrier_name: str = CarrierName.DPD, locker_id: str = "") -> Shipment:
    """Create the shipment record, then request a label via the carrier.

    Label failure leaves the shipment in CREATED for retry — it does NOT
    roll back the order (money and logistics are decoupled).
    """
    shipment, _ = Shipment.objects.get_or_create(
        order=order, defaults={"carrier": carrier_name, "locker_id": locker_id}
    )
    carrier = get_carrier(shipment.carrier)
    try:
        result = call_with_breaker(
            shipment.carrier,
            carrier.create_label,
            order=order,
            recipient={},  # recipient assembly: MVP-H3
        )
    except (CarrierError, NotImplementedError, ExternalServiceUnavailable) as exc:
        audit.warning("shipment_label_pending", order_id=str(order.pk), reason=str(exc))
        return shipment

    shipment.external_id = result["external_id"]
    shipment.status = ShipmentStatus.LABEL_READY
    shipment.save(update_fields=["external_id", "status", "modified_at"])
    return shipment


# --------------------------------------------------------------------------
# Checkout delivery catalogue (GAP-H02) — prices are POLICY DATA owned by
# the marketplace (not external carrier responses), so a versioned in-repo
# table is the honest source of truth until dynamic rating lands.
# Prices are gross EUR; eta_days is a working-day range string.
# --------------------------------------------------------------------------
SHIPPING_RATES: dict[str, list[dict]] = {
    "LT": [
        {"id": "courier", "price": "3.49", "currency": "EUR", "eta_days": "1-2"},
        {"id": "omniva_locker", "price": "2.49", "currency": "EUR", "eta_days": "1-2"},
    ],
    "LV": [
        {"id": "courier", "price": "3.99", "currency": "EUR", "eta_days": "1-3"},
        {"id": "omniva_locker", "price": "2.79", "currency": "EUR", "eta_days": "1-3"},
    ],
    "EE": [
        {"id": "courier", "price": "4.49", "currency": "EUR", "eta_days": "2-3"},
        {"id": "omniva_locker", "price": "2.99", "currency": "EUR", "eta_days": "2-3"},
    ],
}


def shipping_options(country: str) -> list[dict]:
    """Delivery methods + prices for a destination country (empty if unknown)."""
    return [dict(option) for option in SHIPPING_RATES.get(country.upper(), [])]


def shipping_fee(country: str, method: str) -> str | None:
    """Gross fee for a method/country pair — None when not offered."""
    for option in SHIPPING_RATES.get(country.upper(), []):
        if option["id"] == method:
            return option["price"]
    return None


# --------------------------------------------------------------------------
# Parcel-locker directory (GAP-H01). The LIVE carrier APIs remain unwired
# (carriers raise NotImplementedError — MVP-H2); checkout serves this
# curated seed directory and the endpoint says so ("source": "curated").
# Never presented as live carrier availability.
# --------------------------------------------------------------------------
CURATED_LOCKERS: dict[str, list[dict]] = {
    "LT": [
        {
            "id": "LT-001",
            "name": "Vilnius — Gedimino pr. 9",
            "address": "Gedimino pr. 9",
            "city": "Vilnius",
        },
        {
            "id": "LT-002",
            "name": "Vilnius — Ozo g. 14 (Akropolis)",
            "address": "Ozo g. 14",
            "city": "Vilnius",
        },
        {
            "id": "LT-003",
            "name": "Kaunas — K. Donelaičio g. 60",
            "address": "K. Donelaičio g. 60",
            "city": "Kaunas",
        },
        {
            "id": "LT-004",
            "name": "Klaipėda — Taikos pr. 61",
            "address": "Taikos pr. 61",
            "city": "Klaipėda",
        },
        {
            "id": "LT-005",
            "name": "Šiauliai — Tilžės g. 109",
            "address": "Tilžės g. 109",
            "city": "Šiauliai",
        },
    ],
    "LV": [
        {
            "id": "LV-001",
            "name": "Rīga — Brīvības iela 40",
            "address": "Brīvības iela 40",
            "city": "Rīga",
        },
        {
            "id": "LV-002",
            "name": "Rīga — 13. janvāra iela 23",
            "address": "13. janvāra iela 23",
            "city": "Rīga",
        },
        {
            "id": "LV-003",
            "name": "Daugavpils — Rīgas iela 20",
            "address": "Rīgas iela 20",
            "city": "Daugavpils",
        },
        {
            "id": "LV-004",
            "name": "Liepāja — Lielā iela 10",
            "address": "Lielā iela 10",
            "city": "Liepāja",
        },
    ],
    "EE": [
        {
            "id": "EE-001",
            "name": "Tallinn — Viru Keskus",
            "address": "Viru väljak 6",
            "city": "Tallinn",
        },
        {
            "id": "EE-002",
            "name": "Tallinn — Pärnu mnt 102",
            "address": "Pärnu mnt 102",
            "city": "Tallinn",
        },
        {"id": "EE-003", "name": "Tartu — Küüni tn 7", "address": "Küüni tn 7", "city": "Tartu"},
        {
            "id": "EE-004",
            "name": "Pärnu — Hommiku tn 2",
            "address": "Hommiku tn 2",
            "city": "Pärnu",
        },
    ],
}


def locker_directory(country: str, carrier: str) -> list[dict]:
    """Curated locker list for the picker. Omniva leads the Baltic locker
    network; DPD has no public locker catalogue here (returns [])."""
    if carrier != CarrierName.OMNIVA:
        return []
    return [dict(locker) for locker in CURATED_LOCKERS.get(country.upper(), [])]
