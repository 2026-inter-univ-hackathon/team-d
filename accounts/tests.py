from django.test import TestCase, Client
from .models import User


class AuthTests(TestCase):
    password = "Demo-calendar!7392"

    def register(self, username="alice"):
        return self.client.post("/signup/", {"username": username, "password1": self.password, "password2": self.password})

    def test_signup_login_logout(self):
        self.assertRedirects(self.client.get("/"), "/login/?next=/")
        self.assertRedirects(self.register(), "/")
        user = User.objects.get(username="alice")
        self.assertEqual(user.email, "alice@example.com")
        self.assertNotEqual(user.password, self.password)
        self.assertTrue(user.check_password(self.password))
        self.assertContains(self.client.get("/"), "alice@example.com")
        self.assertEqual(self.client.get("/logout/").status_code, 405)
        self.assertRedirects(self.client.post("/logout/"), "/login/")
        self.assertNotIn("_auth_user_id", self.client.session)
        self.assertEqual(self.client.post("/login/", {"username": "alice", "password": "wrong"}).status_code, 200)
        self.assertNotIn("_auth_user_id", self.client.session)
        self.assertRedirects(self.client.post("/login/", {"username": "alice", "password": self.password}), "/")

    def test_reject_duplicate_domain_and_weak_password(self):
        self.register()
        self.client.logout()
        self.assertEqual(self.register().status_code, 200)
        self.assertEqual(self.register("bob@gmail.com").status_code, 200)
        self.assertEqual(self.register("bob@example.com").status_code, 200)
        self.client.post("/signup/", {"username": "bob", "password1": "123", "password2": "123"})
        self.assertEqual(User.objects.count(), 1)

    def test_csrf_required(self):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(client.post("/signup/", {}).status_code, 403)
        self.assertEqual(client.post("/login/", {}).status_code, 403)
        client.force_login(User.objects.create_user(username="alice", password=self.password))
        self.assertEqual(client.post("/logout/").status_code, 403)

    def test_complete_flow_with_csrf_and_two_browser_sessions(self):
        first = Client(enforce_csrf_checks=True)
        first.get("/signup/")
        csrf = first.cookies["csrftoken"].value
        response = first.post("/signup/", {
            "username": "sharedlogin", "password1": self.password, "password2": self.password,
            "csrfmiddlewaretoken": csrf,
        })
        self.assertEqual(response.status_code, 302)
        self.assertContains(first.get("/"), "sharedlogin@example.com")
        response = first.post("/api/events/", data='{"title":"別のブラウザからも見える予定"}',
                              content_type="application/json", HTTP_X_CSRFTOKEN=first.cookies["csrftoken"].value)
        self.assertEqual(response.status_code, 201)
        event_id = response.json()["event"]["id"]
        second = Client(enforce_csrf_checks=True)
        second.get("/login/")
        response = second.post("/login/", {
            "username": "sharedlogin", "password": self.password,
            "csrfmiddlewaretoken": second.cookies["csrftoken"].value,
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(second.get("/api/events/").json()["events"][0]["id"], event_id)
        first.post("/logout/", {"csrfmiddlewaretoken": first.cookies["csrftoken"].value})
        self.assertEqual(first.get("/api/events/").status_code, 401)
        self.assertEqual(second.get("/api/events/").status_code, 200)

    def test_common_six_character_password_is_accepted(self):
        response = self.client.post("/signup/", {
            "username": "alice", "password1": "abcdef", "password2": "abcdef",
        })
        self.assertRedirects(response, "/")
        self.assertTrue(User.objects.get(username="alice").check_password("abcdef"))
        self.client.post("/logout/")
        self.assertRedirects(self.client.post("/login/", {
            "username": "alice", "password": "abcdef",
        }), "/")

    def test_five_character_password_is_rejected(self):
        response = self.client.post("/signup/", {
            "username": "alice", "password1": "abcde", "password2": "abcde",
        })
        self.assertEqual(response.status_code, 200)
        self.assertIn("password_too_short", [error.code for error in response.context["form"].errors.as_data()["password2"]])
        self.assertFalse(User.objects.filter(username="alice").exists())

    def test_numeric_and_username_matching_passwords_are_accepted(self):
        for username, password in [("numeric", "123456"), ("alice12", "alice12")]:
            with self.subTest(username=username):
                self.client.logout()
                response = self.client.post("/signup/", {
                    "username": username, "password1": password, "password2": password,
                })
                self.assertRedirects(response, "/")
                self.assertTrue(User.objects.get(username=username).check_password(password))
                self.client.post("/logout/")
                self.assertRedirects(self.client.post("/login/", {
                    "username": username, "password": password,
                }), "/")
