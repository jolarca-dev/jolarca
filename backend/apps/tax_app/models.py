"""Tax models — evidence-grade: rates are SNAPSHOTTED, invoices IMMUTABLE."""

from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class VatRateSnapshot(UUIDModel, TimeStampedModel):
    """Point-in-time standard VAT rate per country. Checkout stores the rate
    applied on the order item; audits compare against this history."""

    country = models.CharField(max_length=2, db_index=True)
    rate = models.DecimalField(max_digits=5, decimal_places=2, help_text="Percent, e.g. 21.00")
    valid_from = models.DateField()

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["country", "valid_from"], name="uniq_vat_country_from")
        ]

    def __str__(self) -> str:
        return f"{self.country} {self.rate}% from {self.valid_from}"


class CommercialInvoice(UUIDModel, TimeStampedModel):
    """Immutable invoice document (financial evidence; retained per
    RETENTION_FINANCIAL_YEARS, then ANONYMIZED, never deleted — see
    compliance_app.retention)."""

    order = models.OneToOneField(
        "orders_app.Order", on_delete=models.PROTECT, related_name="invoice"
    )
    number = models.CharField(max_length=32, unique=True)
    seller_vat_number = models.CharField(max_length=16, blank=True, default="")
    buyer_country = models.CharField(max_length=2)
    net_amount = models.DecimalField(max_digits=12, decimal_places=2)
    vat_amount = models.DecimalField(max_digits=12, decimal_places=2)
    gross_amount = models.DecimalField(max_digits=12, decimal_places=2)
    reverse_charge = models.BooleanField(default=False)
    pdf_key = models.CharField(max_length=255, blank=True, default="", help_text="S3 key of PDF")
    issued_at = models.DateTimeField()

    class Meta:
        ordering = ["-created_at"]


class OssReturnData(UUIDModel, TimeStampedModel):
    """Aggregated OSS (One-Stop-Shop) quarterly figures per member state."""

    period = models.CharField(max_length=7, help_text="e.g. 2026Q3")
    country = models.CharField(max_length=2)
    taxable_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    vat_due = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=16, default="draft", help_text="draft|submitted|accepted")

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["period", "country"], name="uniq_oss_period_country")
        ]
