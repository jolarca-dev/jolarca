"""Phase 2 scaffold — deliberately NOT wired (settings.SEARCH_BACKEND).

Do not import client libraries here until the ADR is ratified; this file
exists so the migration surface is reviewed early.
"""

from __future__ import annotations

from typing import Any


class OpenSearchBackend:  # pragma: no cover — scaffold
    def search(self, query: str, *, locale: str = "en", limit: int = 20) -> list[dict[str, Any]]:
        raise NotImplementedError("Phase 2: OpenSearch backend not yet implemented")

    def index(self, listing) -> None:
        raise NotImplementedError("Phase 2: OpenSearch backend not yet implemented")

    def remove(self, listing_id: str) -> None:
        raise NotImplementedError("Phase 2: OpenSearch backend not yet implemented")
