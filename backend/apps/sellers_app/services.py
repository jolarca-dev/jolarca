"""Seller onboarding/verification service layer."""

from __future__ import annotations

import re

import structlog
from django.utils import timezone

from apps.core.permissions import Roles

from .models import SellerProfile, SellerStatus

audit = structlog.get_logger("jol.audit")

# EU VAT number: country prefix + 2..12 alphanumerics (country-specific shapes
# validated further in vies_validate).
_VAT_RE = re.compile(r"^(LT|LV|EE)\d{9,11}$|^(LT|LV|EE)[A-Z0-9]{2,12}$")


class VerificationError(Exception):
    pass


def submit_for_verification(profile: SellerProfile) -> SellerProfile:
    """DRAFT → SUBMITTED → VIES_PENDING. Guards: complete data, valid shape."""
    if profile.status not in (SellerStatus.DRAFT, SellerStatus.REJECTED):
        raise VerificationError(f"Cannot submit from status {profile.status}.")
    if not profile.company_name or not profile.country:
        raise VerificationError("Company name and country are required.")
    if profile.vat_number and not _VAT_RE.match(profile.vat_number.replace(" ", "")):
        raise VerificationError("VAT number format is invalid for LT/LV/EE.")

    profile.status = SellerStatus.VIES_PENDING
    profile.submitted_at = timezone.now()
    profile.save(update_fields=["status", "submitted_at", "modified_at"])

    from .tasks import run_vies_validation

    run_vies_validation.delay(str(profile.pk))
    audit.info("seller_submitted_for_verification", seller_id=str(profile.pk))
    return profile


def vies_validate(vat_number: str) -> bool:
    """Sanctioned stub — tracked in docs/MVP_REMAINING_WORK.md (MVP-S1).

    Must call the EU VIES REST API with timeout + circuit breaker (see
    shipping_app.services.CircuitBreaker for the reference implementation)
    and persist the evidence (response, timestamp) for tax audits.
    """
    raise NotImplementedError("MVP-S1: VIES integration not yet wired")


def mark_verified(profile: SellerProfile) -> SellerProfile:
    from django.contrib.auth.models import Group

    profile.status = SellerStatus.VERIFIED
    profile.verified_at = timezone.now()
    profile.save(update_fields=["status", "verified_at", "modified_at"])
    seller_group, _ = Group.objects.get_or_create(name=Roles.SELLER)
    profile.user.groups.add(seller_group)
    audit.info("seller_verified", seller_id=str(profile.pk))
    return profile


def mark_rejected(profile: SellerProfile, reason: str) -> SellerProfile:
    profile.status = SellerStatus.REJECTED
    profile.rejection_reason = reason
    profile.save(update_fields=["status", "rejection_reason", "modified_at"])
    audit.warning("seller_rejected", seller_id=str(profile.pk))
    return profile
