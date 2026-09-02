"""Unit tests for shipping_app models and logic."""

from __future__ import annotations

import pytest
from django.db import IntegrityError

from apps.shipping_app.models import CarrierName, Shipment, ShipmentStatus, TrackingEvent

pytestmark = pytest.mark.django_db


class TestShipmentModel:
    def test_create_shipment_with_required_fields(self, order):
        shipment = Shipment.objects.create(
            order=order,
            carrier=CarrierName.DPD,
        )
        assert shipment.carrier == "dpd"
        assert shipment.status == ShipmentStatus.CREATED
        assert shipment.external_id == ""
        assert shipment.label_key == ""
        assert shipment.locker_id == ""

    def test_shipment_requires_order(self):
        with pytest.raises(IntegrityError):
            Shipment.objects.create(carrier=CarrierName.OMNIVA)

    def test_shipment_status_transitions(self, shipment):
        assert shipment.status == ShipmentStatus.CREATED
        shipment.status = ShipmentStatus.LABEL_READY
        shipment.save()
        shipment.refresh_from_db()
        assert shipment.status == "label_ready"

    def test_shipment_carrier_choices(self, order):
        for carrier in CarrierName.values:
            s = Shipment.objects.create(order=order, carrier=carrier)
            assert s.carrier == carrier

    def test_shipment_locker_id_for_omniva(self, order):
        shipment = Shipment.objects.create(
            order=order,
            carrier=CarrierName.OMNIVA,
            locker_id="OMN-LT-12345",
        )
        assert shipment.locker_id == "OMN-LT-12345"


class TestTrackingEvent:
    def test_create_tracking_event(self, shipment):
        event = TrackingEvent.objects.create(
            shipment=shipment,
            carrier_status="in_transit",
            occurred_at="2026-09-01T12:00:00Z",
            raw={"location": "Vilnius Hub", "description": "Departed"},
        )
        assert event.carrier_status == "in_transit"
        assert event.raw["location"] == "Vilnius Hub"

    def test_tracking_events_ordered_by_occurred_at(self, shipment):
        TrackingEvent.objects.create(
            shipment=shipment, carrier_status="delivered",
            occurred_at="2026-09-02T12:00:00Z", raw={},
        )
        TrackingEvent.objects.create(
            shipment=shipment, carrier_status="in_transit",
            occurred_at="2026-09-01T12:00:00Z", raw={},
        )
        events = list(shipment.events.order_by("occurred_at"))
        assert events[0].carrier_status == "in_transit"
        assert events[1].carrier_status == "delivered"

    def test_tracking_event_requires_shipment(self):
        with pytest.raises(IntegrityError):
            TrackingEvent.objects.create(
                shipment_id="00000000-0000-0000-0000-000000000000",
                carrier_status="test",
                occurred_at="2026-09-01T12:00:00Z",
            )
