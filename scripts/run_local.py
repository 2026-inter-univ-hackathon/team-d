"""Start the local app, open its URL, and keep the terminal attached."""
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent.parent
os.chdir(ROOT)
if not (ROOT / ".env").exists():
    with (ROOT / ".env").open("x") as env:
        env.write(f"DJANGO_DEBUG=1\nDJANGO_SECRET_KEY={secrets.token_urlsafe(48)}\nDJANGO_ALLOWED_HOSTS=localhost,127.0.0.1\n")
    (ROOT / ".env").chmod(0o600)
subprocess.run([sys.executable, "manage.py", "migrate"], check=True)
server = subprocess.Popen([sys.executable, "manage.py", "runserver", "127.0.0.1:8000", "--noreload"])
url = "http://127.0.0.1:8000/"
print(f"助じゅ～る: {url}\n終了するには、このターミナルで Ctrl+C を押してください。", flush=True)
try:
    for _ in range(40):
        time.sleep(0.25)
        if server.poll() is not None:
            raise SystemExit(server.returncode)
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                ready = response.status == 200
        except (urllib.error.URLError, TimeoutError):
            continue
        if ready:
            webbrowser.open(url)
            break
    server.wait()
except KeyboardInterrupt:
    pass
finally:
    if server.poll() is None:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait()
