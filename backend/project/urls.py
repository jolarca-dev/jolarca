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
    # Public storefront catalog (read-only browse; writes never land here).
    path("api/v1/", include("apps.products_app.urls")),
    path("api/v1/", include("apps.sellers_app.urls")),
    path("api/v1/", include("apps.search_app.urls")),
    path("api/v1/orders/", include("apps.orders_app.urls")),
    path("api/v1/", include("apps.orders_app.urls_cart")),
    path("api/v1/", include("apps.shipping_app.urls_public")),
    path("api/v1/", include("apps.tax_app.urls")),
    path("api/v1/payments/webhooks/", include("apps.payments_app.urls")),
    # Internal payment API — Model A (ADR-0005): the sole sanctioned
    # cross-program interface (hub consumes this boundary; network-
    # restricted, never on the public ingress).
    path("internal/v1/", include("apps.payments_app.urls_internal")),
    path("api/v1/shipping/webhooks/", include("apps.shipping_app.urls")),
    # OpenAPI contract
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/schema/swagger/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="schema-swagger",
    ),
]
