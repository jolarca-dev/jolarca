"""Append-only evidence stores — inserts succeed, updates are rejected.

Regression: UUID defaults are assigned at instantiation, so a `pk is not None`
guard wrongly blocked EVERY insert of AuditLog / ConsentRecord.
"""

import pytest

from apps.compliance_app.models import AuditLog
from apps.users_app.models import ConsentPurpose, ConsentRecord, User

pytestmark = pytest.mark.django_db


def test_audit_log_inserts_and_rejects_update():
    entry = AuditLog.objects.create(action="test_action", target_type="user", target_id="x")
    assert entry.pk is not None

    entry.action = "tampered"
    with pytest.raises(ValueError, match="append-only"):
        entry.save()

    # UPDATE bypassing save() is blocked by ORM-level policy elsewhere;
    # the ORM guard covers the application path.
    assert AuditLog.objects.get(pk=entry.pk).action == "test_action"


def test_audit_log_rejects_delete():
    entry = AuditLog.objects.create(action="test_delete")
    with pytest.raises(ValueError, match="append-only"):
        entry.delete()


def test_consent_record_inserts_and_rejects_update():
    user = User.objects.create_user(email="consent@example.com", password="x")
    record = ConsentRecord.objects.create(
        user=user,
        purpose=ConsentPurpose.MARKETING,
        consent_version="v1",
        granted=True,
    )
    assert record.pk is not None

    record.revoked_at = None
    with pytest.raises(ValueError, match="append-only"):
        record.save()

    # A revocation is a NEW row, not an update (GDPR Art. 7).
    revocation = ConsentRecord.objects.create(
        user=user,
        purpose=ConsentPurpose.MARKETING,
        consent_version="v1",
        granted=False,
    )
    assert revocation.pk != record.pk
