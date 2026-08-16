"""search_app async work — queue: default (reindex fan-out)."""

from celery import shared_task


@shared_task(queue="default", max_retries=5, default_retry_delay=30)
def reindex_listing(listing_id: str) -> None:
    from apps.products_app.models import ProductListing

    from .services import get_backend

    listing = ProductListing.objects.filter(pk=listing_id).first()
    if listing is None:
        get_backend().remove(listing_id)
        return
    get_backend().index(listing)
