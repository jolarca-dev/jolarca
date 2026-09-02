"""Contract tests for payments_app — webhook handling, payment records, PCI boundary."""

from __future__ import annotations

import pytest
from django.test import Client
from decimal import Decimal

from apps.payments_app.models import PaymentRecord, StripeWebhookEvent

pytestmark = pytest.mark.django_db


class TestStripeWebhookEvent:
    def test_create_webhook_event(self):
        event = StripeWebhookEvent.objects.create(
            event_id="evt_test_123",
            event_type="payment_intent.succeeded",
            payload={"id": "pi_test_123", "amount": 5000},
        )
        assert event.event_id == "evt_test_123"
        assert event.is_processed is False

    def test_event_id_unique(self):
        StripeWebhookEvent.objects.create(
            event_id="evt_unique",
            event_type="test",
            payload={},
        )
        from django.db import IntegrityError
        with pytest.raises(IntegrityError):
            StripeWebhookEvent.objects.create(
                event_id="evt_unique",
                event_type="test",
                payload={},
            )

    def test_mark_as_processed(self):
        from django.utils import timezone
        event = StripeWebhookEvent.objects.create(
            event_id="evt_proc",
            event_type="payment_intent.succeeded",
            payload={},
        )
        assert event.is_processed is False
        event.processed_at = timezone.now()
        event.save()
        event.refresh_from_db()
        assert event.is_processed is True

    def test_no_card_data_in_payload_model(self):
        """PCI SAQ-A: no PAN, CVC, or full track data in our models."""
        field_names = {f.name for f in StripeWebhookEvent._meta.get_fields()}
        assert "card_number" not in field_names
        assert "cvc" not in field_names
        assert "pan" not in field_names


class TestPaymentRecord:
    def test_create_payment_record(self, order):
        record = PaymentRecord.objects.create(
            order=order,
            amount=Decimal("49.99"),
            currency="EUR",
            status="succeeded",
        )
        assert record.amount == Decimal("49.99")
        assert record.currency == "EUR"
        assert record.product == "marketplace"

    def test_payment_record_requires_order(self):
        from django.db import IntegrityError
        with pytest.raises(IntegrityError):
            PaymentRecord.objects.create(
                amount=Decimal("10.00"),
            )

    def test_refunded_amount_defaults_to_zero(self, order):
        record = PaymentRecord.objects.create(
            order=order,
            amount=Decimal("100.00"),
        )
        assert record.refunded_amount == Decimal("0.00")

    def test_product_attribution(self, order):
        """ADR-0005: revenue attribution separates marketplace from hub."""
        record = PaymentRecord.objects.create(
            order=order,
            amount=Decimal("25.00"),
            product="marketplace",
        )
        assert record.product == "marketplace"


class TestStripeTestMode:
    def test_no_live_keys_in_codebase(self):
        """Ensure no sk_live keys are hardcoded anywhere."""
        import subprocess
        result = subprocess.run(
            ["grep", "-rn", "sk_live", "apps/", "project/"],
            capture_output=True, text=True, cwd="/opt/jolarca/repos/jolarca/backend",
        )
        # grep returns 1 if no matches found (which is what we want)
        assert result.returncode == 1, f"Found sk_live in codebase: {result.stdout}"
