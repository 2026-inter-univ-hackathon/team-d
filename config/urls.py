from django.urls import path
from .views import calendar

urlpatterns = [path("", calendar, name="calendar")]
