"""Internal webhook forwarding — per-product event delivery (ADR-0005).

Stripe webhooks land ONLY on this boundary. For every product-scoped
event, the boundary re-delivers a signed envelope to the product owner:

    POST {target}  X-Product: hub
    X-JOL-Timestamp / X-JOL-Signature = HMAC(K_delivery, "{ts}.{sha256(body)}")

Envelopes are PAN-free by construction (whitelist fields only). Delivery
is at-least-once: callers deduplicate by event_id (contract §3).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
import uuid

import requests
import structlog
from django.conf import settings
from django.utils import timezone

audit = structlog.get_logger("jol.audit")

# Envelope field whitelist — nothing else may cross the boundary.
ENVELOPE_FIELDS = (
    "event_id",
    "type",
    "product",
    "payment_intent_id",
    "status",
    "amount_cents",
    "currency",
    "occurred_at",
)


def build_envelope(intent, event_type: str) -> dict:
    return {
        "event_id": f"evt_internal_{uuid.uuid4().hex[:16]}",
        "type": event_type,
        "product": intent.product,
        "payment_intent_id": str(intent.pk),
        "status": intent.status,
        "amount_cents": intent.amount_cents,
        "currency": intent.currency,
        "occurred_at": timezone.now().isoformat(),
    }


def sign_envelope(body: bytes, delivery_key: str, ts: int) -> str:
    payload = f"{ts}.{hashlib.sha256(body).hexdigest()}"
    return hmac.new(delivery_key.encode(), payload.encode(), hashlib.sha256).hexdigest()


def forward_product_event(intent, event_type: str) -> bool:
    """Forward a signed envelope to the intent's product owner.

    Returns True when delivered (HTTP < 500) or when no target is
    configured (marketplace-internal events are consumed locally).
    Raises on transport failure so the celery task retries.
    """
    targets = getattr(settings, "INTERNAL_WEBHOOK_TARGETS", {}) or {}
    keys = getattr(settings, "INTERNAL_WEBHOOK_KEYS", {}) or {}
    url = targets.get(intent.product)
    if not url:
        return True  # product consumes events locally (marketplace)

    envelope = {k: v for k, v in build_envelope(intent, event_type).items() if k in ENVELOPE_FIELDS}
    body = json.dumps(envelope).encode()
    ts = int(time.time())
    headers = {
        "Content-Type": "application/json",
        "X-Product": intent.product,
        "X-JOL-Timestamp": str(ts),
        "X-JOL-Signature": sign_envelope(body, keys[intent.product], ts),
    }
    resp = requests.post(url, data=body, headers=headers, timeout=10)
    audit.info(
        "internal_webhook_forwarded",
        product=intent.product,
        event_type=event_type,
        status_code=resp.status_code,
    )
    resp.raise_for_status()
    return True
