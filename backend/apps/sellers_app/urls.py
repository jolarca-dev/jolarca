from django.urls import path

from .views import SellerDetailView, SellerProductsView

urlpatterns = [
    path("sellers/<str:slug>/", SellerDetailView.as_view(), name="seller-detail"),
    path(
        "sellers/<str:slug>/products/",
        SellerProductsView.as_view(),
        name="seller-products",
    ),
]
