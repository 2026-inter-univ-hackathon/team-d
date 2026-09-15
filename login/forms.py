from django import forms
from django.contrib.auth.forms import AuthenticationForm, UserCreationForm
from .models import User


class SignupForm(UserCreationForm):
    class Meta:
        model = User
        fields = ("username",)

    def clean_username(self):
        username = self.cleaned_data["username"].lower()
        if User.objects.filter(username=username).exists():
            raise forms.ValidationError("このアカウントはすでに登録されています。")
        return username


class LoginForm(AuthenticationForm):
    username = forms.CharField(max_length=32, label="ユーザー名")

    def clean_username(self):
        return self.cleaned_data["username"].strip().lower()
