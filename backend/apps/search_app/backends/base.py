"""SearchBackend protocol — the swap contract.

Implementations must be safe to call from Celery workers and must never
raise provider-specific exceptions across this boundary (wrap them).
"""

from __future__ import annotations

from typing import Any, Protocol


class SearchBackend(Protocol):
    def search(self, query: str, *, locale: str = "en", limit: int = 20) -> list[dict[str, Any]]:
        """Return ranked hits: {"id", "title", "score", ...}."""
        ...

    def index(self, listing) -> None:
        """Upsert one listing into the index."""
        ...

    def remove(self, listing_id: str) -> None:
        """Remove one listing from the index."""
        ...
