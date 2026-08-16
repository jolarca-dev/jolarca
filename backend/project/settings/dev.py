"""Development settings — relaxed DX, loud warnings, never silent."""

import warnings

from .base import *  # noqa: F403
from .base import SECRET_KEY

DEBUG = True

if not SECRET_KEY:
    warnings.warn(
        "DJANGO_SECRET_KEY unset — using a dev-only key. Never deploy this.",
        stacklevel=2,
    )
    SECRET_KEY = "dev-only-insecure-key-do-not-use-in-any-shared-environment"

# "backend" covers compose-internal access; no wildcard/bind hosts —
# ALLOWED_HOSTS is a Host-header allowlist, not a bind address.
ALLOWED_HOSTS = ["localhost", "127.0.0.1", "backend"]

# Dev CSRF trust for compose-exposed ports.
CSRF_TRUSTED_ORIGINS = ["http://localhost:3000", "http://localhost:8000"]

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Don't let cache misses masquerade as bugs during local work.
AXES_ENABLED = False
