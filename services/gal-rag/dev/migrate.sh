#!/usr/bin/env bash
# Run the gal-rag Postgres migrations against $DATABASE_URL
# (or the local docker compose Postgres at localhost:5432).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DSN="${DATABASE_URL:-postgres://gal:gal@localhost:5432/gal_rag?sslmode=disable}"

echo "Applying migrations to: $DSN"
for f in "$ROOT"/migrations/*.sql; do
  echo "  - $(basename "$f")"
  psql "$DSN" -v ON_ERROR_STOP=1 -f "$f"
done
echo "done."
