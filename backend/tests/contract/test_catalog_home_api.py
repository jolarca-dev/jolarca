"""Contract tests for the public home catalog endpoint — GAP-P01.

Consumer-driven against the frontend zod contract
(frontend/src/server/catalog.ts — HomeContentSchema):

- anonymous access; envelope {hero, categories, featured}
- curation is explicit editorial state (homepage_rank / is_featured);
  drafts/archived/unfeatured content never leaks onto the home rails
- content language follows Accept-Language (modeltranslation)
- money is a 2-dp decimal string; seller ref is a minimal projection

Run inside the CI-parity test stack (`make test-integration`).
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest
from django.test import Client
from django.utils import timezone, translation

from apps.products_app.models import Category, HomeHeroContent, ListingStatus, ProductListing
from apps.sellers_app.models import Country, SellerProfile, SellerStatus
from apps.users_app.models import User

pytestmark = pytest.mark.django_db

HOME = "/api/v1/catalog/home/"


def make_seller(email: str, company: str) -> SellerProfile:
    user = User.objects.create_user(email=email, password="not-a-real-password")
    return SellerProfile.objects.create(
        user=user,
        company_name=company,
        country=Country.LT,
        status=SellerStatus.VERIFIED,
    )


def make_listing(
    seller: SellerProfile,
    category: Category,
    title: str,
    *,
    status: str = ListingStatus.PUBLISHED,
    featured: bool = True,
    published_at=None,
    price: Decimal = Decimal("45.00"),
) -> ProductListing:
    return ProductListing.objects.create(
        seller=seller,
        category=category,
        title=title,
        price=price,
        status=status,
        is_featured=featured,
        published_at=published_at if published_at is not None else timezone.now(),
    )


@pytest.fixture()
def client() -> Client:
    return Client()


class TestEnvelope:
    def test_anonymous_200_with_full_envelope(self, client):
        res = client.get(HOME)
        assert res.status_code == 200
        body = res.json()
        assert set(body) == {"hero", "categories", "featured"}

    def test_hero_is_null_without_active_content(self, client):
        # ADR-0007: no simulated hero — null renders nothing.
        assert client.get(HOME).json()["hero"] is None

    def test_active_hero_serves_localized_content_and_inactive_hides(self, client):
        with translation.override("en"):
            hero = HomeHeroContent.objects.create(
                title="Marketplace for the Baltics",
                subtitle="Buy and sell across Lithuania, Latvia and Estonia.",
            )
        with translation.override("lt"):
            hero.title = "Baltijos turgavietė"
            hero.subtitle = "Pirkite ir parduokite Lietuvoje, Latvijoje ir Estijoje."
            hero.save()

        body = client.get(HOME, HTTP_ACCEPT_LANGUAGE="lt").json()
        assert body["hero"] == {
            "title": "Baltijos turgavietė",
            "subtitle": "Pirkite ir parduokite Lietuvoje, Latvijoje ir Estijoje.",
            "image": None,
        }

        hero.active = False
        hero.save()
        assert client.get(HOME).json()["hero"] is None

    def test_empty_catalog_yields_empty_rails_not_errors(self, client):
        body = client.get(HOME).json()
        assert body["categories"] == []
        assert body["featured"] == []


class TestCuratedCategories:
    def test_only_ranked_categories_render_in_rank_order(self, client):
        Category.objects.create(slug="second", name="Second", homepage_rank=2)
        Category.objects.create(slug="first", name="First", homepage_rank=1)
        Category.objects.create(slug="uncurated", name="Not Curated")  # rank NULL

        names = [c["name"] for c in client.get(HOME).json()["categories"]]
        assert names == ["First", "Second"]

    def test_category_shape_matches_frontend_schema(self, client):
        Category.objects.create(slug="crafts", name="Baltic Crafts", homepage_rank=1)
        (cat,) = client.get(HOME).json()["categories"]
        assert cat == {"slug": "crafts", "name": "Baltic Crafts", "description": "", "image": None}


class TestFeaturedRail:
    def test_only_published_and_featured_listings_appear(self, client):
        seller = make_seller("s@example.com", "Vilnius Workshops UAB")
        category = Category.objects.create(slug="crafts", name="Crafts")

        visible = make_listing(seller, category, "Amber pendant")
        make_listing(seller, category, "Draft", status=ListingStatus.DRAFT)
        make_listing(seller, category, "Archived", status=ListingStatus.ARCHIVED)
        make_listing(seller, category, "Not featured", featured=False)

        titles = [p["title"] for p in client.get(HOME).json()["featured"]]
        assert titles == ["Amber pendant"]
        assert visible.status == ListingStatus.PUBLISHED  # guard: fixture intent

    def test_card_shape_money_and_seller_ref(self, client):
        seller = make_seller("s@example.com", "Vilnius Workshops UAB")
        category = Category.objects.create(slug="crafts", name="Crafts")
        listing = make_listing(seller, category, "Amber pendant", price=Decimal("45.00"))

        (card,) = client.get(HOME).json()["featured"]
        assert card["id"] == str(listing.pk)
        assert card["slug"] == str(listing.pk)  # UUID is the public identifier
        assert card["price_gross"] == "45.00"  # 2-dp decimal string, not float
        assert card["currency"] == "EUR"
        assert card["seller"] == {
            "slug": "vilnius-workshops-uab",
            "name": "Vilnius Workshops UAB",
            "verified": True,
            "logo_url": None,
        }
        assert card["rating"] is None
        assert card["vat_note"] is None
        assert card["images"] == []

    def test_newest_published_first_capped_at_eight(self, client):
        seller = make_seller("s@example.com", "Vilnius Workshops UAB")
        category = Category.objects.create(slug="crafts", name="Crafts")
        base = timezone.now() - timedelta(days=10)
        for i in range(9):
            make_listing(seller, category, f"Item {i}", published_at=base + timedelta(days=i))

        featured = client.get(HOME).json()["featured"]
        assert len(featured) == 8
        assert featured[0]["title"] == "Item 8"  # newest first


class TestContentLocale:
    def test_accept_language_selects_translated_content(self, client):
        seller = make_seller("s@example.com", "Vilnius Workshops UAB")
        # Create under each language so modeltranslation writes the real
        # *_lt / *_en columns (assigning title_lt on a default-language
        # instance leaves the deferred descriptor empty).
        with translation.override("en"):
            category = Category.objects.create(slug="crafts", name="Crafts", homepage_rank=1)
            listing = make_listing(seller, category, "Amber pendant")
        with translation.override("lt"):
            category.name = "Amatai"
            category.save()
            listing.title = "Gintaro pakabukas"
            listing.save()

        body = client.get(HOME, HTTP_ACCEPT_LANGUAGE="lt").json()
        assert body["categories"][0]["name"] == "Amatai"
        assert body["featured"][0]["title"] == "Gintaro pakabukas"

    def test_defaults_to_english_without_header(self, client):
        seller = make_seller("s@example.com", "Vilnius Workshops UAB")
        category = Category.objects.create(slug="crafts", name="Crafts", homepage_rank=1)
        listing = make_listing(seller, category, "Amber pendant")
        with translation.override("lt"):
            listing.title = "Gintaro pakabukas"
            listing.save()

        body = client.get(HOME).json()
        assert body["categories"][0]["name"] == "Crafts"
        assert body["featured"][0]["title"] == "Amber pendant"
