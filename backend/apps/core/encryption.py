"""Field-level encryption for PII at rest (GDPR Art. 32 — state of the art).

Design:
- Symmetric authenticated encryption (Fernet: AES-128-CBC + HMAC-SHA256).
- FAIL-CLOSED: any encryption attempt without FIELD_ENCRYPTION_KEY raises.
- Key rotation: settings holds a comma-separated key list, newest first;
  MultiFernet decrypts with any known key, encrypts with the newest.
- Every field carries `pii_classification` for RoPA tooling and erasure
  discovery (see docs/COMPLIANCE_MATRIX.md).

Trade-off (documented, ADR-0004): ciphertext columns are not queryable.
The migration path to searchable encrypted columns is pgcrypto PGP functions
(extension already provisioned in backend/db/init-extensions.sql).
"""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured
from django.db import models


class EncryptionNotConfigured(ImproperlyConfigured):
    """Raised when PII encryption is attempted without a configured key."""


class DecryptionError(ValueError):
    """Raised when ciphertext cannot be decrypted (key rotated away/corruption)."""


def _get_multi_fernet() -> MultiFernet:
    raw = getattr(settings, "FIELD_ENCRYPTION_KEY", "") or ""
    keys = [part.strip() for part in raw.split(",") if part.strip()]
    if not keys:
        raise EncryptionNotConfigured(
            "FIELD_ENCRYPTION_KEY is not configured. Refusing to write PII in plaintext."
        )
    return MultiFernet([Fernet(key.encode()) for key in keys])


class EncryptedTextField(models.TextField):
    """Transparent encrypt-on-write / decrypt-on-read text field."""

    description = "Fernet-encrypted text (PII at rest)"

    def __init__(self, *args, pii_classification: str = "unspecified", **kwargs):
        # RoPA classification: direct_identifier | indirect_identifier |
        # contact | sensitive_art9 | financial | unspecified
        self.pii_classification = pii_classification
        super().__init__(*args, **kwargs)

    def deconstruct(self):
        name, path, args, kwargs = super().deconstruct()
        if self.pii_classification != "unspecified":
            kwargs["pii_classification"] = self.pii_classification
        return name, path, args, kwargs

    def get_prep_value(self, value):
        if value is None or value == "":
            return value
        return _get_multi_fernet().encrypt(str(value).encode()).decode()

    def from_db_value(self, value, expression, connection):
        if value is None or value == "":
            return value
        try:
            return _get_multi_fernet().decrypt(value.encode()).decode()
        except InvalidToken as exc:
            raise DecryptionError(
                "Cannot decrypt column value — encryption key missing or rotated away."
            ) from exc
