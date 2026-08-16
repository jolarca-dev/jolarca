"""Seller models — verification state machine is the compliance surface.

Every status change must go through services.submit_for_verification /
review transitions so audit events and Stripe Connect state stay coherent.
"""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class SellerStatus(models.TextChoices):
    DRAFT = "draft", "Draft (onboarding incomplete)"
    SUBMITTED = "submitted", "Submitted for verification"
    VIES_PENDING = "vies_pending", "VIES validation pending"
    VERIFIED = "verified", "Verified (may sell)"
    REJECTED = "rejected", "Rejected"
    SUSPENDED = "suspended", "Suspended (compliance/fraud)"


class Country(models.TextChoices):
    LT = "LT", "Lithuania"
    LV = "LV", "Latvia"
    EE = "EE", "Estonia"


class SellerProfile(UUIDModel, TimeStampedModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="seller_profile"
    )
    company_name = models.CharField(max_length=255)
    country = models.CharField(max_length=2, choices=Country.choices)
    vat_number = models.CharField(
        max_length=16, blank=True, default="", help_text="Country-prefixed, e.g. LT100000000000"
    )
    # Only the Stripe account ID is stored here. All Stripe API interaction
    # happens inside payments_app (single-boundary rule).
    stripe_account_id = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(
        max_length=16, choices=SellerStatus.choices, default=SellerStatus.DRAFT
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.TextField(blank=True, default="")
    # Storage KEYS of uploaded KYC documents (files live in private S3);
    # never store document content in the database.
    docs_meta = models.JSONField(default=dict, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["vat_number"], name="uniq_seller_vat", condition=~models.Q(vat_number="")
            )
        ]

    def __str__(self) -> str:
        return f"{self.company_name} [{self.status}]"
