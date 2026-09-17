from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_GET


@never_cache
@require_GET
def signup(request):
    return render(request, "login/signup.html")


@never_cache
@require_GET
def sign_in(request):
    return render(request, "login/login.html")
