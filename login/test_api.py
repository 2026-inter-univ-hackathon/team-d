import json

from django.test import Client, TestCase

from .models import LoginToken, User


class LoginApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="alice", password="123456")
        cls.other = User.objects.create_user(username="bob", password="654321")

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)

    def post_login(self, data):
        return self.client.post(
            "/api/auth/login/", data=json.dumps(data), content_type="application/json",
        )

    def test_login_returns_valid_token_without_cookie_session(self):
        response = self.post_login({"username": "alice", "password": "123456"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        token = LoginToken.resolve(data["token"])
        self.assertIsNotNone(token)
        self.assertEqual(token.user_id, self.user.pk)
        self.assertEqual(data["user"], {"id": self.user.pk, "email": "alice@example.com"})
        self.assertEqual(data["token_type"], "Bearer")
        self.assertEqual(data["expires_at"], token.expires_at.isoformat())
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertNotIn("sessionid", response.cookies)
        self.assertNotIn("_auth_user_id", self.client.session)

    def test_bad_credentials_do_not_issue_token(self):
        for credentials in [
            {"username": "alice", "password": "wrong"},
            {"username": "missing", "password": "123456"},
            {"username": "alice", "password": ""},
        ]:
            with self.subTest(credentials=credentials):
                response = self.post_login(credentials)
                self.assertEqual(response.status_code, 401)
                self.assertNotIn("token", response.json())
        self.assertFalse(LoginToken.objects.exists())

    def test_inactive_user_is_rejected(self):
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.post_login({"username": "alice", "password": "123456"}).status_code, 401)
        self.assertFalse(LoginToken.objects.exists())

    def test_invalid_json_and_field_types_are_rejected(self):
        for data in [None, [], {}, {"username": "alice"},
                     {"username": 1, "password": "123456"},
                     {"username": "alice", "password": ["123456"]}]:
            with self.subTest(data=data):
                self.assertEqual(self.post_login(data).status_code, 400)
        for raw in [b'{', b'\xff']:
            with self.subTest(raw=raw):
                self.assertEqual(self.client.post(
                    "/api/auth/login/", data=raw, content_type="application/json",
                ).status_code, 400)
        self.assertFalse(LoginToken.objects.exists())

    def test_only_json_post_is_allowed(self):
        self.assertEqual(self.client.get("/api/auth/login/").status_code, 405)
        self.assertEqual(self.client.post("/api/auth/login/", {
            "username": "alice", "password": "123456",
        }).status_code, 415)
        self.assertFalse(LoginToken.objects.exists())

    def test_existing_cookie_session_is_preserved(self):
        self.client.force_login(self.other)
        session_key = self.client.session.session_key
        response = self.post_login({"username": "alice", "password": "123456"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(LoginToken.resolve(response.json()["token"]).user_id, self.user.pk)
        self.assertEqual(self.client.session["_auth_user_id"], str(self.other.pk))
        self.assertEqual(self.client.session.session_key, session_key)
        failed = self.post_login({"username": "alice", "password": "wrong"})
        self.assertEqual(failed.status_code, 401)
        self.assertEqual(self.client.session["_auth_user_id"], str(self.other.pk))
        self.assertEqual(LoginToken.objects.count(), 1)


class SignupApiTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)

    def signup(self, **changes):
        payload = {"username": "alice", "password1": "123456", "password2": "123456"}
        payload.update(changes)
        return self.client.post("/api/auth/signup/", data=json.dumps(payload), content_type="application/json")

    def test_signup_creates_user_and_valid_token(self):
        response = self.signup()
        self.assertEqual(response.status_code, 201)
        data = response.json()
        user = User.objects.get(username="alice")
        self.assertEqual(user.email, "alice@example.com")
        self.assertTrue(user.check_password("123456"))
        self.assertNotEqual(user.password, "123456")
        self.assertEqual(data["user"], {"id": user.pk, "email": user.email})
        self.assertEqual(LoginToken.resolve(data["token"]).user_id, user.pk)
        self.assertNotIn("_auth_user_id", self.client.session)
        self.assertIn("no-store", response.headers["Cache-Control"])

    def test_duplicate_does_not_create_extra_user_or_token(self):
        self.signup()
        response = self.signup()
        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.json()["fields"])
        self.assertEqual(User.objects.count(), 1)
        self.assertEqual(LoginToken.objects.count(), 1)

    def test_validation_errors_do_not_save_anything(self):
        for changes, field in [
            ({"password1": "12345", "password2": "12345"}, "password2"),
            ({"password2": "654321"}, "password2"),
            ({"username": "alice@gmail.com"}, "username"),
        ]:
            with self.subTest(changes=changes):
                response = self.signup(**changes)
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.json()["fields"])
        self.assertFalse(User.objects.exists())
        self.assertFalse(LoginToken.objects.exists())

    def test_malformed_inputs_and_methods_are_rejected(self):
        for payload in ["{", "null", "[]", "{}", '{"username":1,"password1":"123456","password2":"123456"}']:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post("/api/auth/signup/", data=payload, content_type="application/json").status_code, 400)
        self.assertEqual(self.client.post("/api/auth/signup/", {}).status_code, 415)
        self.assertEqual(self.client.get("/api/auth/signup/").status_code, 405)
        self.assertFalse(User.objects.exists())
        self.assertFalse(LoginToken.objects.exists())

    def test_issue_failure_rolls_back_user(self):
        from unittest.mock import patch
        from django.db import IntegrityError

        with patch("login.api_views.LoginToken.issue", side_effect=IntegrityError("simulated conflict")):
            self.assertEqual(self.signup().status_code, 409)
        self.assertFalse(User.objects.exists())
        self.assertFalse(LoginToken.objects.exists())

    def test_existing_session_is_not_replaced(self):
        other = User.objects.create_user(username="bob", password="654321")
        self.client.force_login(other)
        response = self.signup()
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.client.session["_auth_user_id"], str(other.pk))
        self.assertEqual(LoginToken.resolve(response.json()["token"]).user.username, "alice")


class TokenSessionApiTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = User.objects.create_user(username="alice", password="123456")
        cls.other = User.objects.create_user(username="bob", password="654321")

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.raw, self.token = LoginToken.issue(self.user)
        self.header = {"HTTP_AUTHORIZATION": f"Bearer {self.raw}"}

    def test_me_returns_only_token_owner_information(self):
        response = self.client.get("/api/auth/me/", **self.header)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"user": {"id": self.user.pk, "email": "alice@example.com"}})
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertEqual(self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"bearer {self.raw}").status_code, 200)

    def test_missing_malformed_and_unknown_tokens_are_rejected(self):
        for authorization in ["", "Bearer", "Basic abc", "Bearer short", "Bearer " + "x" * 43,
                              f"Bearer {self.raw} extra"]:
            with self.subTest(authorization=authorization):
                for method, url in [("get", "/api/auth/me/"), ("post", "/api/auth/logout/")]:
                    response = getattr(self.client, method)(url, HTTP_AUTHORIZATION=authorization)
                    self.assertEqual(response.status_code, 401)
                    self.assertIn("error", response.json())
                    self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertIsNotNone(LoginToken.resolve(self.raw))

    def test_expired_and_inactive_tokens_are_rejected(self):
        from datetime import timedelta
        from django.utils import timezone

        LoginToken.objects.filter(pk=self.token.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        self.assertEqual(self.client.get("/api/auth/me/", **self.header).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/logout/", **self.header).status_code, 401)
        raw, _ = LoginToken.issue(self.user)
        self.user.is_active = False
        self.user.save()
        self.assertEqual(self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {raw}").status_code, 401)
        self.assertEqual(self.client.post("/api/auth/logout/", HTTP_AUTHORIZATION=f"Bearer {raw}").status_code, 401)

    def test_logout_revokes_only_supplied_token(self):
        second_raw, _ = LoginToken.issue(self.user)
        other_raw, _ = LoginToken.issue(self.other)
        response = self.client.post("/api/auth/logout/", **self.header)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"message": "ログアウトしました。"})
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertIsNone(LoginToken.resolve(self.raw))
        self.assertEqual(self.client.get("/api/auth/me/", **self.header).status_code, 401)
        self.assertEqual(self.client.post("/api/auth/logout/", **self.header).status_code, 401)
        for raw in [second_raw, other_raw]:
            self.assertEqual(self.client.get("/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {raw}").status_code, 200)

    def test_cookie_session_is_not_a_substitute_and_is_preserved(self):
        self.client.force_login(self.other)
        session_key = self.client.session.session_key
        self.assertEqual(self.client.get("/api/auth/me/").status_code, 401)
        self.assertEqual(self.client.post("/api/auth/logout/").status_code, 401)
        response = self.client.get("/api/auth/me/", **self.header)
        self.assertEqual(response.json()["user"]["id"], self.user.pk)
        self.assertEqual(self.client.post("/api/auth/logout/", **self.header).status_code, 200)
        self.assertEqual(self.client.session.session_key, session_key)
        self.assertEqual(self.client.session["_auth_user_id"], str(self.other.pk))
        self.assertContains(self.client.get("/"), 'id="current-user"')
        self.assertNotContains(self.client.get("/"), "bob@example.com")

    def test_method_restrictions_do_not_revoke_token(self):
        self.client.get("/")
        self.client.get("/login/")
        csrf = self.client.cookies["csrftoken"].value
        self.assertEqual(self.client.post("/api/auth/me/", HTTP_X_CSRFTOKEN=csrf, **self.header).status_code, 405)
        self.assertEqual(self.client.get("/api/auth/logout/", **self.header).status_code, 405)
        self.assertIsNotNone(LoginToken.resolve(self.raw))

    def test_login_to_logout_complete_flow(self):
        response = self.client.post("/api/auth/login/", data=json.dumps({
            "username": "alice", "password": "123456",
        }), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        header = {"HTTP_AUTHORIZATION": f'Bearer {response.json()["token"]}'}
        self.assertEqual(self.client.get("/api/auth/me/", **header).status_code, 200)
        self.assertEqual(self.client.post("/api/auth/logout/", **header).status_code, 200)
        self.assertEqual(self.client.get("/api/auth/me/", **header).status_code, 401)
