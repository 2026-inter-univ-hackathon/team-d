import json

from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST

from .forms import LoginForm, SignupForm
from .models import LoginToken


@csrf_exempt
@never_cache
@require_POST
def sign_in(request):
    # JSONで送られたリクエストだけ受け付ける
    if request.content_type != "application/json":
        return JsonResponse(
            {"error": "JSON形式で送信してください。"},
            status=415,
        )

    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "入力データを読み込めませんでした。"},
            status=400,
        )

    # ユーザー名とパスワードが文字列か確認
    if not isinstance(data, dict) or not all(
        isinstance(data.get(key), str)
        for key in ("username", "password")
    ):
        return JsonResponse(
            {"error": "ユーザー名とパスワードを入力してください。"},
            status=400,
        )

    # 既存のログインフォームでパスワードを照合
    form = LoginForm(request, data=data)

    if not form.is_valid():
        return JsonResponse(
            {"error": "ユーザー名またはパスワードが違います。"},
            status=401,
        )

    user = form.get_user()

    # 前のステップで作った仕組みを使う
    raw_token, token = LoginToken.issue(user)

    return JsonResponse({
        "token": raw_token,
        "token_type": "Bearer",
        "expires_at": token.expires_at.isoformat(),
        "user": {
            "id": user.pk,
            "email": user.email,
        },
    })


@csrf_exempt
@never_cache
@require_POST
def signup(request):
    if request.content_type != "application/json":
        return JsonResponse(
            {"error": "JSON形式で送信してください。"},
            status=415,
        )

    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "入力データを読み込めませんでした。"},
            status=400,
        )

    required_fields = ("username", "password1", "password2")

    if not isinstance(data, dict) or not all(
        isinstance(data.get(key), str)
        for key in required_fields
    ):
        return JsonResponse(
            {"error": "ユーザー名とパスワード・確認用パスワードを入力してください。"},
            status=400,
        )

    # 既存の登録フォームで入力内容を確認
    form = SignupForm(data)

    if not form.is_valid():
        return JsonResponse(
            {
                "error": "入力内容を確認してください。",
                "fields": form.errors.get_json_data(),
            },
            status=400,
        )

    try:
        # ユーザー作成とトークン発行をまとめて行う
        with transaction.atomic():
            user = form.save()
            raw_token, token = LoginToken.issue(user)

    except IntegrityError:
        return JsonResponse(
            {"error": "登録が競合しました。ユーザー名を確認して再度お試しください。"},
            status=409,
        )

    return JsonResponse(
        {
            "token": raw_token,
            "token_type": "Bearer",
            "expires_at": token.expires_at.isoformat(),
            "user": {
                "id": user.pk,
                "email": user.email,
            },
        },
        status=201,
    )
