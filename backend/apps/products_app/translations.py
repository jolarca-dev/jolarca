"""modeltranslation registration — catalog content i18n (lt/lv/et/en)."""

from modeltranslation.translator import TranslationOptions, register

from .models import Category, HomeHeroContent, ProductListing


@register(Category)
class CategoryTranslationOptions(TranslationOptions):
    fields = ("name",)


@register(ProductListing)
class ProductListingTranslationOptions(TranslationOptions):
    fields = ("title", "description")


@register(HomeHeroContent)
class HomeHeroContentTranslationOptions(TranslationOptions):
    fields = ("title", "subtitle")
