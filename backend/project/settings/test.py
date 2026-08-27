"""Test settings — deterministic, fast, isolated. NEVER imported by prod."""

from cryptography.fernet import Fernet

from .base import *  # noqa: F403

DEBUG = False
SECRET_KEY = "insecure-test-key-only-valid-under-pytest"

# Deterministic field encryption for crypto round-trip tests: honour a
# VALID key from CI, but a placeholder/absent value (sourced dev .env)
# would crash EncryptedTextField — fall back to a generated key.
import os  # noqa: E402


def _test_encryption_key() -> str:
    candidate = os.environ.get("FIELD_ENCRYPTION_KEY") or ""
    try:
        Fernet(candidate.encode())
        return candidate
    except Exception:  # noqa: BLE001 — any malformed key → fresh test key
        return Fernet.generate_key().decode()


FIELD_ENCRYPTION_KEY = _test_encryption_key()

# Fast password hashing (tests only).
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]

# Celery: run inline, no broker dependency for unit/security suites.
CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True

AXES_ENABLED = False
# axes.W001 warns about the locmem cache (per-process state). Tests isolate
# from Redis on purpose and axes is disabled here, so the warning is silenced
# in the test environment ONLY — production uses the Redis-backed cache.
SILENCED_SYSTEM_CHECKS = ["axes.W001"]

# Local-memory cache: tests must not depend on Redis being up.
CACHES = {"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}}

# Throttling is load protection, not contract: the contract suite exercises
# many anonymous endpoints (search, storefront, catalog) through one shared
# "testserver" anon bucket, which exhausts 60/min as the public surface
# grows and surfaces as spurious 429s. No test asserts throttle behavior.
REST_FRAMEWORK["DEFAULT_THROTTLE_RATES"] = {  # noqa: F405
    "anon": "10000/min",
    "user": "10000/min",
}

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

# Internal payment API contract-test keys (tests only — never production).
INTERNAL_CALLERS = {
    "hub-payments": {
        "product": "hub",
        "key": "internal-test-key-hub-0123456789abcdef",  # gitleaks:allow
    },
    "marketplace-internal": {
        "product": "marketplace",
        "key": "internal-test-key-marketplace-0123456789abcdef",  # gitleaks:allow
    },
}
INTERNAL_WEBHOOK_TARGETS = {"hub": "http://hub.internal.invalid/internal/v1/payment-events"}
INTERNAL_WEBHOOK_KEYS = {"hub": "internal-test-delivery-key-hub-fedcba9876543210"}  # gitleaks:allow
INTERNAL_PAYMENTS_SIMULATE_OUTAGE = False
