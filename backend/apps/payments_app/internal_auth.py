"""Internal payment API authentication — Model A (ADR-0005).

The payment boundary authenticates program callers (service accounts,
never end-user credentials) with:

- mTLS at the transport layer (deployment requirement; the NetworkPolicy
  + cert pinning live in the infra plane, STEP 21), AND
- an HMAC-SHA256 request signature at the application layer:
  X-JOL-Signature = HMAC(K_caller, "{ts}.{METHOD}.{path}.{sha256(body)}")
  with a 60-second timestamp TTL to defeat replay.

Caller identities and their PRODUCT BINDING come from settings
(INTERNAL_CALLERS). The binding is enforced server-side on every
endpoint: a caller may only act on its own product. Fail-closed: no
configured callers -> every request is rejected.
"""

from __future__ import annotations

import hashlib
import hmac
import time

from django.conf import settings

REQUEST_TTL_SECONDS = 60


class InternalAuthError(Exception):
    """Any authentication failure on the internal payment API."""


def _expected_signature(caller_key: str, ts: str, method: str, path: str, body: bytes) -> str:
    payload = f"{ts}.{method}.{path}.{hashlib.sha256(body).hexdigest()}"
    return hmac.new(caller_key.encode(), payload.encode(), hashlib.sha256).hexdigest()


def authenticate(request) -> dict:
    """Return the caller config {caller_id, product} or raise InternalAuthError."""
    caller_id = request.headers.get("X-JOL-Caller", "")
    ts = request.headers.get("X-JOL-Timestamp", "")
    signature = request.headers.get("X-JOL-Signature", "")

    callers = getattr(settings, "INTERNAL_CALLERS", {}) or {}
    caller = callers.get(caller_id)
    if caller is None or not caller.get("key"):
        raise InternalAuthError("unknown caller")

    try:
        ts_int = int(ts)
    except (TypeError, ValueError):
        raise InternalAuthError("invalid timestamp") from None
    if abs(int(time.time()) - ts_int) > REQUEST_TTL_SECONDS:
        raise InternalAuthError("timestamp outside TTL (replay protection)")

    expected = _expected_signature(caller["key"], ts, request.method, request.path, request.body)
    if not hmac.compare_digest(expected, signature):
        raise InternalAuthError("signature mismatch")

    return {"caller_id": caller_id, "product": caller["product"]}
