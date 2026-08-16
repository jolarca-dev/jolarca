"""DeepL provider — commercial translation with a DPA in place (subprocessor
list, docs/COMPLIANCE_MATRIX.md). Used after self-hosted, before generic LLMs."""

from __future__ import annotations

import requests
from django.conf import settings

from .base import ProviderError

_TIMEOUT = (5, 30)


class DeepLProvider:
    name = "deepl"

    def __init__(self):
        if not settings.DEEPL_API_KEY:
            raise ProviderError("DEEPL_API_KEY is not configured.")

    def translate(self, text: str, *, source_lang: str, target_lang: str) -> str:
        try:
            resp = requests.post(
                "https://api-free.deepl.com/v2/translate",
                headers={"Authorization": f"DeepL-Auth-Key {settings.DEEPL_API_KEY}"},
                data={
                    "text": text,
                    "source_lang": source_lang.upper(),
                    "target_lang": target_lang.upper(),
                },
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            return resp.json()["translations"][0]["text"]
        except (requests.RequestException, KeyError, IndexError) as exc:
            raise ProviderError("DeepL translation failed") from exc

    def embed(self, text: str) -> list[float]:
        raise ProviderError("DeepL does not provide embeddings")
