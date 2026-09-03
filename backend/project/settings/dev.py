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

# Dev CSRF trust for compose-exposed ports and local host-side test servers.
CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:8000",
]

# django-cors-headers — dev only; production hardens origin list.
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
]
CORS_ALLOW_CREDENTIALS = True

# CSRF cookie must be accessible cross-origin in dev so the JS double-submit
# can read it. HttpOnly stays False for the CSRF token (documented exception).
CSRF_COOKIE_SECURE = False
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_NAME = "jol_csrf"

# Session cookie — secure defaults are relaxed only for local HTTP dev.
SESSION_COOKIE_SECURE = False
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_NAME = "jol_session"

EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"

# Don't let cache misses masquerade as bugs during local work.
AXES_ENABLED = False
