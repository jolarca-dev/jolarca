"""Catalog service layer."""

from __future__ import annotations

import structlog
from django.utils import timezone

from .models import ListingStatus, ProductListing

audit = structlog.get_logger("jol.audit")


class PublicationError(Exception):
    pass


def publish_listing(listing: ProductListing) -> ProductListing:
    """DRAFT → PUBLISHED. Enqueues translation + search indexing.

    Publishing is the moment catalog content becomes public personal data
    processing — the audit event is part of the RoPA evidence chain.
    """
    if listing.status == ListingStatus.PUBLISHED:
        return listing
    if not listing.title or listing.price is None:
        raise PublicationError("Listing requires title and price before publishing.")

    listing.status = ListingStatus.PUBLISHED
    listing.published_at = timezone.now()
    listing.save(update_fields=["status", "published_at", "modified_at"])

    from .tasks import index_listing, translate_listing

    translate_listing.delay(str(listing.pk))
    index_listing.delay(str(listing.pk))
    audit.info("listing_published", listing_id=str(listing.pk), seller_id=str(listing.seller_id))
    return listing


def archive_listing(listing: ProductListing) -> ProductListing:
    listing.status = ListingStatus.ARCHIVED
    listing.save(update_fields=["status", "modified_at"])
    from .tasks import remove_from_index

    remove_from_index.delay(str(listing.pk))
    return listing
