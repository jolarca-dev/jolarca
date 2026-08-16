"""Field encryption — GDPR Art. 32 evidence: round-trip + fail-closed."""

import pytest
from cryptography.fernet import Fernet

from apps.core.encryption import (
    DecryptionError,
    EncryptedTextField,
    EncryptionNotConfigured,
    _get_multi_fernet,
)


@pytest.fixture()
def enc_key(settings):
    key = Fernet.generate_key().decode()
    settings.FIELD_ENCRYPTION_KEY = key
    return key


def test_round_trip(enc_key):
    field = EncryptedTextField(pii_classification="contact")
    ciphertext = field.get_prep_value("+370 600 00000")
    assert ciphertext != "+370 600 00000"
    assert ciphertext.startswith("gAAAAA")  # Fernet token prefix
    assert field.from_db_value(ciphertext, None, None) == "+370 600 00000"


def test_empty_values_pass_through(enc_key):
    field = EncryptedTextField()
    assert field.get_prep_value("") == ""
    assert field.get_prep_value(None) is None
    assert field.from_db_value("", None, None) == ""


def test_fail_closed_without_key(settings):
    settings.FIELD_ENCRYPTION_KEY = ""
    with pytest.raises(EncryptionNotConfigured):
        _get_multi_fernet()


def test_key_rotation_decrypts_old_ciphertext(settings, enc_key):
    field = EncryptedTextField()
    old_cipher = field.get_prep_value("secret-data")

    new_key = Fernet.generate_key().decode()
    settings.FIELD_ENCRYPTION_KEY = f"{new_key},{enc_key}"  # newest first

    assert field.from_db_value(old_cipher, None, None) == "secret-data"
    # new writes use the newest key
    re_cipher = field.get_prep_value("secret-data")
    assert field.from_db_value(re_cipher, None, None) == "secret-data"


def test_undecryptable_raises_clean_error(settings, enc_key):
    field = EncryptedTextField()
    settings.FIELD_ENCRYPTION_KEY = Fernet.generate_key().decode()  # different key
    with pytest.raises(DecryptionError):
        field.from_db_value("gAAAAAB-not-a-real-token", None, None)
