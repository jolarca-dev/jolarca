"""Retention anonymization (MVP-C2) — the financial evidence survives, the
buyer linkage does not.

Runs against real PostGIS (docker-compose.test.yml / dev stack); the fast
unit suite stays DB-free by design.
"""

import hashlib
from datetime import timedelta

import pytest
from django.conf import settings
from django.utils import timezone

from apps.compliance_app.models import AuditLog, ErasureRequest, ErasureStatus
from apps.compliance_app.retention import anonymize_order_history
from apps.compliance_app.tasks import nightly_retention_sweep
from apps.orders_app.models import Order
from apps.users_app.models import User

pytestmark = pytest.mark.django_db


def _pseudonym(user) -> str:
    return hashlib.sha256(f"jol-retention:{user.pk}".encode()).hexdigest()[:32]


def _make_order(number: str, buyer, *, years_ago: float) -> Order:
    order = Order.objects.create(number=number, buyer=buyer)
    # auto_now_add blocks backdating on save(); UPDATE bypasses it.
    Order.objects.filter(pk=order.pk).update(
        created_at=timezone.now() - timedelta(days=365 * years_ago)
    )
    return Order.objects.get(pk=order.pk)


def test_anonymize_order_history_drops_buyer_and_keeps_evidence():
    user = User.objects.create_user(email="buyer@example.com", password="x")
    retention_years = settings.RETENTION_FINANCIAL_YEARS

    old = _make_order("JOL-T-000001", user, years_ago=retention_years + 1)
    fresh = _make_order("JOL-T-000002", user, years_ago=0.1)

    count = anonymize_order_history(user)

    assert count == 1
    old.refresh_from_db()
    fresh.refresh_from_db()
    assert old.buyer is None
    assert old.anonymized_ref == _pseudonym(user)
    assert old.total_gross is not None  # financial fact preserved
    assert fresh.buyer_id == user.pk
    assert fresh.anonymized_ref == ""


def test_anonymize_order_history_is_idempotent_and_scoped():
    user = User.objects.create_user(email="buyer2@example.com", password="x")
    other = User.objects.create_user(email="other@example.com", password="x")
    retention_years = settings.RETENTION_FINANCIAL_YEARS

    _make_order("JOL-T-000003", user, years_ago=retention_years + 1)
    _make_order("JOL-T-000004", other, years_ago=retention_years + 1)

    assert anonymize_order_history(user) == 1
    assert anonymize_order_history(user) == 0  # repeat sweep matches nothing

    other_order = Order.objects.get(number="JOL-T-000004")
    assert other_order.buyer_id == other.pk  # never touches other buyers


def test_nightly_sweep_only_touches_completed_erasures():
    erased = User.objects.create_user(email="erased@example.com", password="x")
    pending = User.objects.create_user(email="pending@example.com", password="x")
    retention_years = settings.RETENTION_FINANCIAL_YEARS

    _make_order("JOL-T-000005", erased, years_ago=retention_years + 1)
    _make_order("JOL-T-000006", pending, years_ago=retention_years + 1)
    ErasureRequest.objects.create(
        user=erased, status=ErasureStatus.COMPLETED, completed_at=timezone.now()
    )
    ErasureRequest.objects.create(user=pending, status=ErasureStatus.REQUESTED)

    nightly_retention_sweep.delay()  # eager under test settings

    assert Order.objects.get(number="JOL-T-000005").buyer is None
    assert Order.objects.get(number="JOL-T-000006").buyer_id == pending.pk

    entry = AuditLog.objects.filter(action="retention_sweep_executed").latest("created_at")
    assert entry.data["orders_anonymized"] == 1
