from django.urls import path

from .views import SearchSuggestView, SearchView

app_name = "search_app"

urlpatterns = [
    path("search/", SearchView.as_view(), name="search"),
    path("search/suggest/", SearchSuggestView.as_view(), name="search-suggest"),
]
