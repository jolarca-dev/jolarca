#!/usr/bin/env python
"""Seed demo data: LT/LV/EE sellers, categories, published listings.

Idempotent — safe to run repeatedly (Makefile `seed`). Uses natural keys so
re-runs update rather than duplicate. Run from backend/ with Django settings.
"""

import os
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "project.settings.dev")

import django  # noqa: E402

django.setup()

from django.contrib.auth.models import Group  # noqa: E402
from django.utils import timezone  # noqa: E402

from apps.core.permissions import Roles, ensure_role_groups  # noqa: E402
from apps.products_app.models import (  # noqa: E402
    Category,
    HomeHeroContent,
    ListingStatus,
    ProductListing,
)
from apps.sellers_app.models import Country, SellerProfile, SellerStatus  # noqa: E402
from apps.tax_app.models import VatRateSnapshot  # noqa: E402
from apps.users_app.models import User  # noqa: E402

CATEGORIES = [
    # (slug, name, homepage_rank) — rank curates the storefront home rail
    # (GAP-P01); NULL rank would keep the category off the home page.
    ("electronics", "Electronics", 1),
    ("home-garden", "Home & Garden", 2),
    ("crafts", "Baltic Crafts", 3),
]

SELLERS = [
    # (email, company, country, vat, city, public storefront description)
    (
        "demo-lt@example.com",
        "Vilnius Workshops UAB",
        Country.LT,
        "LT100000000000",
        "Vilnius",
        "Family workshop crafting amber jewellery and linen homeware since 2012. Every piece is made in our Vilnius studio.",
    ),
    (
        "demo-lv@example.com",
        "Rīga Craft SIA",
        Country.LV,
        "LV40000000000",
        "Rīga",
        "Hand-finished Baltic crafts from old-town Rīga. Small batches, natural materials.",
    ),
    (
        "demo-ee@example.com",
        "Tallinn Design OÜ",
        Country.EE,
        "EE100000000000",
        "Tallinn",
        "Nordic-minimal design objects and refurbished electronics with a one-year warranty.",
    ),
]

PRODUCTS = [
    ("Amber pendant", Decimal("45.00"), "crafts"),
    ("Linen table runner", Decimal("29.90"), "home-garden"),
    ("Bluetooth speaker (refurb)", Decimal("79.00"), "electronics"),
]

VAT_RATES = {"LT": Decimal("21.00"), "LV": Decimal("21.00"), "EE": Decimal("22.00")}

# Home hero editorial copy (micro-CMS seed; editable in Django admin).
HERO_CONTENT = {
    "en": (
        # Brand statement, deliberately distinct from the page H1
        # ("Marketplace for the Baltics") so the hero never duplicates it.
        "Serving those who serve",
        "Trusted sacred goods and services across Europe.",
    ),
    "lt": (
        # Launch tagline (faith vertical): "Serving those who serve —
        # trusted sacred goods and services for Europe." Lithuanian
        # adjective agreement corrected vs. the original draft
        # (patikimos sakralinės ← prekės ir paslaugos, fem. pl.).
        "Tarnaujanti tarnautojams",
        "Patikimos sakralinės prekės ir paslaugos Europai.",
    ),
    "lv": (
        "Kalpojam tiem, kas kalpo",
        "Uzticamas sakrālās preces un pakalpojumi Eiropai.",
    ),
    "et": (
        "Teenime neid, kes teenivad",
        "Usaldusväärsed sakraalsed kaubad ja teenused Euroopas.",
    ),
}


def seed() -> None:
    ensure_role_groups()

    for slug, name, rank in CATEGORIES:
        Category.objects.update_or_create(
            slug=slug, defaults={"name": name, "homepage_rank": rank}
        )

    for email, company, country, vat, city, description in SELLERS:
        user, _ = User.objects.get_or_create(email=email)
        if not user.has_usable_password():
            user.set_password("insecure-demo-password-only")
            user.save()
        seller, _ = SellerProfile.objects.update_or_create(
            user=user,
            defaults={
                "company_name": company,
                "country": country,
                "vat_number": vat,
                "status": SellerStatus.VERIFIED,
                "city": city,
                "public_description": description,
            },
        )
        seller_group = Group.objects.get(name=Roles.SELLER)
        user.groups.add(seller_group)

        for title, price, cat_slug in PRODUCTS:
            category = Category.objects.get(slug=cat_slug)
            ProductListing.objects.update_or_create(
                seller=seller,
                title=f"{title} — {country}",
                defaults={
                    "category": category,
                    "price": price,
                    "status": ListingStatus.PUBLISHED,
                    # Demo rail: every seeded listing is featured so the
                    # storefront home renders real content (GAP-P01).
                    "is_featured": True,
                    "published_at": timezone.now(),
                },
            )

    from datetime import date

    # Bulk electronics (26 published total) so the category grid exercises
    # real server-side pagination in dev/e2e (24 per page → 2 pages).
    electronics = Category.objects.get(slug="electronics")
    bulk_seller = SellerProfile.objects.get(user__email="demo-lt@example.com")
    for i in range(1, 24):
        ProductListing.objects.update_or_create(
            seller=bulk_seller,
            title=f"Refurb radio #{i}",
            defaults={
                "category": electronics,
                "price": Decimal("10.00") + i,
                "status": ListingStatus.PUBLISHED,
                "is_featured": False,
                "published_at": timezone.now(),
            },
        )

    for country, rate in VAT_RATES.items():
        VatRateSnapshot.objects.update_or_create(
            country=country, valid_from=date(2025, 1, 1), defaults={"rate": rate}
        )

    # Micro-CMS seed: one active hero with all four locales; editable in
    # the Django admin afterwards (products_app.HomeHeroContent).
    hero, _ = HomeHeroContent.objects.get_or_create(
        title_en=HERO_CONTENT["en"][0],
        defaults={"subtitle_en": HERO_CONTENT["en"][1]},
    )
    for lang, (title, subtitle) in HERO_CONTENT.items():
        setattr(hero, f"title_{lang}", title)
        setattr(hero, f"subtitle_{lang}", subtitle)
    hero.active = True
    hero.save()

    print("Seed complete: 3 sellers, 3 categories, 32 listings, VAT snapshots, hero.")


if __name__ == "__main__":
    seed()
