from django.contrib.auth import login, logout
from django.db import IntegrityError, transaction
from django.shortcuts import redirect, render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_http_methods, require_POST
from .forms import LoginForm, SignupForm


@never_cache
@require_http_methods(["GET", "POST"])
def signup(request):
    if request.user.is_authenticated:
        return redirect("calendar")
    form = SignupForm(request.POST or None)
    if request.method == "POST" and form.is_valid():
        try:
            with transaction.atomic():
                user = form.save()
        except IntegrityError:
            form.add_error("username", "このアカウントはすでに登録されています。")
        else:
            login(request, user)
            return redirect("calendar")
    return render(request, "login/auth.html", {"form": form, "signup": True})


@never_cache
@require_http_methods(["GET", "POST"])
def sign_in(request):
    if request.user.is_authenticated:
        return redirect("calendar")
    form = LoginForm(request, data=request.POST or None)
    if request.method == "POST" and form.is_valid():
        login(request, form.get_user())
        return redirect("calendar")
    return render(request, "login/auth.html", {"form": form, "signup": False})


@never_cache
@require_POST
def sign_out(request):
    logout(request)
    return redirect("login")
