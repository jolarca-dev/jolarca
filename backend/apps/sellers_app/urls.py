from django.urls import path

from .views import SellerDetailView, SellerProductsView

app_name = "sellers_app"

urlpatterns = [
    path("sellers/<str:slug>/", SellerDetailView.as_view(), name="seller-detail"),
    path(
        "sellers/<str:slug>/products/",
        SellerProductsView.as_view(),
        name="seller-products",
    ),
]
