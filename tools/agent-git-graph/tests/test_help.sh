#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

HELP_OUTPUT="$("${ROOT_DIR}/agg" --help)"
grep -F "Usage:" <<<"$HELP_OUTPUT" >/dev/null
grep -F "./agg scan" <<<"$HELP_OUTPUT" >/dev/null
grep -F "./agg graph" <<<"$HELP_OUTPUT" >/dev/null
grep -F "./agg handoff" <<<"$HELP_OUTPUT" >/dev/null

SCAN_HELP="$("${ROOT_DIR}/agg" scan --help)"
grep -F "agg scan" <<<"$SCAN_HELP" >/dev/null
grep -F -- "--snapshot FILE" <<<"$SCAN_HELP" >/dev/null
grep -F -- "--repo OWNER/REPO|RELATIVE_PATH" <<<"$SCAN_HELP" >/dev/null
grep -F -- "--current" <<<"$SCAN_HELP" >/dev/null
grep -F -- "--no-cache" <<<"$SCAN_HELP" >/dev/null
grep -F -- "--cache-ttl SECONDS" <<<"$SCAN_HELP" >/dev/null

GRAPH_HELP="$("${ROOT_DIR}/agg" graph --help)"
grep -F "agg graph" <<<"$GRAPH_HELP" >/dev/null
grep -F -- "--repo OWNER/REPO" <<<"$GRAPH_HELP" >/dev/null
grep -F "./agg graph" <<<"$GRAPH_HELP" >/dev/null

HANDOFF_HELP="$("${ROOT_DIR}/agg" handoff --help)"
grep -F "agg handoff" <<<"$HANDOFF_HELP" >/dev/null
grep -F -- "--repo OWNER/REPO" <<<"$HANDOFF_HELP" >/dev/null
grep -F "./agg handoff" <<<"$HANDOFF_HELP" >/dev/null

set +e
UNKNOWN_OUTPUT="$("${ROOT_DIR}/agg" unknown 2>&1)"
UNKNOWN_STATUS=$?
set -e
test "$UNKNOWN_STATUS" -eq 2
grep -F "unknown command: unknown" <<<"$UNKNOWN_OUTPUT" >/dev/null
