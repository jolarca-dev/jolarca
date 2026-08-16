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

from apps.core.permissions import Roles, ensure_role_groups  # noqa: E402
from apps.products_app.models import Category, ListingStatus, ProductListing  # noqa: E402
from apps.sellers_app.models import Country, SellerProfile, SellerStatus  # noqa: E402
from apps.tax_app.models import VatRateSnapshot  # noqa: E402
from apps.users_app.models import User  # noqa: E402

CATEGORIES = [
    ("electronics", "Electronics"),
    ("home-garden", "Home & Garden"),
    ("crafts", "Baltic Crafts"),
]

SELLERS = [
    ("demo-lt@example.com", "Vilnius Workshops UAB", Country.LT, "LT100000000000"),
    ("demo-lv@example.com", "Rīga Craft SIA", Country.LV, "LV40000000000"),
    ("demo-ee@example.com", "Tallinn Design OÜ", Country.EE, "EE100000000"),
]

PRODUCTS = [
    ("Amber pendant", Decimal("45.00"), "crafts"),
    ("Linen table runner", Decimal("29.90"), "home-garden"),
    ("Bluetooth speaker (refurb)", Decimal("79.00"), "electronics"),
]

VAT_RATES = {"LT": Decimal("21.00"), "LV": Decimal("21.00"), "EE": Decimal("22.00")}


def seed() -> None:
    ensure_role_groups()

    for slug, name in CATEGORIES:
        Category.objects.update_or_create(slug=slug, defaults={"name": name})

    for email, company, country, vat in SELLERS:
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
                },
            )

    from datetime import date

    for country, rate in VAT_RATES.items():
        VatRateSnapshot.objects.update_or_create(
            country=country, valid_from=date(2025, 1, 1), defaults={"rate": rate}
        )

    print("Seed complete: 3 sellers, 3 categories, 9 listings, VAT snapshots.")


if __name__ == "__main__":
    seed()
