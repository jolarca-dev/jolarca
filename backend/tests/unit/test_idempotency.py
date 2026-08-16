"""Idempotency contract — no DB needed for fingerprint semantics."""

from apps.core.idempotency import fingerprint


def test_fingerprint_is_key_order_independent():
    a = fingerprint({"cart": "x", "items": [1, 2]})
    b = fingerprint({"items": [1, 2], "cart": "x"})
    assert a == b


def test_fingerprint_changes_with_payload():
    assert fingerprint({"amount": "10.00"}) != fingerprint({"amount": "10.01"})
