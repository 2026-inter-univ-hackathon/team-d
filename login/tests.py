import json

from django.test import TestCase, Client
from .models import User


class AuthPageTests(TestCase):
    password = "Demo-calendar!7392"

    def test_calendar_and_auth_pages_are_public_static_shells(self):
        calendar = self.client.get("/")
        self.assertEqual(calendar.status_code, 200)
        self.assertContains(calendar, 'id="current-user"')
        self.assertContains(calendar, 'src="static/app-config.js"')

        for url, mode in [("/login/", "login"), ("/signup/", "signup")]:
            with self.subTest(url=url):
                response = self.client.get(url)
                self.assertEqual(response.status_code, 200)
                self.assertContains(response, 'id="auth-form"')
                self.assertContains(response, f'data-mode="{mode}"')
                self.assertContains(response, 'firebase-auth-compat.js')
                self.assertContains(response, 'login/firebase-auth.js')
                self.assertContains(response, 'firebase-events.js')
                self.assertContains(response, 'login/api.js')
                self.assertContains(response, 'login/auth.js')
                self.assertNotContains(response, "{%")
                self.assertNotContains(response, "{{")

    def test_auth_pages_are_get_only_and_server_logout_route_is_removed(self):
        self.assertEqual(self.client.post("/login/").status_code, 405)
        self.assertEqual(self.client.post("/signup/").status_code, 405)
        self.assertEqual(self.client.get("/logout/").status_code, 404)

    def test_complete_flow_with_two_token_sessions(self):
        first = Client(enforce_csrf_checks=True)
        response = first.post("/api/auth/signup/", data=json.dumps({
            "username": "sharedlogin", "password1": self.password, "password2": self.password,
        }), content_type="application/json")
        self.assertEqual(response.status_code, 201)
        first_header = {"HTTP_AUTHORIZATION": f'Bearer {response.json()["token"]}'}
        response = first.post(
            "/api/events/", data='{"title":"別のブラウザからも見える予定"}',
            content_type="application/json", **first_header,
        )
        self.assertEqual(response.status_code, 201)
        event_id = response.json()["event"]["id"]

        second = Client(enforce_csrf_checks=True)
        response = second.post("/api/auth/login/", data=json.dumps({
            "username": "sharedlogin", "password": self.password,
        }), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        second_header = {"HTTP_AUTHORIZATION": f'Bearer {response.json()["token"]}'}
        self.assertEqual(second.get("/api/events/", **second_header).json()["events"][0]["id"], event_id)

        first.post("/api/auth/logout/", **first_header)
        self.assertEqual(first.get("/api/events/", **first_header).status_code, 401)
        self.assertEqual(second.get("/api/events/", **second_header).status_code, 200)

class LoginTokenTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="tokenuser", password="123456")

    def test_issue_resolves_owner_and_stores_only_hash(self):
        from datetime import timedelta
        from django.utils import timezone
        from .models import LoginToken

        before = timezone.now()
        raw, token = LoginToken.issue(self.user)
        after = timezone.now()
        self.assertEqual(LoginToken.resolve(raw).user_id, self.user.pk)
        self.assertEqual(len(raw), 43)
        stored = LoginToken.objects.values().get(pk=token.pk)
        self.assertNotIn(raw, stored.values())
        self.assertEqual(len(stored["token_hash"]), 64)
        self.assertGreaterEqual(token.expires_at, before + timedelta(hours=8))
        self.assertLessEqual(token.expires_at, after + timedelta(hours=8))

    def test_expired_token_and_exact_expiry_are_rejected(self):
        from datetime import timedelta
        from unittest.mock import patch
        from django.utils import timezone
        from .models import LoginToken

        raw, token = LoginToken.issue(self.user)
        now = timezone.now()
        for expiry in [now, now - timedelta(seconds=1)]:
            with self.subTest(expiry=expiry):
                LoginToken.objects.filter(pk=token.pk).update(expires_at=expiry)
                with patch("login.models.timezone.now", return_value=now):
                    self.assertIsNone(LoginToken.resolve(raw))

    def test_unknown_and_malformed_tokens_are_rejected(self):
        from .models import LoginToken

        for raw in [None, 123, b"a" * 43, "", "short", "x" * 43, "x" * 44]:
            with self.subTest(raw=raw):
                self.assertIsNone(LoginToken.resolve(raw))

    def test_revoke_does_not_affect_other_session(self):
        from .models import LoginToken

        first_raw, first = LoginToken.issue(self.user)
        second_raw, second = LoginToken.issue(self.user)
        self.assertNotEqual(first_raw, second_raw)
        first.revoke()
        self.assertIsNone(LoginToken.resolve(first_raw))
        self.assertEqual(LoginToken.resolve(second_raw).pk, second.pk)

    def test_deactivated_user_cannot_issue_or_use_token(self):
        from .models import LoginToken

        raw, _ = LoginToken.issue(self.user)
        self.user.is_active = False
        self.user.save()
        self.assertIsNone(LoginToken.resolve(raw))
        with self.assertRaises(ValueError):
            LoginToken.issue(self.user)
        self.assertEqual(LoginToken.objects.count(), 1)

    def test_deleting_user_removes_tokens(self):
        from .models import LoginToken

        raw, _ = LoginToken.issue(self.user)
        self.user.delete()
        self.assertIsNone(LoginToken.resolve(raw))
        self.assertEqual(LoginToken.objects.count(), 0)
