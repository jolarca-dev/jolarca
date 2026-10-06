"""Shared test fixtures.

Factories are importable from any suite; DB-backed fixtures require the
`django_db` mark so the fast non-DB suites never touch a database.
"""

from uuid import uuid4

import pytest


@pytest.fixture(autouse=True)
def _structured_logs(settings):
    """Ensure GDPR/audit settings are deterministic inside tests."""
    settings.GDPR_PROCESSING_HALTED = False


class _UserFactoryStub:
    """Deliberately NOT factory-boy until DB suites land (MVP tests are
    non-DB). Replace with a factory_boy Factory when integration tests
    arrive — see docs/MVP_REMAINING_WORK.md."""


@pytest.fixture()
def new_order(db):
    """Return a callable that creates a distinct, minimal order.

    `Order.number` is unique, and both `Shipment` and `PaymentRecord` hold a
    OneToOne to `Order` — so a test building more than one dependent row must
    give each its own order rather than reusing the `order` fixture.
    Models are imported inside the factory so the fast non-DB suites never load
    these apps at collection time.
    """
    from apps.orders_app.models import Order

    def _make(**overrides):
        params = {"number": f"JOL-T{uuid4().hex[:10].upper()}"}
        params.update(overrides)
        return Order.objects.create(**params)

    return _make


@pytest.fixture()
def order(new_order):
    """A single order — safe when the test creates at most one dependent row."""
    return new_order()


@pytest.fixture()
def shipment(new_order):
    """A shipment with its own order, so requesting `order` too cannot collide."""
    from apps.shipping_app.models import CarrierName, Shipment

    return Shipment.objects.create(order=new_order(), carrier=CarrierName.DPD)
