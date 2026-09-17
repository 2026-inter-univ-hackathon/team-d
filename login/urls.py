from django.urls import path
from . import api_views, views

urlpatterns = [
    path("api/auth/me/", api_views.me, name="api-me"),
    path("api/auth/logout/", api_views.sign_out, name="api-logout"),
    path("api/auth/signup/", api_views.signup, name="api-signup"),
    path("api/auth/login/", api_views.sign_in, name="api-login"),
    path("signup/", views.signup, name="signup"),
    path("login/", views.sign_in, name="login"),
]
