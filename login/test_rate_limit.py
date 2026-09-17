import json
from datetime import datetime, timedelta, timezone as datetime_timezone
from unittest.mock import patch

from django.test import TestCase

from .models import LoginAttempt, LoginToken, User


class LoginRateLimitTests(TestCase):
    endpoint = "/api/auth/login/"
    start = datetime(2026, 1, 1, tzinfo=datetime_timezone.utc)

    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="alice", password="123456")

    def login(self, username="alice", password="wrong"):
        return self.client.post(
            self.endpoint,
            data=json.dumps({"username": username, "password": password}),
            content_type="application/json",
        )

    @patch("login.rate_limit.timezone.now")
    def test_fifth_failure_blocks_login_for_fifteen_minutes(self, now):
        now.return_value = self.start

        for _ in range(4):
            self.assertEqual(self.login().status_code, 401)

        response = self.login()
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.headers["Retry-After"], "900")
        self.assertEqual(response.json(), {
            "error": "ログイン試行が多すぎます。しばらく待ってから再度お試しください。",
        })

        now.return_value = self.start + timedelta(minutes=1)
        blocked = self.login(password="123456")
        self.assertEqual(blocked.status_code, 429)
        self.assertEqual(blocked.headers["Retry-After"], "840")
        self.assertFalse(LoginToken.objects.exists())

        now.return_value = self.start + timedelta(minutes=15)
        allowed = self.login(password="123456")
        self.assertEqual(allowed.status_code, 200)
        self.assertIsNotNone(LoginToken.resolve(allowed.json()["token"]))

    @patch("login.rate_limit.timezone.now")
    def test_failure_window_restarts_after_fifteen_minutes(self, now):
        now.return_value = self.start
        for _ in range(4):
            self.assertEqual(self.login().status_code, 401)

        now.return_value = self.start + timedelta(minutes=15)
        self.assertEqual(self.login().status_code, 401)
        attempt = LoginAttempt.objects.get()
        self.assertEqual(attempt.failed_count, 1)
        self.assertIsNone(attempt.blocked_until)

    @patch("login.rate_limit.timezone.now")
    def test_success_clears_failures(self, now):
        now.return_value = self.start
        self.assertEqual(self.login().status_code, 401)
        self.assertEqual(self.login().status_code, 401)
        self.assertTrue(LoginAttempt.objects.exists())

        self.assertEqual(self.login(password="123456").status_code, 200)
        self.assertFalse(LoginAttempt.objects.exists())

    @patch("login.rate_limit.timezone.now")
    def test_identifier_is_normalized_and_stored_only_as_hash(self, now):
        now.return_value = self.start
        self.assertEqual(self.login(username=" Alice ", password="secret-value").status_code, 401)
        self.assertEqual(self.login(username="ALICE", password="another-secret").status_code, 401)

        attempt = LoginAttempt.objects.get()
        self.assertEqual(attempt.failed_count, 2)
        stored = str(LoginAttempt.objects.values().get())
        self.assertNotIn("alice", stored.lower())
        self.assertNotIn("secret-value", stored)
        self.assertNotIn("another-secret", stored)
