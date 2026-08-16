"""ai_service_app tasks — queue: ai (isolated pool, hard timeouts)."""

import time

from celery import shared_task

# Provider fallback chain: local-first by policy.
_PROVIDER_CHAIN = ("selfhosted", "deepl", "openai")
_TARGET_LOCALES = ("lt", "lv", "et")


def _get_provider(name: str):
    from .providers.commercial import CommercialProvider
    from .providers.deepl import DeepLProvider
    from .providers.selfhosted import SelfHostedProvider

    return {"selfhosted": SelfHostedProvider, "deepl": DeepLProvider, "openai": CommercialProvider}[
        name
    ]()


@shared_task(queue="ai", time_limit=300, soft_time_limit=240, max_retries=3, default_retry_delay=60)
def translate_listing_content(listing_id: str) -> None:
    """Translate listing title/description into lt/lv/et.

    Guardrail is enforced here (protect) — the chain may reach commercial
    providers, so no call leaves without PII redaction + audit log.
    """
    from apps.products_app.models import ProductListing

    from . import guardrails

    listing = ProductListing.objects.filter(pk=listing_id).first()
    if listing is None:
        return

    source = listing.title
    if not source:
        return
    safe_text = guardrails.protect(source)

    last_error: Exception | None = None
    for provider_name in _PROVIDER_CHAIN:
        try:
            provider = _get_provider(provider_name)
        except Exception as exc:  # noqa: BLE001 — provider unconfigured
            last_error = exc
            continue
        for locale in _TARGET_LOCALES:
            started = time.monotonic()
            try:
                translated = provider.translate(safe_text, source_lang="en", target_lang=locale)
            except Exception as exc:  # noqa: BLE001 — try next provider
                guardrails.log_outbound(
                    purpose="translation",
                    provider=provider_name,
                    chars_in=len(safe_text),
                    chars_out=0,
                    latency_ms=int((time.monotonic() - started) * 1000),
                    status="failed",
                )
                last_error = exc
                break
            guardrails.log_outbound(
                purpose="translation",
                provider=provider_name,
                chars_in=len(safe_text),
                chars_out=len(translated),
                latency_ms=int((time.monotonic() - started) * 1000),
                status="ok",
            )
            setattr(listing, f"title_{locale}", translated)
            listing.save(update_fields=[f"title_{locale}"])
        else:
            return  # full chain success for this provider
    if last_error is not None:
        raise translate_listing_content.retry(exc=last_error)
