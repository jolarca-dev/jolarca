"""tax_app async work — queue: default."""

from celery import shared_task


@shared_task(queue="default")
def prepare_oss_return(period: str) -> None:
    """Aggregate taxable amounts + VAT due per member state for a quarter.

    Sanctioned stub MVP-T4: aggregation query + review workflow. Output is
    evidence for the OSS declaration; never auto-submitted.
    """
    raise NotImplementedError("MVP-T4: OSS return aggregation not yet implemented")
