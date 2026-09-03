"""Shipping models."""

from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class CarrierName(models.TextChoices):
    DPD = "dpd", "DPD"
    OMNIVA = "omniva", "Omniva"


class ShipmentStatus(models.TextChoices):
    CREATED = "created", "Label requested"
    LABEL_READY = "label_ready", "Label generated"
    IN_TRANSIT = "in_transit", "In transit"
    DELIVERED = "delivered", "Delivered"
    FAILED = "failed", "Failed"


class Shipment(UUIDModel, TimeStampedModel):
    order = models.OneToOneField(
        "orders_app.Order", on_delete=models.PROTECT, related_name="shipment"
    )
    carrier = models.CharField(max_length=16, choices=CarrierName.choices)
    external_id = models.CharField(max_length=128, blank=True, default="", db_index=True)
    status = models.CharField(
        max_length=16, choices=ShipmentStatus.choices, default=ShipmentStatus.CREATED
    )
    label_key = models.CharField(
        max_length=255, blank=True, default="", help_text="S3 key of label PDF"
    )
    locker_id = models.CharField(
        max_length=32, blank=True, default="", help_text="Parcel locker code"
    )

    class Meta:
        ordering = ["-created_at"]


class TrackingEvent(UUIDModel, TimeStampedModel):
    """Immutable carrier tracking feed (audit evidence for delivery disputes)."""

    shipment = models.ForeignKey(Shipment, on_delete=models.PROTECT, related_name="events")
    carrier_status = models.CharField(max_length=64)
    occurred_at = models.DateTimeField()
    raw = models.JSONField(default=dict)

    class Meta:
        ordering = ["-created_at"]
