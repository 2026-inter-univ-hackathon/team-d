from functools import wraps

from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt, csrf_protect

from .models import LoginToken


def token_required(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        authorization = request.headers.get("Authorization", "")
        parts = authorization.split()

        if len(parts) != 2 or parts[0].lower() != "bearer":
            return JsonResponse(
                {"error": "ログインが必要です。"},
                status=401,
            )

        token = LoginToken.resolve(parts[1])

        if token is None:
            return JsonResponse(
                {"error": "ログインし直してください。"},
                status=401,
            )

        # 後続の処理が、本人とトークンを参照できるようにする
        request.user = token.user
        request.login_token = token

        return view(request, *args, **kwargs)

    return wrapped


def session_or_token(view):
    """画面の移行中に、Cookie認証とトークン認証を使い分ける。"""
    token_view = token_required(view)
    session_view = csrf_protect(view)

    @csrf_exempt
    @never_cache
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if "Authorization" in request.headers:
            # 不正なトークンなら、ここで拒否する
            return token_view(request, *args, **kwargs)

        # 現在の画面からの操作にはCSRFチェックを適用する
        return session_view(request, *args, **kwargs)

    return wrapped
