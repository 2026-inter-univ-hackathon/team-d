import json
from datetime import timedelta

from django.test import Client, TestCase
from django.utils import timezone

from login.models import LoginToken, User
from .models import Event


class TokenEventTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.alice = User.objects.create_user(username="alice", password="123456")
        cls.bob = User.objects.create_user(username="bob", password="654321")
        cls.event = Event.objects.create(user=cls.alice, title="Aliceの予定")

    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.raw, self.token = LoginToken.issue(self.alice)
        self.header = {"HTTP_AUTHORIZATION": f"Bearer {self.raw}"}
        self.url = f"/api/events/{self.event.pk}/"

    def send(self, method, url, data, **headers):
        return getattr(self.client, method)(url, data=json.dumps(data), content_type="application/json", **headers)

    def test_token_crud_and_import_without_cookie_or_csrf(self):
        response = self.client.get("/api/events/", **self.header)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["events"][0]["id"], str(self.event.pk))
        self.assertIn("no-store", response.headers["Cache-Control"])
        response = self.send("post", "/api/events/", {"title": "新しい予定"}, **self.header)
        self.assertEqual(response.status_code, 201)
        event_id = response.json()["event"]["id"]
        self.assertEqual(Event.objects.get(pk=event_id).user_id, self.alice.pk)
        url = f"/api/events/{event_id}/"
        self.assertEqual(self.send("patch", url, {"version": 1, "memo": "更新"}, **self.header).status_code, 200)
        self.assertEqual(self.client.get(url, **self.header).json()["event"]["memo"], "更新")
        self.assertEqual(self.send("delete", url, {"version": 2}, **self.header).status_code, 200)
        self.assertEqual(self.client.get(url, **self.header).status_code, 404)
        response = self.send("post", "/api/events/import/", {"events": [{"id": "old1", "title": "以前の予定"}]}, **self.header)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["imported"], 1)
        self.assertEqual(Event.objects.get(legacy_id="old1").user_id, self.alice.pk)
        self.assertNotIn("sessionid", self.client.cookies)

    def test_other_users_events_are_inaccessible(self):
        raw, _ = LoginToken.issue(self.bob)
        header = {"HTTP_AUTHORIZATION": f"Bearer {raw}"}
        self.assertEqual(self.client.get("/api/events/", **header).json()["events"], [])
        self.assertEqual(self.client.get(self.url, **header).status_code, 404)
        self.assertEqual(self.send("patch", self.url, {"version": 1, "title": "改変"}, **header).status_code, 404)
        self.assertEqual(self.send("delete", self.url, {"version": 1}, **header).status_code, 404)
        self.event.refresh_from_db()
        self.assertEqual(self.event.title, "Aliceの予定")

    def test_invalid_tokens_never_fall_back_to_cookie(self):
        self.client.force_login(self.alice)
        expired_raw, expired = LoginToken.issue(self.alice)
        LoginToken.objects.filter(pk=expired.pk).update(expires_at=timezone.now() - timedelta(seconds=1))
        revoked_raw, _ = LoginToken.issue(self.alice)
        self.client.post("/api/auth/logout/", HTTP_AUTHORIZATION=f"Bearer {revoked_raw}")
        for authorization in ["", "Bearer", "Basic invalid", "Bearer invalid", f"Bearer {expired_raw}", f"Bearer {revoked_raw}"]:
            with self.subTest(authorization=authorization):
                headers = {"HTTP_AUTHORIZATION": authorization}
                self.assertEqual(self.client.get("/api/events/", **headers).status_code, 401)
                self.assertEqual(self.client.get(self.url, **headers).status_code, 401)
                for method, url, data in [
                    ("post", "/api/events/", {"title": "拒否"}),
                    ("patch", self.url, {"version": 1, "title": "拒否"}),
                    ("delete", self.url, {"version": 1}),
                    ("post", "/api/events/import/", {"events": [{"id": "bad", "title": "拒否"}]}),
                ]:
                    self.assertEqual(self.send(method, url, data, **headers).status_code, 401)
        self.assertEqual(Event.objects.count(), 1)

    def test_token_identity_takes_priority_without_changing_cookie(self):
        self.client.force_login(self.bob)
        session_key = self.client.session.session_key
        self.assertEqual(self.client.get("/api/events/", **self.header).json()["events"][0]["id"], str(self.event.pk))
        response = self.send("post", "/api/events/", {"title": "Aliceの追加"}, **self.header)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(Event.objects.get(pk=response.json()["event"]["id"]).user_id, self.alice.pk)
        self.assertEqual(self.client.session.session_key, session_key)
        self.assertEqual(self.client.session["_auth_user_id"], str(self.bob.pk))
        self.assertEqual(self.client.get("/api/events/").status_code, 401)

    def test_cookie_auth_is_rejected_for_every_endpoint(self):
        self.client.force_login(self.alice)
        operations = [
            ("post", "/api/events/", {"title": "追加"}),
            ("patch", self.url, {"version": 1, "memo": "変更"}),
            ("post", "/api/events/import/", {"events": [{"id": "cookie-old", "title": "取り込み"}]}),
            ("delete", self.url, {"version": 1}),
        ]
        self.assertEqual(self.client.get("/api/events/").status_code, 401)
        self.assertEqual(self.client.get(self.url).status_code, 401)
        for method, url, data in operations:
            with self.subTest(method=method, url=url):
                self.assertEqual(self.send(method, url, data).status_code, 401)
