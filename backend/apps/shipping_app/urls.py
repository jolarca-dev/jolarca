from django.urls import path

from .webhooks import tracking_webhook

urlpatterns = [
    path("tracking/<str:carrier>/", tracking_webhook, name="tracking-webhook"),
]
