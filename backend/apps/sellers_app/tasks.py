"""sellers_app async work — queue: default."""

from celery import shared_task
from django.utils import timezone


@shared_task(queue="default", max_retries=5, default_retry_delay=120)
def run_vies_validation(seller_profile_id: str) -> None:
    """Async VIES check; on transient failure retries with backoff."""
    from . import services
    from .models import SellerProfile, SellerStatus

    profile = SellerProfile.objects.filter(pk=seller_profile_id).first()
    if profile is None or profile.status != SellerStatus.VIES_PENDING:
        return

    if not profile.vat_number:
        # KYC-lite: sellers without a VAT number are verified as non-VAT
        # entities; tax_app applies OSS rules at checkout instead.
        services.mark_verified(profile)
        return

    try:
        valid = services.vies_validate(profile.vat_number)
    except NotImplementedError:
        # Sanctioned stub (MVP-S1): keep the profile pending, do not fail.
        return
    except Exception as exc:  # noqa: BLE001 — network layer
        raise run_vies_validation.retry(exc=exc) from exc

    if valid:
        services.mark_verified(profile)
    else:
        services.mark_rejected(profile, "VIES validation failed")


@shared_task(queue="default")
def sweep_stale_submissions() -> None:
    """Beat-driven: flag submissions pending >7 days for manual review."""
    from datetime import timedelta

    from .models import SellerProfile, SellerStatus

    cutoff = timezone.now() - timedelta(days=7)
    stale = SellerProfile.objects.filter(status=SellerStatus.VIES_PENDING, submitted_at__lt=cutoff)
    stale.update(submitted_at=None)  # re-arm; manual review queue picks these up
