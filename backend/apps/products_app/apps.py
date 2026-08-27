from django.apps import AppConfig


class ProductsAppConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.products_app"

    def ready(self) -> None:
        # Idempotent safety net: project.admin_apps.JOLAdminConfig already
        # imports translations before admin autodiscovery; this covers any
        # entrypoint whose app order differs. modeltranslation has no
        # autodiscovery of its own.
        from . import translations  # noqa: F401
