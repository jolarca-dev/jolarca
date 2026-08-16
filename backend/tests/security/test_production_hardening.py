"""Production boot validation — fail-closed policy, tested without booting."""

import pytest
from django.core.exceptions import ImproperlyConfigured

from project.settings.validation import validate_production

VALID = {
    "secret_key": "x" * 60,
    "allowed_hosts": ["marketplace.example"],
    "field_encryption_key": "a-key",
}


def test_accepts_valid_posture():
    validate_production(**VALID)  # must not raise


@pytest.mark.parametrize(
    ("override", "message_part"),
    [
        ({"secret_key": ""}, "DJANGO_SECRET_KEY"),
        ({"secret_key": "x" * 10}, "DJANGO_SECRET_KEY"),
        ({"allowed_hosts": []}, "ALLOWED_HOSTS"),
        ({"field_encryption_key": ""}, "FIELD_ENCRYPTION_KEY"),
        ({"allowed_hosts": ["localhost"]}, "Loopback"),
        ({"allowed_hosts": ["127.0.0.1"]}, "Loopback"),
    ],
)
def test_refuses_insecure_posture(override, message_part):
    with pytest.raises(ImproperlyConfigured, match=message_part):
        validate_production(**{**VALID, **override})
