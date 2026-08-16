"""Erasure registry completeness — CI fails if a PII store lacks a handler."""

from apps.compliance_app.services import verify_registry


def test_all_pii_stores_have_erasure_handlers():
    missing = verify_registry()
    assert missing == [], f"Apps storing personal data without erasure handlers: {missing}"
