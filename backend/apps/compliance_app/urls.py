from django.urls import path

from .views import ConsentView

urlpatterns = [
    path("consent/", ConsentView.as_view(), name="compliance-consent"),
]
