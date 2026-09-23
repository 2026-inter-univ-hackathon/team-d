"""Build and serve the Firebase static app for local development."""

import argparse
import functools
import http.server
import threading
import webbrowser

from build_pages import build


def main():
    parser = argparse.ArgumentParser(description="助じゅ～るをローカルで起動します。")
    parser.add_argument("--port", type=int, default=8080)
    args = parser.parse_args()

    output = build()
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=output)
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    except OSError as error:
        raise SystemExit(
            f"ポート{args.port}を使用できません。"
            f"別の番号を指定してください: python scripts/run_local.py --port 8090\n{error}"
        ) from error

    url = f"http://127.0.0.1:{args.port}/login.html"
    print(f"助じゅ～る: {url}")
    print("終了するには Ctrl+C を押してください。")
    threading.Timer(0.2, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
