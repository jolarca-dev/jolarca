"""i.SAF (SAF-T) monthly export — Lithuania FR0600 format.

The i.SAF (Informacinė Sistema SAF-T) is the Lithuanian tax authority's
requirement for monthly submission of invoice data in XML format.

Reference: VMI Order No. VA-40 (2017-06-29), FR0600 form specification.
Schedule: Monthly, by the 25th of the following month.

This module generates the FR0600 XML export from CommercialInvoice data.
The actual submission to VMI is done manually via the VMI portal
(https://vas.vmi.lt) or via the VMI API (when integrated).
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from datetime import date
from decimal import Decimal
from io import StringIO

import structlog
from django.db.models import Sum
from django.utils import timezone

audit = structlog.get_logger("jol.audit")


def generate_isaf_export(year: int, month: int) -> str:
    """Generate FR0600 XML for a given month.

    Returns the XML string ready for submission to VMI.
    """
    from apps.tax_app.models import CommercialInvoice

    start_date = date(year, month, 1)
    if month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, month + 1, 1)

    invoices = CommercialInvoice.objects.filter(
        issued_at__gte=timezone.make_aware(timezone.datetime.combine(start_date, timezone.datetime.min.time())),
        issued_at__lt=timezone.make_aware(timezone.datetime.combine(end_date, timezone.datetime.min.time())),
    ).select_related("order")

    if not invoices.exists():
        audit.info("isaf_export_no_invoices", year=year, month=month)
        return _empty_export_xml(year, month)

    # Aggregate by VAT rate and country
    summary = invoices.aggregate(
        total_net=Sum("net_amount"),
        total_vat=Sum("vat_amount"),
        total_gross=Sum("gross_amount"),
        invoice_count=Sum("pk", default=0),  # Count workaround
    )

    xml = _build_fr0600_xml(
        year=year,
        month=month,
        invoices=invoices,
        summary=summary,
    )

    audit.info(
        "isaf_export_generated",
        year=year,
        month=month,
        invoice_count=invoices.count(),
        total_gross=str(summary["total_gross"] or Decimal("0.00")),
    )
    return xml


def _build_fr0600_xml(year: int, month: int, invoices, summary: dict) -> str:
    """Build the FR0600 XML document."""
    root = ET.Element("SafTFile")
    root.set("xmlns", "urn:std:lt:vmi:fr0600")
    root.set("version", "1.0")

    # Header
    header = ET.SubElement(root, "Header")
    ET.SubElement(header, "Year").text = str(year)
    ET.SubElement(header, "Month").text = f"{month:02d}"
    ET.SubElement(header, "DateGenerated").text = timezone.now().strftime("%Y-%m-%d")
    ET.SubElement(header, "NumberOfInvoices").text = str(invoices.count())

    # Summary
    summary_el = ET.SubElement(root, "Summary")
    ET.SubElement(summary_el, "TotalNet").text = str(summary["total_net"] or Decimal("0.00"))
    ET.SubElement(summary_el, "TotalVAT").text = str(summary["total_vat"] or Decimal("0.00"))
    ET.SubElement(summary_el, "TotalGross").text = str(summary["total_gross"] or Decimal("0.00"))

    # Invoice lines
    invoices_el = ET.SubElement(root, "Invoices")
    for inv in invoices:
        inv_el = ET.SubElement(invoices_el, "Invoice")
        ET.SubElement(inv_el, "InvoiceNumber").text = inv.number
        ET.SubElement(inv_el, "IssueDate").text = inv.issued_at.strftime("%Y-%m-%d")
        ET.SubElement(inv_el, "SellerVATNumber").text = inv.seller_vat_number or ""
        ET.SubElement(inv_el, "BuyerCountry").text = inv.buyer_country
        ET.SubElement(inv_el, "NetAmount").text = str(inv.net_amount)
        ET.SubElement(inv_el, "VATAmount").text = str(inv.vat_amount)
        ET.SubElement(inv_el, "GrossAmount").text = str(inv.gross_amount)
        ET.SubElement(inv_el, "ReverseCharge").text = "true" if inv.reverse_charge else "false"

    # Pretty-print
    xml_str = StringIO()
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    tree.write(xml_str, encoding="unicode", xml_declaration=True)
    return xml_str.getvalue()


def _empty_export_xml(year: int, month: int) -> str:
    """Generate an empty FR0600 XML (no invoices for the period)."""
    root = ET.Element("SafTFile")
    root.set("xmlns", "urn:std:lt:vmi:fr0600")
    root.set("version", "1.0")

    header = ET.SubElement(root, "Header")
    ET.SubElement(header, "Year").text = str(year)
    ET.SubElement(header, "Month").text = f"{month:02d}"
    ET.SubElement(header, "DateGenerated").text = timezone.now().strftime("%Y-%m-%d")
    ET.SubElement(header, "NumberOfInvoices").text = "0"

    summary_el = ET.SubElement(root, "Summary")
    ET.SubElement(summary_el, "TotalNet").text = "0.00"
    ET.SubElement(summary_el, "TotalVAT").text = "0.00"
    ET.SubElement(summary_el, "TotalGross").text = "0.00"

    ET.SubElement(root, "Invoices")

    xml_str = StringIO()
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    tree.write(xml_str, encoding="unicode", xml_declaration=True)
    return xml_str.getvalue()
