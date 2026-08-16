"""Typed access to environment variables.

Policy (ISO 27001 A.8.10 / SOC 2 CC6.1): configuration comes from the
environment; production.py adds strict validation so that no secret-bearing
setting can ever silently fall back to a default.
"""

from __future__ import annotations

import os
from urllib.parse import unquote, urlparse

from django.core.exceptions import ImproperlyConfigured

_TRUTHY = {"1", "true", "yes", "on"}
_FALSY = {"0", "false", "no", "off", ""}


def env_str(name: str, default: str | None = None) -> str | None:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    return value


def env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    value = value.strip().lower()
    if value in _TRUTHY:
        return True
    if value in _FALSY:
        return False
    raise ImproperlyConfigured(f"Env var {name} is not a boolean: {value!r}")


def env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ImproperlyConfigured(f"Env var {name} is not an integer: {value!r}") from exc


def env_list(name: str, default: tuple[str, ...] = (), sep: str = ",") -> list[str]:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return list(default)
    return [item.strip() for item in value.split(sep) if item.strip()]


def parse_database_url(url: str) -> dict:
    """Parse a DATABASE_URL into Django DATABASES['default'] fragments."""
    parsed = urlparse(url)
    if parsed.scheme not in {"postgres", "postgresql"}:
        raise ImproperlyConfigured(f"Unsupported DATABASE_URL scheme: {parsed.scheme!r}")
    return {
        "NAME": (parsed.path or "/").lstrip("/"),
        "USER": unquote(parsed.username or ""),
        "PASSWORD": unquote(parsed.password or ""),
        "HOST": parsed.hostname or "",
        "PORT": str(parsed.port or 5432),
    }
