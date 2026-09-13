from django.urls import path
from . import views

urlpatterns = [
    path("events/import/", views.import_events, name="import-events"),
    path("events/", views.events, name="events"),
    path("events/<uuid:event_id>/", views.event_detail, name="event-detail"),
]
