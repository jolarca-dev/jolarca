"""Project package. Exposes the Celery app so autodiscovery runs at import."""

from .celery import app as celery_app

__all__ = ("celery_app",)
