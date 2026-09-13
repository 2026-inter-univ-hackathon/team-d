from django.urls import path
from .views import calendar
from accounts import views as accounts

urlpatterns = [
    path("", calendar, name="calendar"),
    path("signup/", accounts.signup, name="signup"),
    path("login/", accounts.sign_in, name="login"),
    path("logout/", accounts.sign_out, name="logout"),
]
