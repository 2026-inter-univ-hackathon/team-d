import tempfile
from pathlib import Path

from django.test import SimpleTestCase

from scripts.build_pages import ROOT, build, validate_api_base_url


class PagesBuildTests(SimpleTestCase):
    def test_build_contains_only_static_site_files_and_public_api_config(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            output = build("https://api.example.com", Path(directory) / "site")
            expected = {
                ".nojekyll", "index.html", "login.html", "signup.html",
                "static/app-config.js", "static/calendar-store.js", "static/legacy-export.js",
                "static/login/api.js", "static/login/auth.js", "static/login/auth.css",
            }
            files = {str(path.relative_to(output)) for path in output.rglob("*") if path.is_file()}
            self.assertEqual(files, expected)
            config = (output / "static" / "app-config.js").read_text()
            self.assertIn('apiBaseUrl: "https://api.example.com"', config)
            self.assertIn("loginUrl: 'login.html'", config)

            for name in ("index.html", "login.html", "signup.html"):
                html = (output / name).read_text()
                self.assertNotIn("{%", html)
                self.assertNotIn("{{", html)
            login = (output / "login.html").read_text()
            self.assertIn('href="signup.html"', login)
            self.assertIn('src="static/login/api.js"', login)
            self.assertIn('data-success-url="index.html"', login)

    def test_api_origin_validation(self):
        for value in (
            "https://api.example.com/path", "https://user@example.com", "https://api.example.com?x=1",
            "http://api.example.com", "javascript:alert(1)", "//api.example.com", "",
        ):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    validate_api_base_url(value)
        self.assertEqual(validate_api_base_url("https://api.example.com/"), "https://api.example.com")
        self.assertEqual(validate_api_base_url("http://127.0.0.1:8000"), "http://127.0.0.1:8000")

    def test_refuses_output_outside_project(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                build("https://api.example.com", Path(directory) / "site")
