"""Catalog admin — the micro-CMS surface (ops-only, ADR-0006).

Editorial curation (home category rail, featured listings, hero banner)
is managed here and ONLY here: no public write API exists for content.
TranslationAdmin exposes one editable field per language (ADR-0003).
"""

from django.contrib import admin
from modeltranslation.admin import TranslationAdmin

from .models import Category, HomeHeroContent, ProductListing


@admin.register(Category)
class CategoryAdmin(TranslationAdmin):
    list_display = ("name", "slug", "homepage_rank")
    list_editable = ("homepage_rank",)
    search_fields = ("slug",)
    prepopulated_fields = {"slug": ("name",)}


@admin.register(ProductListing)
class ProductListingAdmin(TranslationAdmin):
    list_display = ("title", "category", "status", "is_featured", "published_at")
    list_filter = ("status", "is_featured", "category")
    list_editable = ("is_featured",)
    search_fields = ("title",)
    readonly_fields = ("seller", "price", "created_at", "modified_at")


@admin.register(HomeHeroContent)
class HomeHeroContentAdmin(TranslationAdmin):
    list_display = ("title", "active", "modified_at")
    list_editable = ("active",)
