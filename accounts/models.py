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
