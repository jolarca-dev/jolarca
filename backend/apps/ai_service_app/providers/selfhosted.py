"""Self-hosted OpenAI-compatible endpoint (vLLM/Ollama pods).

Local-first by policy: catalog translation stays inside our infrastructure;
no personal data crosses to commercial providers unless the fallback chain
is explicitly reached AND the PII guardrail has run (see guardrails.py).
"""

from __future__ import annotations

import time

import requests
from django.conf import settings

from .base import ProviderError

_TIMEOUT = (5, 60)  # connect, read — inference can be slow; never unbounded


class SelfHostedProvider:
    name = "selfhosted"

    def __init__(self):
        if not settings.AI_SELFHOSTED_BASE_URL:
            raise ProviderError("AI_SELFHOSTED_BASE_URL is not configured.")

    def translate(self, text: str, *, source_lang: str, target_lang: str) -> str:
        started = time.monotonic()
        prompt = (
            f"Translate the following {source_lang} e-commerce listing text to {target_lang}. "
            f"Preserve formatting, output ONLY the translation.\n\n{text}"
        )
        try:
            resp = requests.post(
                f"{settings.AI_SELFHOSTED_BASE_URL.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {settings.AI_SELFHOSTED_API_KEY}"}
                if settings.AI_SELFHOSTED_API_KEY
                else {},
                json={
                    "model": settings.AI_SELFHOSTED_MODEL,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.2,
                },
                timeout=_TIMEOUT,
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
        except (requests.RequestException, KeyError, ValueError) as exc:
            raise ProviderError(
                f"selfhosted translation failed after {int((time.monotonic() - started) * 1000)}ms"
            ) from exc
        return content

    def embed(self, text: str) -> list[float]:
        raise NotImplementedError("MVP-A2: embedding endpoint not yet wired")
