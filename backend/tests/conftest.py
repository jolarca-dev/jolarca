"""Shared test fixtures.

Factories are importable from any suite; DB-backed fixtures require the
`django_db` mark so the fast non-DB suites never touch a database.
"""

import pytest


@pytest.fixture(autouse=True)
def _structured_logs(settings):
    """Ensure GDPR/audit settings are deterministic inside tests."""
    settings.GDPR_PROCESSING_HALTED = False


class _UserFactoryStub:
    """Deliberately NOT factory-boy until DB suites land (MVP tests are
    non-DB). Replace with a factory_boy Factory when integration tests
    arrive — see docs/MVP_REMAINING_WORK.md."""
