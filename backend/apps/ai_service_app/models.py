"""AI audit model — GDPR accountability for automated processing (Art. 5(2),
Art. 22 context). Every outbound LLM/API call is recorded BEFORE dispatch."""

from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class AIRequestLog(UUIDModel, TimeStampedModel):
    purpose = models.CharField(max_length=32, help_text="translation|embedding|chat")
    provider = models.CharField(max_length=32, help_text="selfhosted|deepl|openai|anthropic")
    pii_filtered = models.BooleanField(default=False, help_text="Guardrail ran and passed")
    chars_in = models.PositiveIntegerField(default=0)
    chars_out = models.PositiveIntegerField(default=0)
    latency_ms = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=16, default="ok", help_text="ok|failed|blocked")
    # Deliberately NO field storing the prompt/response content: content may
    # contain residual PII; retention of content is a separate legal decision.

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["purpose", "created_at"])]
