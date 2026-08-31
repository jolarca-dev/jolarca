from django.urls import path

from .views_public import LockerDirectoryView, ShippingOptionsView

# Mounted at /api/v1/ (project/urls.py). shipping-options lives under the
# orders/ namespace because it is consumed mid-checkout; lockers under
# shipping/ because the directory is reusable beyond checkout.
urlpatterns = [
    path("orders/shipping-options/", ShippingOptionsView.as_view(), name="shipping-options"),
    path("shipping/lockers/", LockerDirectoryView.as_view(), name="shipping-lockers"),
]
