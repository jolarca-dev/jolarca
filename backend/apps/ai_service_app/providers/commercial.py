"""Commercial LLM fallback (OpenAI-compatible). LAST resort by policy:
only after self-hosted and DeepL fail, and only after PII filtering —
see guardrails.protect() which is enforced by tasks, not by convention."""

from __future__ import annotations

import requests
from django.conf import settings

from .base import ProviderError

_TIMEOUT = (5, 60)


class CommercialProvider:
    name = "openai"

    def __init__(self):
        if not settings.OPENAI_API_KEY:
            raise ProviderError("OPENAI_API_KEY is not configured.")

    def translate(self, text: str, *, source_lang: str, target_lang: str) -> str:
        prompt = (
            f"Translate this {source_lang} e-commerce listing text to {target_lang}. "
            f"Output ONLY the translation.\n\n{text}"
        )
        try:
            resp = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {settings.OPENAI_API_KEY}"},
                json={
                    "model": "gpt-4o-mini",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                },
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
        except (requests.RequestException, KeyError) as exc:
            raise ProviderError("commercial translation failed") from exc

    def embed(self, text: str) -> list[float]:
        raise NotImplementedError("MVP-A2: embeddings not yet wired")
