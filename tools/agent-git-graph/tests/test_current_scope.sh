#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SCAN_FIXTURE="${SCRIPT_DIR}/fixtures/sample-snapshot.json"
HANDOFF_FIXTURE="${SCRIPT_DIR}/fixtures/handoff-snapshot.json"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/agg-current-scope.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

WORKSPACE_ROOT="${TMP_DIR}/workspace"
mkdir -p "${WORKSPACE_ROOT}/.git-evidence-snapshot"
mkdir -p "${WORKSPACE_ROOT}/gal-run/cli/gal-cli-rs"
mkdir -p "${WORKSPACE_ROOT}/gal-run/gal-handoff-demo/worktrees/dirty"

git -C "${WORKSPACE_ROOT}/gal-run/cli/gal-cli-rs" init >/dev/null 2>&1
git -C "${WORKSPACE_ROOT}/gal-run/gal-handoff-demo/worktrees/dirty" init >/dev/null 2>&1

SCAN_OUTPUT="$(
  cd "${WORKSPACE_ROOT}/gal-run/cli/gal-cli-rs" &&
    "${REPO_ROOT}/agg" scan --snapshot "$SCAN_FIXTURE" --current --json
)"
jq -e '
  .summary.repoCount == 1 and
  .summary.attentionCount == 0 and
  .source.repoFilter == "gal-run/cli/gal-cli-rs"
' >/dev/null <<<"$SCAN_OUTPUT"

GRAPH_OUTPUT="$(
  cd "${WORKSPACE_ROOT}/gal-run/cli/gal-cli-rs" &&
    "${REPO_ROOT}/agg" graph --snapshot "$SCAN_FIXTURE" --json
)"
jq -e '
  .repository.repository == "gal-run/gal-cli-rs" and
  .summary.laneCount == 1 and
  .source.repoFilter == "gal-run/cli/gal-cli-rs"
' >/dev/null <<<"$GRAPH_OUTPUT"

HANDOFF_OUTPUT="$(
  cd "${WORKSPACE_ROOT}/gal-run/gal-handoff-demo/worktrees/dirty" &&
    "${REPO_ROOT}/agg" handoff --snapshot "$HANDOFF_FIXTURE" --json
)"
jq -e '
  .repository.repository == "gal-run/gal-handoff-demo" and
  .summary.laneCount == 1 and
  .summary.blockedCount == 1 and
  .source.repoFilter == "gal-run/gal-handoff-demo/worktrees/dirty"
' >/dev/null <<<"$HANDOFF_OUTPUT"
