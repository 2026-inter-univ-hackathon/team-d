from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import ensure_csrf_cookie


@never_cache
@login_required
@ensure_csrf_cookie
def calendar(request):
    return render(request, "index.html")
