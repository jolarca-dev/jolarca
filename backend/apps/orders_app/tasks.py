"""orders_app async work — queue: default."""

from celery import shared_task
from django.utils import timezone


@shared_task(queue="default")
def sweep_unpaid_orders() -> None:
    """Beat-driven: cancel orders pending > 30 minutes (stock release hook)."""
    from datetime import timedelta

    from .models import Order
    from .state_machine import OrderEvent, OrderStatus, transition

    cutoff = timezone.now() - timedelta(minutes=30)
    stale = Order.objects.filter(status=OrderStatus.PENDING, created_at__lt=cutoff)
    for order in stale.iterator():
        transition(order, OrderEvent.TIMEOUT, actor="system.sweep")


@shared_task(queue="default")
def fulfill(order_id: str) -> None:
    """Paid → fulfilled hand-off: requests carrier label via shipping_app."""
    from apps.shipping_app.services import create_shipment

    from .models import Order
    from .state_machine import OrderEvent, transition

    order = Order.objects.filter(pk=order_id).first()
    if order is None:
        return
    create_shipment(order)
    transition(order, OrderEvent.FULFILL, actor="system.fulfill")
