from django.urls import path

from .webhooks import TrackingWebhook

app_name = "shipping_webhooks"

urlpatterns = [
    path("tracking/<str:carrier>/", TrackingWebhook.as_view(), name="tracking-webhook"),
]
