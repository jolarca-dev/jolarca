"""Unit tests for ai_service_app — GDPR accountability for LLM egress."""

from __future__ import annotations

import pytest

from apps.ai_service_app.models import AIRequestLog

pytestmark = pytest.mark.django_db


class TestAIRequestLog:
    def test_create_log_entry(self):
        log = AIRequestLog.objects.create(
            purpose="translation",
            provider="deepl",
            pii_filtered=True,
            chars_in=500,
            chars_out=480,
            latency_ms=320,
            status="ok",
        )
        assert log.purpose == "translation"
        assert log.provider == "deepl"
        assert log.pii_filtered is True
        assert log.chars_in == 500
        assert log.status == "ok"

    def test_log_does_not_store_content(self):
        """Critical GDPR control: prompt/response content is NEVER stored."""
        log = AIRequestLog.objects.create(
            purpose="chat",
            provider="openai",
            pii_filtered=True,
            chars_in=100,
            chars_out=200,
            latency_ms=1500,
            status="ok",
        )
        # Verify no content fields exist on the model
        field_names = {f.name for f in AIRequestLog._meta.get_fields()}
        assert "prompt" not in field_names
        assert "response" not in field_names
        assert "content" not in field_names

    def test_blocked_request_logged(self):
        """PII guardrail blocks are logged for audit trail."""
        log = AIRequestLog.objects.create(
            purpose="translation",
            provider="anthropic",
            pii_filtered=False,  # Guardrail blocked the request
            chars_in=0,
            chars_out=0,
            latency_ms=5,
            status="blocked",
        )
        assert log.status == "blocked"
        assert log.pii_filtered is False
        assert log.chars_in == 0

    def test_failed_request_logged(self):
        log = AIRequestLog.objects.create(
            purpose="embedding",
            provider="selfhosted",
            pii_filtered=True,
            chars_in=200,
            chars_out=0,
            latency_ms=50,
            status="failed",
        )
        assert log.status == "failed"

    def test_index_on_purpose_and_created_at(self):
        """Verify the composite index exists for query performance."""
        indexes = AIRequestLog._meta.indexes
        index_fields = [idx.fields for idx in indexes]
        assert ["purpose", "created_at"] in index_fields

    def test_provider_choices(self):
        """All known providers should be representable."""
        for provider in ["selfhosted", "deepl", "openai", "anthropic"]:
            log = AIRequestLog.objects.create(
                purpose="translation",
                provider=provider,
                status="ok",
            )
            assert log.provider == provider
