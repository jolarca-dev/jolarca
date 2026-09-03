from django.urls import path

from .webhooks import StripePaymentWebhook

app_name = "payments_webhooks"

urlpatterns = [
    path("stripe/", StripePaymentWebhook.as_view(), name="stripe-webhook"),
]
