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
