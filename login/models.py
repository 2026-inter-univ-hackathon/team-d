import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models


class User(AbstractUser):
    username = models.CharField(max_length=32, unique=True, validators=[RegexValidator(
        r"^[a-z0-9][a-z0-9._-]{0,31}$", "ユーザー名は半角英数字・ドット・ハイフン・アンダーバーで入力してください。")])
    email = models.EmailField(unique=True, editable=False)

    def save(self, *args, **kwargs):
        self.username = self.username.strip().lower()
        self.email = f"{self.username}@example.com"
        super().save(*args, **kwargs)


class LoginToken(models.Model):
    # このトークンを使うユーザー
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="login_tokens",
    )

    # トークンそのものではなく、ハッシュを保存
    token_hash = models.CharField(max_length=64, unique=True)

    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(db_index=True)

    @classmethod
    def issue(cls, user):
        """ログイン成功後に呼び、8時間有効なトークンを発行する。"""
        if not user.is_active:
            raise ValueError("無効なユーザーには発行できません。")

        raw_token = secrets.token_urlsafe(32)

        token = cls.objects.create(
            user=user,
            token_hash=hashlib.sha256(
                raw_token.encode("utf-8")
            ).hexdigest(),
            expires_at=timezone.now() + timedelta(hours=8),
        )

        return raw_token, token

    @classmethod
    def resolve(cls, raw_token):
        """有効なトークンならDBのレコード、無効ならNoneを返す。"""
        if not isinstance(raw_token, str) or len(raw_token) != 43:
            return None

        token_hash = hashlib.sha256(
            raw_token.encode("utf-8")
        ).hexdigest()

        return (
            cls.objects
            .select_related("user")
            .filter(
                token_hash=token_hash,
                expires_at__gt=timezone.now(),
                user__is_active=True,
            )
            .first()
        )

    def revoke(self):
        """ログアウト時に呼び、このトークンを無効にする。"""
        self.delete()
