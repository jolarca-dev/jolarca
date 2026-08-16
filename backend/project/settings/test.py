"""Test settings — deterministic, fast, isolated. NEVER imported by prod."""

from cryptography.fernet import Fernet

from .base import *  # noqa: F403

DEBUG = False
SECRET_KEY = "insecure-test-key-only-valid-under-pytest"

# Deterministic field encryption for crypto round-trip tests: use a real key,
# generated per test-run if CI does not provide one.
import os  # noqa: E402

FIELD_ENCRYPTION_KEY = os.environ.get("FIELD_ENCRYPTION_KEY") or Fernet.generate_key().decode()

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

EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
