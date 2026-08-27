"""Catalog models.

- modeltranslation adds *_lt/_lv/_et/_en columns for Category.name and
  ProductListing.title/description (content i18n lives in the DB; UI i18n
  lives in frontend/messages — ADR-0003).
- PostGIS PointField supports "near me" and locker-distance features.
"""

from django.contrib.gis.db import models as gis_models
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class Category(UUIDModel, TimeStampedModel):
    name = models.CharField(max_length=128)  # translated via translations.py
    slug = models.SlugField(max_length=128, unique=True)
    parent = models.ForeignKey(
        "self", null=True, blank=True, on_delete=models.PROTECT, related_name="children"
    )
    # Editorial curation for the storefront home (GAP-P01): NULL = not on
    # the home rail; lower rank renders first. Admin-managed, not seller-facing.
    homepage_rank = models.PositiveSmallIntegerField(null=True, blank=True)

    class Meta:
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.name


class ListingStatus(models.TextChoices):
    DRAFT = "draft", "Draft"
    PUBLISHED = "published", "Published"
    ARCHIVED = "archived", "Archived"


class ProductListing(UUIDModel, TimeStampedModel):
    seller = models.ForeignKey(
        "sellers_app.SellerProfile", on_delete=models.PROTECT, related_name="listings"
    )
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name="listings")
    title = models.CharField(max_length=255)  # translated
    description = models.TextField(blank=True)  # translated
    price = models.DecimalField(
        max_digits=12, decimal_places=2, help_text="EUR, VAT treatment by tax_app"
    )
    currency = models.CharField(max_length=3, default="EUR")
    status = models.CharField(
        max_length=16, choices=ListingStatus.choices, default=ListingStatus.DRAFT
    )
    location = gis_models.PointField(
        geography=True, null=True, blank=True, help_text="Item location (seller address or pickup)"
    )
    image_keys = models.JSONField(default=list, blank=True, help_text="S3 keys of processed images")
    published_at = models.DateTimeField(null=True, blank=True)
    # Editorial curation for the storefront home (GAP-P01). False keeps the
    # listing published and searchable but off the home rail.
    is_featured = models.BooleanField(default=False, db_index=True)

    class Meta:
        indexes = [models.Index(fields=["status", "published_at"])]

    def __str__(self) -> str:
        return self.title


class HomeHeroContent(UUIDModel, TimeStampedModel):
    """Editorial home hero — the micro-CMS surface (Django admin only).

    No public write API exists: content is managed by operations staff in
    the admin (ADR-0006). The most recently modified ACTIVE row is served;
    with none active the API returns hero=null and the frontend renders
    nothing (ADR-0007). Title/subtitle are translated (translations.py).
    """

    title = models.CharField(max_length=160)
    subtitle = models.CharField(max_length=400, blank=True, default="")
    active = models.BooleanField(default=True)

    class Meta:
        verbose_name_plural = "home hero content"

    def __str__(self) -> str:
        return self.title
