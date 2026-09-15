from django.urls import include, path
from .views import calendar

urlpatterns = [
    path("", include("login.urls")),
    path("api/", include("planner.urls")),
    path("", calendar, name="calendar"),
]
