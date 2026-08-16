"""ASGI entry point (kept for future websocket/SSE needs; gunicorn runs WSGI)."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "project.settings.production")

application = get_asgi_application()
