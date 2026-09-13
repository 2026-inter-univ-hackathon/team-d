#!/bin/bash
set -eu
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
fi
if ! .venv/bin/python -c 'import django, dotenv' >/dev/null 2>&1; then
  echo '初回のライブラリをインストールしています…'
  .venv/bin/python -m pip install -r requirements.txt
fi
exec .venv/bin/python scripts/run_local.py
