"""Contract tests for the internal payment API — Model A (ADR-0005).

These tests are the CONSUMER-DRIVEN CONTRACT SUITE for
jol-m-infrastructure/docs/payment-api-contract.md. Written FIRST (Step 20):
they fail until the boundary implements /internal/v1. They run against the
live local boundary (docker compose test stack: real Postgres + Redis).

Coverage:
- caller<->product binding (403), auth failures (401: unknown caller,
  forged signature, expired timestamp)
- intent creation + PAN-leak schema guard (no card fields ever)
- idempotency: replay returns stored response; key+body mismatch = 409;
  missing Idempotency-Key = 400
- scoped GET: other product's intent = 404 (non-enumeration)
- refunds: allowed on succeeded intents only; idempotent
- degraded mode: boundary outage -> 503 retryable, never partial success
- webhook: forged signature -> 400 (C4 defect fix); dedup holds;
  per-product forwarding to hub signed with X-Product (C4/C5 wiring)
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid

import pytest
from django.test import Client

pytestmark = pytest.mark.django_db

HUB_CALLER = "hub-payments"
MARKETPLACE_CALLER = "marketplace-internal"

# Test-settings keys (project.settings.test). Never commit real keys.
HUB_KEY = "internal-test-key-hub-0123456789abcdef"  # gitleaks:allow
MARKETPLACE_KEY = "internal-test-key-marketplace-0123456789abcdef"  # gitleaks:allow
HUB_DELIVERY_KEY = "internal-test-delivery-key-hub-fedcba9876543210"  # gitleaks:allow

WEBHOOK_SECRET = "whsec_internal_contract_test_secret"

FORBIDDEN_PAN_KEYS = {
    "card",
    "number",
    "cvc",
    "cvv",
    "exp_month",
    "exp_year",
    "expiry",
    "last4",
    "brand",
    "fingerprint",
    "payment_method",
    "billing_details",
}


def sign(caller: str, key: str, method: str, path: str, body: bytes, ts: int) -> str:
    payload = f"{ts}.{method}.{path}.{hashlib.sha256(body).hexdigest()}"
    return hmac.new(key.encode(), payload.encode(), hashlib.sha256).hexdigest()


def signed_request(
    client: Client,
    method: str,
    path: str,
    body: dict | None,
    caller: str = HUB_CALLER,
    key: str = HUB_KEY,
    idempotency_key: str | None = None,
    ts: int | None = None,
    signature: str | None = None,
):
    raw = b"" if body is None else json.dumps(body).encode()
    ts = ts if ts is not None else int(time.time())
    headers = {
        "HTTP_X_JOL_CALLER": caller,
        "HTTP_X_JOL_TIMESTAMP": str(ts),
        "HTTP_X_JOL_SIGNATURE": signature or sign(caller, key, method, path, raw, ts),
    }
    if idempotency_key is not None:
        headers["HTTP_IDEMPOTENCY_KEY"] = idempotency_key
    fn = getattr(client, method.lower())
    return fn(path, data=raw, content_type="application/json", **headers)


def assert_no_pan(payload: dict) -> None:
    keys = set()

    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                keys.add(str(k).lower())
                walk(v)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(payload)
    leaked = keys & FORBIDDEN_PAN_KEYS
    assert not leaked, f"PAN-leak contract violation: {leaked}"


def create_hub_intent(client: Client, idem: str | None = None, amount: int = 2500):
    return signed_request(
        client,
        "POST",
        "/internal/v1/payment-intents",
        {
            "product": "hub",
            "amount_cents": amount,
            "currency": "EUR",
            "metadata": {"campaign_id": "contract-test"},
            "customer_ref": "hub-dnr-contract",
        },
        idempotency_key=idem or str(uuid.uuid4()),
    )


@pytest.fixture
def client():
    return Client()


# ---------------------------------------------------------------------------
# Auth + binding
# ---------------------------------------------------------------------------


def test_unknown_caller_rejected(client):
    resp = signed_request(
        client,
        "POST",
        "/internal/v1/payment-intents",
        {"product": "hub", "amount_cents": 100, "currency": "EUR"},
        caller="intruder",
        key="whatever",
        idempotency_key=str(uuid.uuid4()),
    )
    assert resp.status_code == 401


def test_forged_signature_rejected(client):
    resp = signed_request(
        client,
        "POST",
        "/internal/v1/payment-intents",
        {"product": "hub", "amount_cents": 100, "currency": "EUR"},
        idempotency_key=str(uuid.uuid4()),
        signature="0" * 64,
    )
    assert resp.status_code == 401


def test_expired_timestamp_rejected(client):
    resp = signed_request(
        client,
        "POST",
        "/internal/v1/payment-intents",
        {"product": "hub", "amount_cents": 100, "currency": "EUR"},
        idempotency_key=str(uuid.uuid4()),
        ts=int(time.time()) - 120,
    )
    assert resp.status_code == 401


def test_caller_product_binding_enforced(client):
    """hub caller may NOT create marketplace intents (server-enforced)."""
    resp = signed_request(
        client,
        "POST",
        "/internal/v1/payment-intents",
        {
            "product": "marketplace",
            "amount_cents": 100,
            "currency": "EUR",
            "metadata": {},
            "customer_ref": "x",
        },
        caller=HUB_CALLER,
        key=HUB_KEY,
        idempotency_key=str(uuid.uuid4()),
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# Intent creation, PAN-leak schema, scoped reads
# ---------------------------------------------------------------------------


def test_create_intent_ok_and_pan_free(client):
    resp = create_hub_intent(client)
    assert resp.status_code == 201, resp.content
    data = resp.json()
    assert data["product"] == "hub"
    assert data["status"] == "requires_payment_method"
    assert data["amount_cents"] == 2500
    assert data["currency"] == "EUR"
    assert data["client_secret"]
    assert_no_pan(data)


def test_missing_idempotency_key_400(client):
    resp = signed_request(
        client,
        "POST",
        "/internal/v1/payment-intents",
        {
            "product": "hub",
            "amount_cents": 100,
            "currency": "EUR",
            "metadata": {},
            "customer_ref": "x",
        },
    )
    assert resp.status_code == 400


def test_idempotent_replay_returns_same_intent(client):
    idem = str(uuid.uuid4())
    first = create_hub_intent(client, idem=idem)
    second = create_hub_intent(client, idem=idem)
    assert first.status_code == 201
    assert second.status_code in (200, 201)
    assert first.json()["id"] == second.json()["id"]


def test_idempotency_conflict_409(client):
    idem = str(uuid.uuid4())
    create_hub_intent(client, idem=idem, amount=2500)
    resp = create_hub_intent(client, idem=idem, amount=9999)
    assert resp.status_code == 409


def test_get_scoped_404_non_enumeration(client):
    """Marketplace caller cannot read hub intents: 404, not 403 (no oracle)."""
    created = create_hub_intent(client)
    intent_id = created.json()["id"]
    # owner read works
    own = signed_request(client, "GET", f"/internal/v1/payment-intents/{intent_id}", None)
    assert own.status_code == 200
    assert_no_pan(own.json())
    # other product caller gets 404
    foreign = signed_request(
        client,
        "GET",
        f"/internal/v1/payment-intents/{intent_id}",
        None,
        caller=MARKETPLACE_CALLER,
        key=MARKETPLACE_KEY,
    )
    assert foreign.status_code == 404
    # nonexistent id also 404 (indistinguishable)
    ghost = signed_request(
        client,
        "GET",
        f"/internal/v1/payment-intents/{uuid.uuid4()}",
        None,
    )
    assert ghost.status_code == 404


# ---------------------------------------------------------------------------
# Refunds (RSK-010 boundary side)
# ---------------------------------------------------------------------------


def _succeeded_intent(client) -> str:
    from apps.payments_app.models import InternalPaymentIntent

    resp = create_hub_intent(client)
    intent_id = resp.json()["id"]
    InternalPaymentIntent.objects.filter(pk=intent_id).update(status="succeeded")
    return intent_id


def test_refund_requires_succeeded_intent(client):
    fresh = create_hub_intent(client).json()["id"]
    resp = signed_request(
        client,
        "POST",
        "/internal/v1/refunds",
        {"payment_intent_id": fresh, "reason": "donor_request_duplicate"},
        idempotency_key=str(uuid.uuid4()),
    )
    assert resp.status_code == 422


def test_refund_ok_and_idempotent(client):
    intent_id = _succeeded_intent(client)
    idem = str(uuid.uuid4())
    body = {
        "payment_intent_id": intent_id,
        "amount_cents": 2500,
        "reason": "donor_request_duplicate",
    }
    first = signed_request(client, "POST", "/internal/v1/refunds", body, idempotency_key=idem)
    second = signed_request(client, "POST", "/internal/v1/refunds", body, idempotency_key=idem)
    assert first.status_code == 201, first.content
    assert second.status_code in (200, 201)
    assert first.json()["id"] == second.json()["id"]
    assert_no_pan(first.json())


# ---------------------------------------------------------------------------
# Degraded mode
# ---------------------------------------------------------------------------


def test_degraded_mode_503_retryable(client, settings):
    settings.INTERNAL_PAYMENTS_SIMULATE_OUTAGE = True
    resp = create_hub_intent(client)
    assert resp.status_code == 503
    data = resp.json()
    assert data["status"] == 503
    assert data.get("retryable") is True


# ---------------------------------------------------------------------------
# Webhook integrity (C4) + forwarding
# ---------------------------------------------------------------------------


def _stripe_webhook_body(event_id: str, intent_id: str) -> bytes:
    return json.dumps(
        {
            "id": event_id,
            "type": "payment_intent.succeeded",
            "data": {"object": {"id": intent_id, "status": "succeeded"}},
        }
    ).encode()


def _stripe_signature(body: bytes, secret: str, ts: int) -> str:
    signed_payload = f"{ts}.".encode() + body
    v1 = hmac.new(secret.encode(), signed_payload, hashlib.sha256).hexdigest()
    return f"t={ts},v1={v1}"


def test_webhook_forgery_returns_400(client, settings):
    settings.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
    body = _stripe_webhook_body("evt_forge_1", "pi_whatever")
    resp = client.post(
        "/api/v1/payments/webhooks/stripe/",
        data=body,
        content_type="application/json",
        HTTP_STRIPE_SIGNATURE="t=123,v1=" + "0" * 64,
    )
    assert resp.status_code == 400


def test_webhook_valid_dedup_and_hub_forwarding(client, settings, monkeypatch):
    settings.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET
    settings.CELERY_TASK_ALWAYS_EAGER = True

    from apps.payments_app.models import InternalPaymentIntent

    intent = InternalPaymentIntent.objects.create(
        caller=HUB_CALLER,
        product="hub",
        amount_cents=2500,
        currency="EUR",
        customer_ref="hub-dnr-contract",
        status="requires_payment_method",
        stripe_payment_intent_id="pi_hub_forward_test",
    )

    captured = {}

    def fake_post(url, *, data=None, headers=None, timeout=None):
        captured["url"] = url
        captured["data"] = data
        captured["headers"] = headers

        class R:
            status_code = 200

            def raise_for_status(self):
                return None

        return R()

    monkeypatch.setattr("apps.payments_app.internal_forward.requests.post", fake_post)

    body = _stripe_webhook_body("evt_fwd_1", "pi_hub_forward_test")
    ts = int(time.time())
    resp = client.post(
        "/api/v1/payments/webhooks/stripe/",
        data=body,
        content_type="application/json",
        HTTP_STRIPE_SIGNATURE=_stripe_signature(body, WEBHOOK_SECRET, ts),
    )
    assert resp.status_code == 200, resp.content

    # Per-product forwarding happened, signed, with X-Product: hub
    assert captured["headers"]["X-Product"] == "hub"
    envelope = json.loads(captured["data"])
    assert envelope["product"] == "hub"
    assert envelope["payment_intent_id"] == str(intent.pk)
    assert_no_pan(envelope)
    # signature verifies against the hub delivery key
    payload = (
        f"{captured['headers']['X-JOL-Timestamp']}.{hashlib.sha256(captured['data']).hexdigest()}"
    )
    expected = hmac.new(HUB_DELIVERY_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()
    assert hmac.compare_digest(expected, captured["headers"]["X-JOL-Signature"])

    # Replay -> dedup, no second forward
    captured.clear()
    resp2 = client.post(
        "/api/v1/payments/webhooks/stripe/",
        data=body,
        content_type="application/json",
        HTTP_STRIPE_SIGNATURE=_stripe_signature(body, WEBHOOK_SECRET, ts),
    )
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "duplicate_ignored"
    assert "url" not in captured

    # Intent status advanced via the handler
    intent.refresh_from_db()
    assert intent.status == "succeeded"
