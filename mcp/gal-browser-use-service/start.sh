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
export GAL_BROWSER_USE_DB="${GAL_BROWSER_USE_DB:-/tmp/gal-browser-use-cache.db}"
export GAL_BROWSER_USE_LLM="${GAL_BROWSER_USE_LLM:-gpt-4o}"
export GAL_BROWSER_USE_MAX_STEPS="${GAL_BROWSER_USE_MAX_STEPS:-50}"

exec uvicorn main:app --host 127.0.0.1 --port 8123 --reload
