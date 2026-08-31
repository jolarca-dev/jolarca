"""Tax service layer.

Decision order at checkout:
1. Stripe Tax (via payments_app.stripe_tax_calc) when enabled.
2. VatRateSnapshot fallback (seeded standard rates for LT/LV/EE).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal

import structlog
from django.utils import timezone

audit = structlog.get_logger("jol.audit")


@dataclass(frozen=True)
class TaxResult:
    vat_amount: Decimal
    rate: Decimal
    reverse_charge: bool
    source: str  # "stripe_tax" | "snapshot"


class TaxError(Exception):
    pass


def calculate_for_order(*, order_items, ship_country: str, net_total: Decimal) -> TaxResult:
    """Compute VAT for a checkout. Empty ship_country ⇒ domestic/no-rate (0%)."""
    # 1) Stripe Tax if enabled (payments_app is the only Stripe gateway).
    from apps.payments_app.services import PaymentsNotConfigured, stripe_tax_calc

    try:
        stripe_tax_calc(net_amount=net_total, ship_country=ship_country, seller_country="LT")
    except PaymentsNotConfigured:
        pass  # fall through to snapshot rates
    except NotImplementedError:
        pass  # sanctioned stub MVP-T2 — fall through

    if not ship_country:
        return TaxResult(
            vat_amount=Decimal("0.00"), rate=Decimal("0"), reverse_charge=False, source="snapshot"
        )

    snapshot = _latest_rate(ship_country)
    if snapshot is None:
        raise TaxError(f"No VAT rate snapshot for country '{ship_country}'.")

    vat_amount = (net_total * snapshot.rate / Decimal(100)).quantize(Decimal("0.01"))
    return TaxResult(
        vat_amount=vat_amount, rate=snapshot.rate, reverse_charge=False, source="snapshot"
    )


def _latest_rate(country: str):
    from .models import VatRateSnapshot

    return (
        VatRateSnapshot.objects.filter(country=country, valid_from__lte=timezone.now().date())
        .order_by("-valid_from")
        .first()
    )


def reverse_charge_check(*, seller_vat: str, buyer_vat: str) -> bool:
    """B2B cross-border reverse charge eligibility (sanctioned stub MVP-T3:
    VIES verification of BOTH numbers must be evidenced before applying)."""
    if not seller_vat or not buyer_vat:
        return False
    if seller_vat[:2] == buyer_vat[:2]:
        return False  # domestic: reverse charge does not apply
    raise NotImplementedError("MVP-T3: VIES-evidenced reverse charge not yet wired")


# Baltic VAT ID formats (EU VIES structure, national digit rules):
# LT — 9 digits (legal persons) or 12 digits (temporarily registered);
# LV — 11 digits; EE — 9 digits. Country prefix mandatory.
VAT_ID_PATTERNS = {
    "LT": re.compile(r"^LT(\d{9}|\d{12})$"),
    "LV": re.compile(r"^LV\d{11}$"),
    "EE": re.compile(r"^EE\d{9}$"),
}


def vat_id_format_valid(vat_id: str) -> tuple[bool, str]:
    """Format-check a VAT ID. Returns (valid, country_prefix).

    FORMAT ONLY — a live VIES confirmation is NOT performed (the VIES
    gateway is unwired, MVP-T3); callers must treat the result as
    "structurally plausible", never as "VIES-verified".
    """
    normalized = re.sub(r"[\s.-]", "", vat_id or "").upper()
    prefix = normalized[:2]
    pattern = VAT_ID_PATTERNS.get(prefix)
    if pattern is None or not pattern.match(normalized):
        return False, prefix
    return True, prefix


def issue_invoice(order) -> str:
    """Create the immutable CommercialInvoice for a paid order."""
    from .models import CommercialInvoice

    existing = CommercialInvoice.objects.filter(order=order).first()
    if existing:
        return existing.number

    number = f"INV-{timezone.now():%Y%m}-{order.number}"
    CommercialInvoice.objects.create(
        order=order,
        number=number,
        buyer_country=order.shipping_country,
        net_amount=order.total_net,
        vat_amount=order.total_vat,
        gross_amount=order.total_gross,
        issued_at=timezone.now(),
    )
    audit.info("commercial_invoice_issued", order_id=str(order.pk), invoice=number)
    return number
