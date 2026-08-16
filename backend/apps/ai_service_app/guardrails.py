"""PII guardrails — the hard gate between our data and AI providers.

Design rules:
- The filter is MANDATORY: there is no settings flag that skips it for
  outbound calls (AI_PII_FILTER_ENABLED exists only to fail-closed if
  someone tries to disable it — see protect()).
- Heuristic by nature: patterns cover common Baltic PII shapes; recall is
  improved over time. A blocked call is audit-logged, never silent.
"""

from __future__ import annotations

import re

import structlog
from django.conf import settings

from .models import AIRequestLog

audit = structlog.get_logger("jol.audit")

_PATTERNS = [
    re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"),  # emails
    re.compile(r"\+?\d{8,15}\b"),  # phone-ish runs
    re.compile(r"\b\d{11}\b"),  # LT/LV/EE personal codes
    re.compile(r"(?i)\b(personal|passport|id)\s*(code|number)?\s*[:#]?\s*\d{6,}\b"),
]


class PIIBlocked(Exception):
    """Text failed the guardrail and must not leave the system."""


def strip_pii(text: str) -> str:
    """Best-effort redaction for catalog-like content."""
    redacted = text
    for pattern in _PATTERNS:
        redacted = pattern.sub("[REDACTED]", redacted)
    return redacted


def protect(text: str) -> str:
    """Fail-closed wrapper: if the guardrail is disabled in settings, we do
    NOT let traffic through — we block it. Security controls do not have off
    switches in production paths."""
    if not getattr(settings, "AI_PII_FILTER_ENABLED", True):
        raise PIIBlocked("PII guardrail is disabled; refusing outbound AI call (fail-closed).")
    return strip_pii(text)


def log_outbound(
    *,
    purpose: str,
    provider: str,
    chars_in: int,
    chars_out: int,
    latency_ms: int,
    status: str = "ok",
) -> None:
    AIRequestLog.objects.create(
        purpose=purpose,
        provider=provider,
        pii_filtered=True,
        chars_in=chars_in,
        chars_out=chars_out,
        latency_ms=latency_ms,
        status=status,
    )
    audit.info("ai_outbound_call", purpose=purpose, provider=provider, status=status)
