from functools import wraps

from django.http import JsonResponse

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
