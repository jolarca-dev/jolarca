"""Order models.

OrderItem SNAPSHOTS listing title/price at purchase time: catalog changes
must never rewrite purchase history (consumer law + tax evidence).
"""

from django.conf import settings
from django.db import models

from apps.core.encryption import EncryptedTextField
from apps.core.models import TimeStampedModel, UUIDModel


class CartStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    CHECKED_OUT = "checked_out", "Checked out"
    ABANDONED = "abandoned", "Abandoned"


class Cart(UUIDModel, TimeStampedModel):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="carts"
    )
    status = models.CharField(max_length=16, choices=CartStatus.choices, default=CartStatus.ACTIVE)

    def __str__(self) -> str:
        return f"Cart {self.pk} [{self.status}]"


class CartItem(UUIDModel, TimeStampedModel):
    cart = models.ForeignKey(Cart, on_delete=models.CASCADE, related_name="items")
    listing = models.ForeignKey(
        "products_app.ProductListing", on_delete=models.PROTECT, related_name="+"
    )
    quantity = models.PositiveIntegerField(default=1)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["cart", "listing"], name="uniq_cart_item_listing")
        ]


class Order(UUIDModel, TimeStampedModel):
    number = models.CharField(
        max_length=32, unique=True, help_text="Human-readable, e.g. JOL-2026-000001"
    )
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="orders",
        null=True,
        blank=True,
        help_text="NULL once retention anonymization has run (compliance_app.retention)",
    )
    status = models.CharField(max_length=16, default="pending", db_index=True)
    currency = models.CharField(max_length=3, default="EUR")
    total_net = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_vat = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_gross = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shipping_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    shipping_country = models.CharField(max_length=2, blank=True, default="")
    shipping_method = models.CharField(max_length=16, blank=True, default="")
    shipping_locker_id = models.CharField(max_length=32, blank=True, default="")
    # Fulfillment address — PII encrypted at rest (RoPA-classified). Kept on
    # the order because fulfillment + consumer-law evidence must survive the
    # financial retention window even after account erasure.
    ship_full_name = EncryptedTextField(
        blank=True, default="", pii_classification="direct_identifier"
    )
    ship_street = EncryptedTextField(blank=True, default="", pii_classification="direct_identifier")
    ship_city = EncryptedTextField(blank=True, default="", pii_classification="indirect_identifier")
    ship_postal_code = EncryptedTextField(
        blank=True, default="", pii_classification="indirect_identifier"
    )
    ship_phone = EncryptedTextField(blank=True, default="", pii_classification="contact")
    # B2B VAT ID as provided at checkout (invoicing evidence; VIES result is
    # recorded by tax_app at validation time, not re-derived here).
    buyer_vat_id = models.CharField(max_length=32, blank=True, default="")
    anonymized_ref = models.CharField(
        max_length=32,
        blank=True,
        default="",
        db_index=True,
        help_text="Irreversible pseudonymous token; set when buyer is anonymized",
    )
    # null=True is the sanctioned Django idiom for UNIQUE CharFields: it
    # lets many orders carry no idempotency key, which an empty-string
    # default would forbid.
    idempotency_key = models.CharField(  # noqa: DJ001
        max_length=128, unique=True, null=True, help_text="Checkout dedupe token"
    )

    class Meta:
        indexes = [models.Index(fields=["buyer", "status"])]

    def __str__(self) -> str:
        return f"Order {self.number} [{self.status}]"


class OrderItem(UUIDModel):
    order = models.ForeignKey(Order, on_delete=models.PROTECT, related_name="items")
    listing = models.ForeignKey(
        "products_app.ProductListing", on_delete=models.PROTECT, related_name="+"
    )
    # Snapshot fields (see module docstring).
    title_snapshot = models.CharField(max_length=255)
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    quantity = models.PositiveIntegerField()
    vat_rate = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    seller_id = models.UUIDField(help_text="Denormalized for split payouts & erasure scoping")
