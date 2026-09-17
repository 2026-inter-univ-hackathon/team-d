import json
from django.test import Client, TestCase
from login.models import LoginToken, User
from .models import Event


class EventTests(TestCase):
    def setUp(self):
        self.alice = User.objects.create_user(username="alice", password="Calendar!7392")
        self.bob = User.objects.create_user(username="bob", password="Calendar!8392")
        self.event = Event.objects.create(user=self.alice, title="Aliceの予定")
        self.url = f"/api/events/{self.event.id}/"
        self.raw, _ = LoginToken.issue(self.alice)
        self.header = {"HTTP_AUTHORIZATION": f"Bearer {self.raw}"}

    def send(self, method, url, data):
        return getattr(self.client, method)(
            url, data=json.dumps(data), content_type="application/json", **self.header
        )

    def test_crud_and_persistence(self):
        response = self.send("post", "/api/events/", {"title": "打合せ"})
        self.assertEqual(response.status_code, 201)
        event = response.json()["event"]
        url = f'/api/events/{event["id"]}/'
        response = self.send("patch", url, {"version": 1, "date": "2026-09-14", "time": "23:00", "duration": 3, "status": "CONFIRMED", "memo": "メモ"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["event"]["duration"], 1)
        saved = self.client.get(url, **self.header).json()["event"]
        self.assertEqual(saved["memo"], "メモ")
        self.assertEqual(saved["status"], "CONFIRMED")
        response = self.send("patch", url, {"version": 2, "date": None})
        self.assertIsNone(response.json()["event"]["time"])
        self.assertEqual(self.send("delete", url, {"version": 3}).status_code, 200)
        self.assertEqual(self.client.get(url, **self.header).status_code, 404)

    def test_other_user_cannot_access_or_mutate(self):
        raw, _ = LoginToken.issue(self.bob)
        self.header = {"HTTP_AUTHORIZATION": f"Bearer {raw}"}
        self.assertEqual(self.client.get("/api/events/", **self.header).json()["events"], [])
        self.assertEqual(self.client.get(self.url, **self.header).status_code, 404)
        self.assertEqual(self.send("patch", self.url, {"title": "改変", "version": 1}).status_code, 404)
        self.assertEqual(self.send("delete", self.url, {"version": 1}).status_code, 404)
        self.event.refresh_from_db()
        self.assertEqual(self.event.title, "Aliceの予定")

    def test_unauthenticated_and_logout(self):
        self.header = {}
        self.assertEqual(self.client.get("/api/events/").status_code, 401)
        self.assertEqual(self.send("post", "/api/events/", {"title": "失敗"}).status_code, 401)
        self.assertEqual(self.send("patch", self.url, {"version": 1}).status_code, 401)
        self.assertEqual(self.send("delete", self.url, {"version": 1}).status_code, 401)

    def test_invalid_payload_and_owner_injection(self):
        for payload in [{"title": ""}, {"title": "x" * 201}, {"title": "a", "user": self.bob.pk},
                        {"title": "a", "duration": True}, {"title": "a", "duration": 0},
                        {"title": "a", "status": "INVALID"}, {"title": "a", "date": "2026-02-30"},
                        {"title": "a", "time": "12:30"}, {"title": "a", "date": 42}]:
            with self.subTest(payload=payload):
                self.assertEqual(self.send("post", "/api/events/", payload).status_code, 400)
        self.assertEqual(Event.objects.count(), 1)
        self.assertEqual(self.client.post(
            "/api/events/", data="{", content_type="application/json", **self.header
        ).status_code, 400)
        self.assertEqual(self.send("post", "/api/events/", []).status_code, 400)

    def test_stale_update_and_delete_rejected(self):
        self.assertEqual(self.send("patch", self.url, {"version": 1, "title": "更新"}).status_code, 200)
        self.assertEqual(self.send("patch", self.url, {"version": 1, "title": "古い"}).status_code, 409)
        self.assertEqual(self.send("delete", self.url, {"version": 1}).status_code, 409)
        self.event.refresh_from_db()
        self.assertEqual(self.event.title, "更新")

    def test_cookie_session_cannot_replace_token(self):
        client = Client(enforce_csrf_checks=True)
        client.force_login(self.alice)
        client.get("/")
        self.assertEqual(client.get("/api/events/").status_code, 401)
        self.assertEqual(client.post(
            "/api/events/", data='{"title":"予定"}', content_type="application/json"
        ).status_code, 401)

    def test_import_preserves_fields_and_is_idempotent_per_user(self):
        record = {"id": "ev_old", "title": "以前の予定", "createdAt": 1700000000000,
                  "status": "COMPLETED", "date": "2026-09-14", "time": "12:00", "duration": 2, "memo": "メモ"}
        response = self.send("post", "/api/events/import/", {"events": [record]})
        self.assertEqual(response.json(), {"imported": 1, "skipped": 0})
        saved = Event.objects.get(user=self.alice, legacy_id="ev_old").as_dict()
        self.assertEqual(saved["createdAt"], 1700000000000)
        self.assertEqual(saved["status"], "COMPLETED")
        self.assertEqual(saved["duration"], 2)
        self.assertEqual(self.send("post", "/api/events/import/", {"events": [record]}).json(), {"imported": 0, "skipped": 1})
        raw, _ = LoginToken.issue(self.bob)
        self.header = {"HTTP_AUTHORIZATION": f"Bearer {raw}"}
        self.assertEqual(self.send("post", "/api/events/import/", {"events": [record]}).json()["imported"], 1)

    def test_import_rolls_back_entire_file_on_invalid_record(self):
        records = [{"id": "good", "title": "正常"}, {"id": "bad", "title": "不正", "duration": 0}]
        self.assertEqual(self.send("post", "/api/events/import/", {"events": records}).status_code, 400)
        self.assertFalse(Event.objects.filter(legacy_id="good").exists())
        self.assertEqual(self.send("post", "/api/events/import/", {"events": [{"id": "injected", "title": "a", "user": self.bob.pk}]}).status_code, 400)
