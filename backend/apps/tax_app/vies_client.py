"""VIES (VAT Information Exchange System) live validation client.

Calls the EU VIES SOAP service to verify VAT numbers in real-time.
Endpoint: https://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl

Design principles:
- VIES is an external dependency that may be unavailable. We NEVER block
  the user experience on VIES availability.
- On VIES timeout/error: return vies_available=False, let the caller
  decide (allow with manual_review flag, or block).
- Results are cached for 24 hours to reduce load on the VIES gateway.
- The VIES response includes: country_code, vat_number, request_date,
  valid (bool), name, address. We store only the validity + timestamp.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import timedelta

import structlog
from django.core.cache import cache

audit = structlog.get_logger("jol.audit")

VIES_WSDL_URL = "https://ec.europa.eu/taxation_customs/vies/checkVatService.wsdl"
VIES_CACHE_PREFIX = "vies_check"
VIES_CACHE_TTL = timedelta(hours=24).total_seconds()  # 24 hours
VIES_TIMEOUT_SECONDS = 10  # Don't block UX on slow VIES


@dataclass(frozen=True)
class ViesResult:
    vat_id: str
    valid: bool
    name: str  # Business name as registered (may be empty)
    address: str  # Registered address (may be empty)
    vies_available: bool  # False if VIES was unreachable
    source: str  # "vies_live" | "vies_cache" | "format_only"


def check_vat_live(vat_id: str) -> ViesResult:
    """Perform a live VIES check for a VAT number.

    The vat_id MUST include the country prefix (e.g., "LT123456789").
    Returns ViesResult with vies_available=True if VIES responded,
    or vies_available=False if VIES was unreachable/timeout.
    """
    from .services import vat_id_format_valid

    # Normalize
    normalized = vat_id.strip().upper().replace(" ", "").replace("-", "").replace(".", "")

    # Format check first (fast, local)
    format_valid, country_prefix = vat_id_format_valid(normalized)
    if not format_valid:
        return ViesResult(
            vat_id=normalized,
            valid=False,
            name="",
            address="",
            vies_available=True,  # We know it's invalid without VIES
            source="format_only",
        )

    # Extract country code and number
    country_code = normalized[:2]
    vat_number = normalized[2:]

    # Check cache first
    cache_key = _cache_key(country_code, vat_number)
    cached = cache.get(cache_key)
    if cached is not None:
        audit.info(
            "vies_check_cache_hit",
            vat_id=normalized,
            valid=cached["valid"],
        )
        return ViesResult(
            vat_id=normalized,
            valid=cached["valid"],
            name=cached.get("name", ""),
            address=cached.get("address", ""),
            vies_available=True,
            source="vies_cache",
        )

    # Live VIES call
    try:
        result = _call_vies_soap(country_code, vat_number)
        # Cache the result
        cache.set(
            cache_key,
            {
                "valid": result.valid,
                "name": result.name,
                "address": result.address,
            },
            VIES_CACHE_TTL,
        )
        audit.info(
            "vies_check_live",
            vat_id=normalized,
            valid=result.valid,
            source="vies_live",
        )
        return result
    except ViesUnavailableError:
        audit.warning(
            "vies_check_unavailable",
            vat_id=normalized,
            fallback="format_only",
        )
        return ViesResult(
            vat_id=normalized,
            valid=format_valid,  # Best we can do
            name="",
            address="",
            vies_available=False,
            source="format_only",
        )


class ViesUnavailableError(Exception):
    """Raised when the VIES gateway is unreachable."""

    pass


def _call_vies_soap(country_code: str, vat_number: str) -> ViesResult:
    """Call the VIES SOAP service.

    Uses zeep (SOAP client) if available, falls back to direct HTTP
    POST to the VIES REST-like endpoint.
    """
    try:
        return _call_vies_via_zeep(country_code, vat_number)
    except ImportError:
        return _call_vies_via_http(country_code, vat_number)


def _call_vies_via_zeep(country_code: str, vat_number: str) -> ViesResult:
    """VIES check via zeep SOAP client (preferred)."""
    from zeep import Client
    from zeep.transports import Transport
    from requests import Session

    session = Session()
    session.timeout = VIES_TIMEOUT_SECONDS
    transport = Transport(session=session, timeout=VIES_TIMEOUT_SECONDS)
    client = Client(VIES_WSDL_URL, transport=transport)

    try:
        response = client.service.checkVat(
            countryCode=country_code,
            vatNumber=vat_number,
        )
        return ViesResult(
            vat_id=f"{country_code}{vat_number}",
            valid=response.valid,
            name=response.name or "",
            address=response.address or "",
            vies_available=True,
            source="vies_live",
        )
    except Exception as e:
        # VIES is known to be unreliable (frequent timeouts, maintenance)
        if "timeout" in str(e).lower() or "unreachable" in str(e).lower():
            raise ViesUnavailableError(str(e)) from e
        # Other errors (invalid format, service error) — treat as unavailable
        raise ViesUnavailableError(str(e)) from e


def _call_vies_via_http(country_code: str, vat_number: str) -> ViesResult:
    """VIES check via direct HTTP (fallback when zeep not installed).

    Uses the VIES REST-like endpoint at:
    https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number
    """
    import requests

    url = "https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number"
    payload = {
        "countryCode": country_code,
        "vatNumber": vat_number,
    }

    try:
        response = requests.post(url, json=payload, timeout=VIES_TIMEOUT_SECONDS)
        response.raise_for_status()
        data = response.json()

        return ViesResult(
            vat_id=f"{country_code}{vat_number}",
            valid=data.get("valid", False),
            name=data.get("name", ""),
            address=data.get("address", ""),
            vies_available=True,
            source="vies_live",
        )
    except requests.Timeout:
        raise ViesUnavailableError("VIES REST API timeout")
    except requests.ConnectionError:
        raise ViesUnavailableError("VIES REST API unreachable")
    except Exception as e:
        raise ViesUnavailableError(str(e)) from e


def _cache_key(country_code: str, vat_number: str) -> str:
    """Generate a cache key for VIES results."""
    raw = f"{country_code}:{vat_number}"
    hash_suffix = hashlib.sha256(raw.encode()).hexdigest()[:8]
    return f"{VIES_CACHE_PREFIX}:{country_code}:{vat_number}:{hash_suffix}"
