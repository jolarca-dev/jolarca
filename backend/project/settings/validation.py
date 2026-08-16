"""Fail-closed boot validation for production settings.

Lives in its own side-effect-free module so it is unit-testable without
importing production.py (which refuses to import when secrets are absent —
by design).
"""

from django.core.exceptions import ImproperlyConfigured


def validate_production(*, secret_key: str, allowed_hosts, field_encryption_key: str) -> None:
    """Raise ImproperlyConfigured for any insecure production posture.

    The service must refuse to boot rather than run degraded (ISO 27001
    A.8.10 configuration management).
    """
    if not secret_key or len(secret_key) < 50:
        raise ImproperlyConfigured("DJANGO_SECRET_KEY missing or <50 chars; refusing to boot.")
    if not allowed_hosts:
        raise ImproperlyConfigured("DJANGO_ALLOWED_HOSTS must be set explicitly in production.")
    if not field_encryption_key:
        raise ImproperlyConfigured("FIELD_ENCRYPTION_KEY missing; PII-at-rest protection disabled.")
    if "localhost" in allowed_hosts or "127.0.0.1" in allowed_hosts:
        raise ImproperlyConfigured("Loopback hosts are not valid production ALLOWED_HOSTS.")
