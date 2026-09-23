import tempfile
import unittest
from pathlib import Path

from scripts.build_pages import ROOT, build, validate_firebase_config


class PagesBuildTests(unittest.TestCase):
    def test_build_contains_only_firebase_static_site_files(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            output = build(Path(directory) / "site")
            expected = {
                ".nojekyll", "index.html", "login.html", "signup.html",
                "static/app-config.js", "static/calendar-store.js", "static/legacy-export.js",
                "static/firebase-app.js", "static/firebase-config.js", "static/firebase-events.js",
                "static/login/api.js", "static/login/auth.js",
                "static/login/firebase-auth.js",
                "static/theme.js", "static/calendar.css", "static/calendar-utils.js", "static/calendar-notifications.js",
                "static/calendar-views.js", "static/calendar-dialogs.js", "static/calendar-main.js",
            }
            files = {str(path.relative_to(output)) for path in output.rglob("*") if path.is_file()}
            self.assertEqual(files, expected)
            config = (output / "static" / "app-config.js").read_text()
            self.assertNotIn("apiBaseUrl", config)
            self.assertIn("loginUrl: 'login.html'", config)

            firebase_config = (output / "static" / "firebase-config.js").read_text()
            self.assertIn("nepp-sukejuru-f8c30.firebaseapp.com", firebase_config)

            for name in ("index.html", "login.html", "signup.html"):
                html = (output / name).read_text()
                self.assertNotIn("{%", html)
                self.assertNotIn("{{", html)
            login = (output / "login.html").read_text()
            self.assertIn('href="signup.html"', login)
            self.assertIn('src="static/firebase-config.js"', login)
            self.assertIn('firebase-app-check-compat.js', login)
            self.assertIn('src="static/firebase-app.js"', login)
            self.assertIn('src="static/login/firebase-auth.js"', login)
            self.assertIn('src="static/login/api.js"', login)
            self.assertIn('data-success-url="index.html"', login)

    def test_firebase_config_requires_all_public_values(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            config = Path(directory) / "firebase-config.js"
            for missing in ("apiKey", "authDomain", "projectId", "appId"):
                values = {
                    "apiKey": "key", "authDomain": "demo.firebaseapp.com",
                    "projectId": "demo", "appId": "app",
                }
                values[missing] = ""
                config.write_text(
                    "window.FIREBASE_CONFIG = {\n"
                    + "\n".join(f"  {key}: '{value}'," for key, value in values.items())
                    + "\n};\nwindow.FIREBASE_APP_CHECK_CONFIG = { siteKey: 'site-key' };\n",
                    encoding="utf-8",
                )
                with self.subTest(missing=missing), self.assertRaisesRegex(ValueError, missing):
                    validate_firebase_config(config)

    def test_firebase_config_requires_app_check_site_key(self):
        with tempfile.TemporaryDirectory(dir=ROOT) as directory:
            config = Path(directory) / "firebase-config.js"
            config.write_text(
                "window.FIREBASE_CONFIG = {\n"
                "  apiKey: 'key', authDomain: 'demo.firebaseapp.com',\n"
                "  projectId: 'demo', appId: 'app',\n"
                "};\nwindow.FIREBASE_APP_CHECK_CONFIG = { siteKey: '' };\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "siteKey"):
                validate_firebase_config(config)

    def test_refuses_output_outside_project(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(ValueError):
                build(Path(directory) / "site")
