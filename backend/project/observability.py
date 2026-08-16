"""Observability wiring: structured logging, optional tracing/error backends.

Deliberately lives in project/, not apps/core/: this is deployment
configuration, not a shared domain primitive.
"""

from __future__ import annotations

import logging

import structlog
from django.conf import settings

logger = logging.getLogger(__name__)

AUDIT_LOGGER_NAME = "jol.audit"


def configure_structlog() -> None:
    """JSON logs in production, readable console in dev."""
    processors: list = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    if settings.DEBUG:
        renderer: type = structlog.dev.ConsoleRenderer
    else:
        renderer = structlog.processors.JSONRenderer

    structlog.configure(
        processors=[*processors, renderer()],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )


def setup_observability() -> None:
    """Called once from settings. All integrations are opt-in via env."""
    configure_structlog()

    # Sentry: error aggregation. DSN absent => silently disabled.
    sentry_dsn = getattr(settings, "SENTRY_DSN", "")
    if sentry_dsn:
        try:
            import sentry_sdk

            sentry_sdk.init(
                dsn=sentry_dsn,
                environment=settings.DJANGO_ENV,
                send_default_pii=False,  # GDPR: never ship PII to processors by default
                traces_sample_rate=0.1,
            )
        except ImportError:
            logger.warning("SENTRY_DSN set but sentry-sdk not installed")

    # OpenTelemetry: exporter endpoint absent => disabled. SDK is a planned
    # dependency (docs/ASSUMPTIONS.md §A-08) — import is guarded meanwhile.
    otel_endpoint = getattr(settings, "OTEL_EXPORTER_OTLP_ENDPOINT", "")
    if otel_endpoint:
        try:
            from opentelemetry import trace
            from opentelemetry.sdk.trace import TracerProvider

            trace.set_tracer_provider(TracerProvider())
            logger.info("opentelemetry tracing enabled", extra={"endpoint": otel_endpoint})
        except ImportError:
            logger.warning("OTEL endpoint set but opentelemetry-sdk not installed")


def get_audit_logger() -> structlog.stdlib.BoundLogger:
    """Compliance audit channel (ISO 27001 A.8.15 logging).

    Records are emitted structured; compliance_app persists durable copies
    for actions that modify personal data.
    """
    return structlog.get_logger(AUDIT_LOGGER_NAME)
