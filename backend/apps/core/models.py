"""Shared abstract base models and the idempotency record.

IdempotencyRecord lives here (not in orders_app) because both checkout
(orders_app) and webhook handlers (payments_app) consume it.
"""

import uuid

from django.db import models


class UUIDModel(models.Model):
    """UUID primary keys: no enumeration of record counts, safe URLs."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    class Meta:
        abstract = True


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    modified_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class IdempotencyRecord(UUIDModel, TimeStampedModel):
    """Stores the outcome of an idempotent operation keyed by client token.

    A repeated key with a DIFFERENT request fingerprint is a protocol
    violation and raises IdempotencyConflict in core.idempotency.
    """

    scope = models.CharField(max_length=64, help_text="e.g. 'orders.checkout', 'payments.webhook'")
    key = models.CharField(max_length=128)
    request_fingerprint = models.CharField(max_length=64)
    response_status = models.PositiveIntegerField(null=True)
    response_body = models.JSONField(null=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["scope", "key"], name="uniq_idempotency_scope_key")
        ]

    def __str__(self) -> str:
        return f"{self.scope}:{self.key}"
