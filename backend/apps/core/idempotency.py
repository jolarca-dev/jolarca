"""Idempotency-Key utilities.

Consumers: orders_app.services.checkout (client retry safety for money paths)
and payments_app.webhooks (Stripe may deliver the same event many times).

Contract:
- Same key + same payload  → replay the stored response.
- Same key + other payload → IdempotencyConflict (409): this is either a
  client bug or an attack attempting to poison a token.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from .models import IdempotencyRecord


class IdempotencyConflict(Exception):
    """Idempotency key reused with a different request payload."""


def fingerprint(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def get_cached_response(scope: str, key: str, request_payload: dict[str, Any]):
    """Return the stored IdempotencyRecord, enforce fingerprint, or None."""
    record = IdempotencyRecord.objects.filter(scope=scope, key=key).first()
    if record is None:
        return None
    if record.request_fingerprint != fingerprint(request_payload):
        raise IdempotencyConflict(f"Idempotency key '{key}' reused with a different payload.")
    return record


def store_response(
    scope: str,
    key: str,
    request_payload: dict[str, Any],
    status: int,
    body: dict[str, Any],
) -> IdempotencyRecord:
    record, _ = IdempotencyRecord.objects.update_or_create(
        scope=scope,
        key=key,
        defaults={
            "request_fingerprint": fingerprint(request_payload),
            "response_status": status,
            "response_body": body,
        },
    )
    return record
