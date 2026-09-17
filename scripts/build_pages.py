"""Build the static GitHub Pages artifact without deploying it."""

import argparse
import json
import shutil
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = ROOT / "dist"


def validate_api_base_url(value):
    parsed = urlsplit(value)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.netloc
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise ValueError("API URLには http(s) のオリジンだけを指定してください。")
    if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1"}:
        raise ValueError("公開APIにはHTTPSが必要です。")
    return value.rstrip("/")


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
    forbidden_text = ("{%", "{{", "DJANGO_SECRET_KEY", "django-insecure-")
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


def build(api_base_url, output=DEFAULT_OUTPUT):
    api_base_url = validate_api_base_url(api_base_url)
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
        f"  apiBaseUrl: {json.dumps(api_base_url)},\n"
        "  loginUrl: 'login.html',\n"
        "});\n"
    )
    (output / "static" / "app-config.js").write_text(config, encoding="utf-8")
    (output / ".nojekyll").touch()
    assert_safe_output(output)
    return output


def main():
    parser = argparse.ArgumentParser(description="GitHub Pages用の静的ファイルをdistへ生成します。")
    parser.add_argument("--api-base-url", required=True, help="公開するDjango APIのHTTPSオリジン")
    args = parser.parse_args()
    output = build(args.api_base_url)
    print(f"GitHub Pages files: {output}")


if __name__ == "__main__":
    main()
