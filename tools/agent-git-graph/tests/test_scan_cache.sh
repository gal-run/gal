#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FIXTURE="${SCRIPT_DIR}/fixtures/sample-snapshot.json"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/agg-scan-cache.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

WORKSPACE_ROOT="${TMP_DIR}/workspace"
HOME_ROOT="${TMP_DIR}/home"
COUNTER_FILE="${WORKSPACE_ROOT}/snapshot-counter.txt"
LOG_ONE="${TMP_DIR}/scan-one.log"
LOG_TWO="${TMP_DIR}/scan-two.log"
LOG_THREE="${TMP_DIR}/scan-three.log"

mkdir -p "${WORKSPACE_ROOT}/scripts"
mkdir -p "${WORKSPACE_ROOT}/.git-evidence-snapshot"
mkdir -p "${HOME_ROOT}"
cp "$FIXTURE" "${WORKSPACE_ROOT}/snapshot.json"

cat > "${WORKSPACE_ROOT}/scripts/git-evidence-snapshot.sh" <<'SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

workspace_root="$1"
counter_file="${workspace_root}/snapshot-counter.txt"
current_count=0

if [ -f "$counter_file" ]; then
  current_count="$(cat "$counter_file")"
fi

current_count="$((current_count + 1))"
printf '%s\n' "$current_count" > "$counter_file"
cat "${workspace_root}/snapshot.json"
SCRIPT
chmod +x "${WORKSPACE_ROOT}/scripts/git-evidence-snapshot.sh"

HOME="$HOME_ROOT" "${REPO_ROOT}/agg" scan "$WORKSPACE_ROOT" --json >/dev/null 2>"$LOG_ONE"
test "$(cat "$COUNTER_FILE")" = "1"
grep -F "[agg] generating workspace snapshot" "$LOG_ONE" >/dev/null
grep -F "[agg] cached workspace snapshot" "$LOG_ONE" >/dev/null

HOME="$HOME_ROOT" "${REPO_ROOT}/agg" scan "$WORKSPACE_ROOT" --json >/dev/null 2>"$LOG_TWO"
test "$(cat "$COUNTER_FILE")" = "1"
grep -F "[agg] using cached workspace snapshot" "$LOG_TWO" >/dev/null

HOME="$HOME_ROOT" "${REPO_ROOT}/agg" scan "$WORKSPACE_ROOT" --fetch --json >/dev/null 2>"$LOG_THREE"
test "$(cat "$COUNTER_FILE")" = "2"
grep -F "[agg] generating workspace snapshot" "$LOG_THREE" >/dev/null
