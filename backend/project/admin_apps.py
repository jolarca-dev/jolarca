"""Custom admin app config — modeltranslation ordering fix.

django.contrib.admin autodiscovers <app>.admin modules at the start of
the app-ready phase; modeltranslation's TranslationAdmin then requires
the translated models to be ALREADY registered. modeltranslation has no
autodiscovery, so registration must be triggered before autodiscover —
hence this AdminConfig imports the translations modules first.
"""

from django.contrib.admin.apps import AdminConfig as DjangoAdminConfig


class JOLAdminConfig(DjangoAdminConfig):
    def ready(self) -> None:
        # Register translated models BEFORE admin autodiscovery.
        from apps.products_app import translations  # noqa: F401

        super().ready()
