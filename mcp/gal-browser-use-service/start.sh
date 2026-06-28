#!/usr/bin/env bash
# Start the GAL Browser Use Service
set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -d .venv ]]; then
  python3 -m venv .venv
fi

source .venv/bin/activate
pip install -q -r requirements.txt

export PYTHONPATH="${PYTHONPATH:-}:$(pwd)"
# main.py reads BROWSER_USE_DB (not GAL_BROWSER_USE_DB); the LLM model and max_steps are
# per-request body fields, not env vars — so only the DB path is settable here.
export BROWSER_USE_DB="${BROWSER_USE_DB:-/tmp/gal-browser-use-cache.db}"

exec uvicorn main:app --host 127.0.0.1 --port 8123 --reload
