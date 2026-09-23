"""Build the static GitHub Pages artifact without deploying it."""

import argparse
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "dist"
FIREBASE_CONFIG_FILE = ROOT / "static" / "firebase-config.js"
REQUIRED_FIREBASE_KEYS = ("apiKey", "authDomain", "projectId", "appId")
REQUIRED_APP_CHECK_KEYS = ("siteKey",)


def validate_firebase_config(path=FIREBASE_CONFIG_FILE):
    source = Path(path).read_text(encoding="utf-8")
    values = {}
    for key in REQUIRED_FIREBASE_KEYS:
        match = re.search(rf"\b{key}\s*:\s*(['\"])(.*?)\1", source)
        if not match or not match.group(2).strip():
            raise ValueError(f"Firebase設定の {key} を入力してください。")
        values[key] = match.group(2).strip()
    for key in REQUIRED_APP_CHECK_KEYS:
        match = re.search(rf"\b{key}\s*:\s*(['\"])(.*?)\1", source)
        if not match or not match.group(2).strip():
            raise ValueError(f"Firebase App Check設定の {key} を入力してください。")
        values[key] = match.group(2).strip()
    return values


def pages_auth_html(source):
    return (
        source.replace('href="/login/"', 'href="login.html"')
        .replace('href="/signup/"', 'href="signup.html"')
        .replace('data-success-url="/"', 'data-success-url="index.html"')
        .replace('href="/static/', 'href="static/')
        .replace('src="/static/', 'src="static/')
    )


def assert_safe_output(output):
    allowed_suffixes = {".html", ".css", ".js", ""}
    forbidden_text = (
        "{%", "{{", "DJANGO_SECRET_KEY", "django-insecure-", "apiBaseUrl",
    )
    for path in output.rglob("*"):
        if path.is_dir():
            continue
        if path.suffix not in allowed_suffixes:
            raise RuntimeError(f"公開対象外のファイルです: {path.relative_to(output)}")
        if path.name == ".nojekyll":
            continue
        content = path.read_text(encoding="utf-8")
        if any(marker in content for marker in forbidden_text):
            raise RuntimeError(f"公開できない記法・設定が残っています: {path.relative_to(output)}")


def build(output=DEFAULT_OUTPUT, firebase_config=FIREBASE_CONFIG_FILE):
    validate_firebase_config(firebase_config)
    output = Path(output).resolve()
    if output == ROOT or ROOT not in output.parents:
        raise ValueError("出力先はプロジェクト配下にしてください。")
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)

    shutil.copy2(ROOT / "index.html", output / "index.html")
    shutil.copytree(ROOT / "static", output / "static")
    shutil.copytree(
        ROOT / "login" / "static" / "login",
        output / "static" / "login",
        dirs_exist_ok=True,
    )

    for name in ("login", "signup"):
        source = (ROOT / "login" / "templates" / "login" / f"{name}.html").read_text(encoding="utf-8")
        (output / f"{name}.html").write_text(pages_auth_html(source), encoding="utf-8")

    config = (
        "window.APP_CONFIG = Object.freeze({\n"
        "  loginUrl: 'login.html',\n"
        "});\n"
    )
    (output / "static" / "app-config.js").write_text(config, encoding="utf-8")
    (output / ".nojekyll").touch()
    assert_safe_output(output)
    return output


def main():
    parser = argparse.ArgumentParser(description="GitHub Pages用の静的ファイルをdistへ生成します。")
    parser.parse_args()
    output = build()
    print(f"GitHub Pages files: {output}")


if __name__ == "__main__":
    main()
