"""tax_app async work — queue: default + compliance."""

import structlog
from celery import shared_task
from django.utils import timezone

audit = structlog.get_logger("jol.audit")


@shared_task(queue="default")
def prepare_oss_return(period: str) -> None:
    """Aggregate taxable amounts + VAT due per member state for a quarter.

    Period format: "2026Q3" (year + quarter).
    Output is stored in OssReturnData for review; never auto-submitted.
    The finance team reviews and submits via the VMI portal.
    """
    from apps.orders_app.models import Order
    from apps.tax_app.models import OssReturnData

    year, quarter = int(period[:4]), int(period[-1])
    quarter_months = {1: (1, 3), 2: (4, 6), 3: (7, 9), 4: (10, 12)}
    start_month, end_month = quarter_months[quarter]

    from datetime import date, datetime

    start_date = date(year, start_month, 1)
    if end_month == 12:
        end_date = date(year + 1, 1, 1)
    else:
        end_date = date(year, end_month + 1, 1)

    # Aggregate by buyer country (destination principle for OSS)
    orders = Order.objects.filter(
        created_at__gte=timezone.make_aware(
            datetime.combine(start_date, datetime.min.time())
        ),
        created_at__lt=timezone.make_aware(
            datetime.combine(end_date, datetime.min.time())
        ),
        status__in=["paid", "fulfilled", "completed"],
    )

    country_totals = {}
    for order in orders.iterator():
        country = order.shipping_country
        if not country or country == "LT":
            continue  # Domestic sales not in OSS return
        if country not in country_totals:
            country_totals[country] = {"taxable": order.total_net, "vat": order.total_vat}
        else:
            country_totals[country]["taxable"] += order.total_net
            country_totals[country]["vat"] += order.total_vat

    for country, totals in country_totals.items():
        OssReturnData.objects.update_or_create(
            period=period,
            country=country,
            defaults={
                "taxable_amount": totals["taxable"],
                "vat_due": totals["vat"],
                "status": "draft",
            },
        )

    audit.info(
        "oss_return_prepared",
        period=period,
        countries=len(country_totals),
    )


@shared_task(queue="compliance")
def monthly_isaf_export() -> str:
    """Generate i.SAF (FR0600) XML for the previous month.

    Beat-driven: runs on the 1st of each month. Generates the FR0600
    export for the previous month's invoices. The XML is stored for
    manual submission to VMI via the portal or API.

    Schedule: 0 6 1 * * (1st of each month at 06:00)
    """

    from .isaf_export import generate_isaf_export

    today = timezone.now().date()
    # Previous month
    if today.month == 1:
        year, month = today.year - 1, 12
    else:
        year, month = today.year, today.month - 1

    xml = generate_isaf_export(year, month)

    # Store the export for audit trail
    from apps.compliance_app.models import AuditLog

    AuditLog.objects.create(
        action="isaf_export_generated",
        data={
            "year": year,
            "month": month,
            "xml_length": len(xml),
            "period": f"{year}-{month:02d}",
        },
    )

    audit.info("isaf_export_task_completed", year=year, month=month)
    return xml
