from django.urls import path

from .views import (
    CatalogHomeView,
    CategoriesIndexView,
    CategoryProductsView,
    ProductDetailView,
    RelatedProductsView,
)

urlpatterns = [
    path("catalog/home/", CatalogHomeView.as_view(), name="catalog-home"),
    path("categories/", CategoriesIndexView.as_view(), name="categories-index"),
    path("products/<str:slug>/", ProductDetailView.as_view(), name="product-detail"),
    path(
        "products/<str:slug>/related/",
        RelatedProductsView.as_view(),
        name="product-related",
    ),
    path(
        "categories/<str:slug>/products/",
        CategoryProductsView.as_view(),
        name="category-products",
    ),
]
