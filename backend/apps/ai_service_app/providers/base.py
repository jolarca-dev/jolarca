"""LLMProvider protocol — routing contract for local-first AI."""

from __future__ import annotations

from typing import Protocol


class ProviderError(Exception):
    pass


class LLMProvider(Protocol):
    name: str

    def translate(self, text: str, *, source_lang: str, target_lang: str) -> str: ...

    def embed(self, text: str) -> list[float]: ...
