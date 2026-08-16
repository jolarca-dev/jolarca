"""Production settings — fail-closed.

Every security-relevant value MUST come from the environment. Missing values
raise ImproperlyConfigured at boot; the service refuses to start rather than
run in a degraded security posture.
"""

from .base import *  # noqa: F403
from .base import ALLOWED_HOSTS, FIELD_ENCRYPTION_KEY, SECRET_KEY
from .validation import validate_production

DEBUG = False

# --- Refuse-to-boot checks (unit-tested in tests/security) ------------------
validate_production(
    secret_key=SECRET_KEY,
    allowed_hosts=ALLOWED_HOSTS,
    field_encryption_key=FIELD_ENCRYPTION_KEY,
)

# --- Transport security ------------------------------------------------------
SECURE_SSL_REDIRECT = True
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_HSTS_SECONDS = 63072000  # 2 years
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# --- Cookies ------------------------------------------------------------------
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14  # 14 days; re-consent flow refreshes

# --- Connections --------------------------------------------------------------
DATABASES["default"]["CONN_MAX_AGE"] = 600  # noqa: F405
