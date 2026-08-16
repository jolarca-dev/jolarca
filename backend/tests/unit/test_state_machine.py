"""Order state machine — the money path's guard rails. No DB required."""

import pytest

from apps.orders_app.state_machine import (
    TRANSITIONS,
    InvalidTransition,
    OrderEvent,
    OrderStatus,
    transition,
)


class _Order:
    """Structural stand-in: transition() only reads/writes .status."""

    def __init__(self, status):
        self.status = status
        self.number = "JOL-TEST-000001"
        self.pk = "00000000-0000-0000-0000-000000000000"

    def save(self, update_fields=None):
        pass


@pytest.mark.parametrize(
    ("start", "event", "expected"),
    [
        (OrderStatus.PENDING, OrderEvent.PAY, OrderStatus.PAID),
        (OrderStatus.PENDING, OrderEvent.CANCEL, OrderStatus.CANCELLED),
        (OrderStatus.PENDING, OrderEvent.TIMEOUT, OrderStatus.CANCELLED),
        (OrderStatus.PAID, OrderEvent.FULFILL, OrderStatus.FULFILLED),
        (OrderStatus.FULFILLED, OrderEvent.DELIVER, OrderStatus.DELIVERED),
        (OrderStatus.DELIVERED, OrderEvent.COMPLETE, OrderStatus.COMPLETED),
        (OrderStatus.PAID, OrderEvent.REFUND, OrderStatus.REFUNDED),
    ],
)
def test_legal_transitions(start, event, expected):
    order = _Order(start)
    transition(order, event)
    assert order.status == expected


@pytest.mark.parametrize(
    ("start", "event"),
    [
        (OrderStatus.PENDING, OrderEvent.FULFILL),  # cannot fulfill unpaid
        (OrderStatus.PENDING, OrderEvent.DELIVER),
        (OrderStatus.PAID, OrderEvent.PAY),  # double-pay blocked
        (OrderStatus.COMPLETED, OrderEvent.REFUND),  # terminal states are terminal
        (OrderStatus.REFUNDED, OrderEvent.FULFILL),
        (OrderStatus.CANCELLED, OrderEvent.PAY),
    ],
)
def test_illegal_transitions_raise(start, event):
    order = _Order(start)
    with pytest.raises(InvalidTransition):
        transition(order, event)
    assert order.status == start  # no partial mutation


def test_terminal_states_have_no_edges():
    for terminal in (OrderStatus.COMPLETED, OrderStatus.REFUNDED, OrderStatus.CANCELLED):
        assert TRANSITIONS[terminal] == {}
