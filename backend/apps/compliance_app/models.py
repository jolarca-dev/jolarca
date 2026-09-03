"""Compliance models — append-only evidence stores."""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class AuditLog(UUIDModel):
    """Append-only audit trail (ISO 27001 A.8.15, SOC 2 CC7.2).

    Integrity control: updates and deletes are blocked at the ORM level;
    production additionally restricts DB-level privileges and ships logs to
    an immutable external sink.
    """

    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    actor_id = models.UUIDField(null=True, blank=True, help_text="Null = system actor")
    action = models.CharField(max_length=64)
    target_type = models.CharField(max_length=64, blank=True, default="")
    target_id = models.CharField(max_length=64, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    request_id = models.CharField(max_length=64, blank=True, default="")
    data = models.JSONField(default=dict)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["action", "created_at"])]

    def save(self, *args, **kwargs):
        # UUID defaults are assigned at instantiation, so pk is ALWAYS set —
        # _state.adding is the correct insert-vs-update discriminator.
        if not self._state.adding:
            raise ValueError("AuditLog is append-only; updates are forbidden.")
        super().save(*args, **kwargs)

    def delete(self, using=None, keep_parents=False):
        raise ValueError("AuditLog is append-only; deletes are forbidden.")


class ErasureStatus(models.TextChoices):
    REQUESTED = "requested", "Requested"
    IN_PROGRESS = "in_progress", "Fan-out in progress"
    COMPLETED = "completed", "Completed"
    PARTIALLY_BLOCKED = "partially_blocked", "Blocked by retention obligations"


class ErasureRequest(UUIDModel, TimeStampedModel):
    """GDPR Art. 17 request with SLA tracking (GDPR_ERASURE_SLA_DAYS)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="erasure_requests"
    )
    status = models.CharField(
        max_length=24, choices=ErasureStatus.choices, default=ErasureStatus.REQUESTED
    )
    requested_at = models.DateTimeField(auto_now_add=True)
    due_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    receipt = models.JSONField(
        default=dict, help_text="Per-handler outcomes — the erasure evidence"
    )

    class Meta:
        ordering = ["-created_at"]


class DataExport(UUIDModel, TimeStampedModel):
    """GDPR Art. 20 portability export job."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="data_exports"
    )
    status = models.CharField(max_length=16, default="pending", help_text="pending|ready|expired")
    file_key = models.CharField(
        max_length=255, blank=True, default="", help_text="S3 key; signed URL on demand"
    )
    expires_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
