from django.urls import path

from .views import VatIdValidateView

urlpatterns = [
    path("tax/vat-id/validate/", VatIdValidateView.as_view(), name="vat-id-validate"),
]
