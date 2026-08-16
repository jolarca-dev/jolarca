"""Order state machine — the ONLY place order status transitions are defined.

Direct writes to Order.status are forbidden (review-enforced); every
transition must pass through transition(), which validates the edge and
emits an audit event.
"""

from __future__ import annotations

import structlog
from django.utils import timezone

audit = structlog.get_logger("jol.audit")


class OrderStatus:
    PENDING = "pending"
    PAID = "paid"
    FULFILLED = "fulfilled"
    DELIVERED = "delivered"
    COMPLETED = "completed"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class OrderEvent:
    PAY = "pay"
    CANCEL = "cancel"
    TIMEOUT = "timeout"
    FULFILL = "fulfill"
    DELIVER = "deliver"
    COMPLETE = "complete"
    REFUND = "refund"


# Directed acyclic graph of allowed transitions.
TRANSITIONS: dict[str, dict[str, str]] = {
    OrderStatus.PENDING: {
        OrderEvent.PAY: OrderStatus.PAID,
        OrderEvent.CANCEL: OrderStatus.CANCELLED,
        OrderEvent.TIMEOUT: OrderStatus.CANCELLED,
    },
    OrderStatus.PAID: {
        OrderEvent.FULFILL: OrderStatus.FULFILLED,
        OrderEvent.REFUND: OrderStatus.REFUNDED,
    },
    OrderStatus.FULFILLED: {
        OrderEvent.DELIVER: OrderStatus.DELIVERED,
        OrderEvent.REFUND: OrderStatus.REFUNDED,
    },
    OrderStatus.DELIVERED: {
        OrderEvent.COMPLETE: OrderStatus.COMPLETED,
        OrderEvent.REFUND: OrderStatus.REFUNDED,
    },
    OrderStatus.COMPLETED: {},
    OrderStatus.REFUNDED: {},
    OrderStatus.CANCELLED: {},
}


class InvalidTransition(Exception):
    def __init__(self, status: str, event: str):
        super().__init__(f"Event '{event}' is not allowed from status '{status}'.")
        self.status = status
        self.event = event


def transition(order, event: str, *, actor: str = "system"):
    """Validate the edge, persist the new status, emit audit."""
    allowed = TRANSITIONS.get(order.status, {})
    if event not in allowed:
        raise InvalidTransition(order.status, event)

    previous = order.status
    order.status = allowed[event]
    order.save(update_fields=["status", "modified_at"])
    audit.info(
        "order_transition",
        order_id=str(order.pk),
        order_number=order.number,
        from_status=previous,
        to_status=order.status,
        order_event=event,
        actor=actor,
        at=timezone.now().isoformat(),
    )
    return order
