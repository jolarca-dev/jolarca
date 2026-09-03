from django.urls import path

from .cart_views import CartItemDetailView, CartItemsView, CartSyncView, CartView

app_name = "orders_cart"

# Mounted at /api/v1/ (project/urls.py) — the cart root is its own resource
# tree, sibling to orders/, matching the frontend store contract.
urlpatterns = [
    path("cart/", CartView.as_view(), name="cart"),
    path("cart/items/", CartItemsView.as_view(), name="cart-items"),
    path("cart/items/<uuid:item_id>/", CartItemDetailView.as_view(), name="cart-item-detail"),
    path("cart/sync/", CartSyncView.as_view(), name="cart-sync"),
]
