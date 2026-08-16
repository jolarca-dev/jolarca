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

_CARRIERS = {CarrierName.DPD: DpdCarrier, CarrierName.OMNIVA: OmnivaCarrier}


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
