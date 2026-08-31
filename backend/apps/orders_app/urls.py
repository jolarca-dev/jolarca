from django.urls import path

from .views import (
    CheckoutView,
    OrderCreateView,
    OrderDetailView,
    OrderListView,
)


class OrderCollectionView(OrderCreateView, OrderListView):
    """POST creates (GAP-O08); GET lists history (GAP-O03)."""


urlpatterns = [
    path("checkout/", CheckoutView.as_view(), name="checkout"),
    path("", OrderCollectionView.as_view(), name="order-collection"),
    path("<uuid:order_id>/", OrderDetailView.as_view(), name="order-detail"),
]
