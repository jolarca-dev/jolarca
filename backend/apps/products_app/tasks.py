"""products_app async work — media queue for images, default for indexing,
ai queue (via ai_service_app) for translation."""

from celery import shared_task


@shared_task(queue="media", max_retries=3)
def resize_listing_images(listing_id: str) -> None:
    """Sanctioned stub (MVP-P1): download originals from S3, generate
    webp renditions, store under derived keys, update listing.image_keys."""
    raise NotImplementedError("MVP-P1: image pipeline not yet implemented")


@shared_task(queue="default", max_retries=5, default_retry_delay=30)
def index_listing(listing_id: str) -> None:
    from apps.search_app.services import get_backend

    from .models import ProductListing

    listing = ProductListing.objects.filter(pk=listing_id).first()
    if listing is None:
        return
    get_backend().index(listing)


@shared_task(queue="default")
def remove_from_index(listing_id: str) -> None:
    from apps.search_app.services import get_backend

    get_backend().remove(listing_id)


@shared_task(queue="default")
def translate_listing(listing_id: str) -> None:
    """Fan out to the AI queue — translation must never block publishing."""
    from apps.ai_service_app.tasks import translate_listing_content

    translate_listing_content.delay(listing_id)
