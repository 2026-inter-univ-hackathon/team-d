from django.urls import include, path
from .views import calendar
from accounts import views as accounts
from accounts import api_views

urlpatterns = [
    path("api/auth/login/", api_views.sign_in, name="api-login"),
    path("api/", include("planner.urls")),
    path("", calendar, name="calendar"),
    path("signup/", accounts.signup, name="signup"),
    path("login/", accounts.sign_in, name="login"),
    path("logout/", accounts.sign_out, name="logout"),
]
