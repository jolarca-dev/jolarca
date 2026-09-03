"""Internal payment API routes — Model A (ADR-0005).

Mounted at /internal/v1/ (project/urls.py). NEVER exposed on the public
ingress: network policy restricts this surface to the sanctioned callers
(security/network-policy.md payment-boundary matrix).
"""

from django.urls import path

from . import internal_views

app_name = "payments_internal"

urlpatterns = [
    path(
        "payment-intents",
        internal_views.PaymentIntentListCreateView.as_view(),
        name="internal-payment-intents",
    ),
    path(
        "payment-intents/<uuid:intent_id>",
        internal_views.PaymentIntentDetailView.as_view(),
        name="internal-payment-intent-detail",
    ),
    path("refunds", internal_views.RefundCreateView.as_view(), name="internal-refunds"),
]
