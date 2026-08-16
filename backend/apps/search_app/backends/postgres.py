"""Phase 1 backend: PostgreSQL full-text search (+ pgvector for phase 2).

Keeps the entire search stack inside the transactional database until
traffic justifies OpenSearch. Upgrade path is a settings change, not a
rewrite (see backends/opensearch.py scaffold).
"""

from __future__ import annotations

from typing import Any


class PostgresSearchBackend:
    def search(self, query: str, *, locale: str = "en", limit: int = 20) -> list[dict[str, Any]]:
        from apps.products_app.models import ListingStatus, ProductListing

        # Sanctioned simplification (MVP-Q1): icontains over the requested
        # locale column; replace with SearchVector + GIN index + trigram
        # ranking before launch. pgvector semantic recall is phase 2.
        title_field = f"title_{locale}" if locale != "en" else "title"
        qs = (
            ProductListing.objects.filter(status=ListingStatus.PUBLISHED)
            .filter(**{f"{title_field}__icontains": query})
            .order_by("-published_at")[:limit]
        )
        return [
            {
                "id": str(listing.pk),
                "title": getattr(listing, title_field) or listing.title,
                "score": 1.0,
            }
            for listing in qs
        ]

    def index(self, listing) -> None:
        # Postgres IS the index; nothing to upsert. Hook kept for interface parity.
        return None

    def remove(self, listing_id: str) -> None:
        return None
