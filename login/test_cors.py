from django.test import SimpleTestCase, override_settings


PAGES_ORIGIN = "https://sample.github.io"


@override_settings(CORS_ALLOWED_ORIGINS=[PAGES_ORIGIN])
class CorsTests(SimpleTestCase):
    def test_allowed_origin_can_read_api_response_without_cookies(self):
        response = self.client.get("/api/events/", HTTP_ORIGIN=PAGES_ORIGIN)

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], PAGES_ORIGIN)
        self.assertIn("origin", response.headers["Vary"].lower())
        self.assertNotIn("Access-Control-Allow-Credentials", response.headers)

    def test_unlisted_origin_is_not_allowed(self):
        response = self.client.get(
            "/api/events/",
            HTTP_ORIGIN="https://attacker.example",
        )

        self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_cors_is_limited_to_api_routes(self):
        response = self.client.get("/", HTTP_ORIGIN=PAGES_ORIGIN)

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_preflight_allows_authorization_header(self):
        response = self.client.options(
            "/api/events/",
            HTTP_ORIGIN=PAGES_ORIGIN,
            HTTP_ACCESS_CONTROL_REQUEST_METHOD="GET",
            HTTP_ACCESS_CONTROL_REQUEST_HEADERS="authorization",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], PAGES_ORIGIN)
        self.assertIn("GET", response.headers["Access-Control-Allow-Methods"])
        self.assertIn("authorization", response.headers["Access-Control-Allow-Headers"])
