"""Search service layer — resolves the configured backend."""

from django.conf import settings
from django.utils.module_loading import import_string

_backend_instance = None


def get_backend():
    global _backend_instance
    if _backend_instance is None:
        _backend_instance = import_string(settings.SEARCH_BACKEND)()
    return _backend_instance


def search(query: str, *, locale: str = "en", limit: int = 20):
    return get_backend().search(query, locale=locale, limit=limit)
