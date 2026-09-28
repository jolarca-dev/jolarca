"""Contract tests for consent ledger — GAP-C01 / GAP-C04.

Consumer-driven against frontend/src/stores/consent-store.ts:
  - recordConsent()  → POST /api/v1/compliance/consent/
  - fetchConsentHistory() → GET  /api/v1/compliance/consent/

The frontend sends category booleans using its own names
(analytics/marketing/preferences); the backend stores them as
ConsentPurpose values (analytics/marketing/personalization). These
tests verify the round-trip: POST the FE payload, GET it back
unchanged.
"""

from __future__ import annotations

from uuid import uuid4

import pytest
from django.test import Client

from apps.users_app.models import ConsentPurpose, ConsentRecord, User

pytestmark = pytest.mark.django_db


def make_user() -> User:
    return User.objects.create_user(email=f"{uuid4().hex[:10]}@example.com", password="x")


def consent_payload(**overrides) -> dict:
    payload = {
        "necessary": True,
        "analytics": True,
        "marketing": False,
        "preferences": False,
        "timestamp": "2026-09-28T12:00:00.000Z",
        "version": 1,
    }
    payload.update(overrides)
    return payload


class TestConsentRecord:
    """POST /api/v1/compliance/consent/ — GAP-C01."""

    def test_anonymous_is_403(self, client: Client):
        res = client.post(
            "/api/v1/compliance/consent/",
            consent_payload(),
            content_type="application/json",
        )
        assert res.status_code == 403

    def test_records_consent_creates_three_rows(self, client: Client):
        user = make_user()
        client.force_login(user)
        res = client.post(
            "/api/v1/compliance/consent/",
            consent_payload(analytics=True, marketing=False, preferences=True),
            content_type="application/json",
        )
        assert res.status_code == 201

        records = ConsentRecord.objects.filter(user=user).order_by("purpose")
        assert records.count() == 3

        by_purpose = {r.purpose: r for r in records}
        assert by_purpose[ConsentPurpose.ANALYTICS].granted is True
        assert by_purpose[ConsentPurpose.MARKETING].granted is False
        assert by_purpose[ConsentPurpose.PERSONALIZATION].granted is True

    def test_records_capture_version_and_ip(self, client: Client):
        user = make_user()
        client.force_login(user)
        client.post(
            "/api/v1/compliance/consent/",
            consent_payload(version=2),
            content_type="application/json",
            REMOTE_ADDR="192.168.1.42",
        )
        records = ConsentRecord.objects.filter(user=user)
        for record in records:
            assert record.consent_version == "2"
            assert record.ip_address == "192.168.1.42"

    def test_necessary_is_never_stored(self, client: Client):
        """Necessary is legally exempt — no ConsentRecord for it."""
        user = make_user()
        client.force_login(user)
        client.post(
            "/api/v1/compliance/consent/",
            consent_payload(necessary=True),
            content_type="application/json",
        )
        purposes = set(ConsentRecord.objects.filter(user=user).values_list("purpose", flat=True))
        assert ConsentPurpose.TRANSACTIONS not in purposes
        # Only the three toggleable categories are stored.
        assert purposes == {
            ConsentPurpose.ANALYTICS,
            ConsentPurpose.MARKETING,
            ConsentPurpose.PERSONALIZATION,
        }

    def test_malformed_payload_is_400(self, client: Client):
        user = make_user()
        client.force_login(user)
        # Missing required boolean fields.
        res = client.post(
            "/api/v1/compliance/consent/",
            {"timestamp": "2026-09-28T12:00:00.000Z", "version": 1},
            content_type="application/json",
        )
        assert res.status_code == 400

    def test_records_are_append_only(self, client: Client):
        """Two POSTs create 6 rows (3 per snapshot), not 3."""
        user = make_user()
        client.force_login(user)
        client.post(
            "/api/v1/compliance/consent/",
            consent_payload(analytics=True),
            content_type="application/json",
        )
        client.post(
            "/api/v1/compliance/consent/",
            consent_payload(analytics=False),
            content_type="application/json",
        )
        assert ConsentRecord.objects.filter(user=user).count() == 6


class TestConsentHistory:
    """GET /api/v1/compliance/consent/ — GAP-C04."""

    def test_anonymous_is_403(self, client: Client):
        res = client.get("/api/v1/compliance/consent/")
        assert res.status_code == 403

    def test_empty_history_for_fresh_user(self, client: Client):
        user = make_user()
        client.force_login(user)
        res = client.get("/api/v1/compliance/consent/")
        assert res.status_code == 200
        body = res.json()
        assert body["history"] == []

    def test_history_returns_snapshot_after_record(self, client: Client):
        user = make_user()
        client.force_login(user)
        client.post(
            "/api/v1/compliance/consent/",
            consent_payload(analytics=True, marketing=False, preferences=True),
            content_type="application/json",
        )
        res = client.get("/api/v1/compliance/consent/")
        assert res.status_code == 200
        body = res.json()

        assert len(body["history"]) == 1
        entry = body["history"][0]
        assert entry["analytics"] is True
        assert entry["marketing"] is False
        assert entry["preferences"] is True
        assert entry["version"] == 1
        assert "timestamp" in entry

    def test_history_shows_multiple_snapshots(self, client: Client):
        user = make_user()
        client.force_login(user)
        client.post(
            "/api/v1/compliance/consent/",
            consent_payload(analytics=True, marketing=False, preferences=False),
            content_type="application/json",
        )
        client.post(
            "/api/v1/compliance/consent/",
            consent_payload(analytics=False, marketing=True, preferences=False),
            content_type="application/json",
        )
        res = client.get("/api/v1/compliance/consent/")
        body = res.json()

        assert len(body["history"]) == 2
        # Most recent first.
        assert body["history"][0]["analytics"] is False
        assert body["history"][0]["marketing"] is True
        assert body["history"][1]["analytics"] is True
        assert body["history"][1]["marketing"] is False

    def test_history_is_user_scoped(self, client: Client):
        """User A cannot see User B's consent records."""
        user_a = make_user()
        user_b = make_user()

        client.force_login(user_a)
        client.post(
            "/api/v1/compliance/consent/",
            consent_payload(analytics=True),
            content_type="application/json",
        )

        client.force_login(user_b)
        res = client.get("/api/v1/compliance/consent/")
        body = res.json()
        assert body["history"] == []

    def test_history_excludes_transactional_records(self, client: Client):
        """Registration creates a TRANSACTIONS ConsentRecord — but the
        GET endpoint reads from AuditLog, so only explicit consent
        snapshots (created via POST) appear in history.
        """
        user = make_user()
        client.force_login(user)
        # Simulate the registration-time transactions record.
        ConsentRecord.objects.create(
            user=user,
            purpose=ConsentPurpose.TRANSACTIONS,
            consent_version="1.0",
            granted=True,
        )
        res = client.get("/api/v1/compliance/consent/")
        body = res.json()
        # No AuditLog entry was created for the transactions record,
        # so history is empty — only POST snapshots appear.
        assert body["history"] == []
