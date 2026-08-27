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

# Cookie hardening (ISO 27001 A.8 / SOC 2 CC6):
#  - __Host- prefix: browsers enforce Secure + Path=/ + no Domain, making
#    prefix-squatting from subdomains impossible. Browsers REJECT __Host-
#    cookies on non-secure origins, hence production-only naming.
#  - SameSite=Strict: no cross-site cookie transmission. Checkout stays
#    unaffected because the Payment Element is embedded (no cross-site
#    return navigation); KNOWN TRADE-OFF: the Stripe Connect Express
#    return hop lands without the session cookie on the first request
#    (the dashboard re-fetches identity client-side — see runbook note).
SESSION_COOKIE_NAME = "__Host-jol_session"
CSRF_COOKIE_NAME = "__Host-jol_csrf"
SESSION_COOKIE_SAMESITE = "Strict"
CSRF_COOKIE_SAMESITE = "Strict"

# --- Cookies ------------------------------------------------------------------
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14  # 14 days; re-consent flow refreshes
# Max-Age aligned with the session TTL.
CSRF_COOKIE_AGE = SESSION_COOKIE_AGE

# --- Connections --------------------------------------------------------------
DATABASES["default"]["CONN_MAX_AGE"] = 600  # noqa: F405
