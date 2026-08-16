"""Root URL configuration.

API surface is versioned at /api/v1/. The OpenAPI schema at /api/schema/ is
the single contract consumed by frontend codegen (docs/api/openapi.yaml is a
CI-generated snapshot of it).
"""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.core.health import healthz, readyz

urlpatterns = [
    # Liveness / readiness probes (exempt from GDPR halt; see gdpr_middleware).
    path("healthz/", healthz, name="healthz"),
    path("readyz/", readyz, name="readyz"),
    # Admin is ops-only; production restricts access at the edge (ADR-0006).
    path("admin/", admin.site.urls),
    # API v1
    path("api/v1/auth/", include("apps.users_app.urls")),
    path("api/v1/orders/", include("apps.orders_app.urls")),
    path("api/v1/payments/webhooks/", include("apps.payments_app.urls")),
    path("api/v1/shipping/webhooks/", include("apps.shipping_app.urls")),
    # OpenAPI contract
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/schema/swagger/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="schema-swagger",
    ),
]
