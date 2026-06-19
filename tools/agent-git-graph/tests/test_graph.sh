#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FIXTURE="${SCRIPT_DIR}/fixtures/sample-snapshot.json"

JSON_OUTPUT="$("${REPO_ROOT}/agg" graph --snapshot "$FIXTURE" --repo gal-run/gal-cli --json)"

jq -e '
  .schemaVersion == "agent-git-graph.graph.v1" and
  .repository.repository == "gal-run/gal-cli" and
  .repository.defaultBranch == "main" and
  .summary.branchCount == 1 and
  .summary.laneCount == 1 and
  .summary.worktreeCount == 1 and
  .summary.attentionCount == 1 and
  .summary.cleanCount == 0 and
  (.branches | length) == 1 and
  (.branches[] | select(.name == "codex/feature-x") | .isDefault == false and .laneCount == 1 and .attentionCount == 1 and .worktreeCount == 1) and
  (.edges | length) == 2
' >/dev/null <<<"$JSON_OUTPUT"

TEXT_OUTPUT="$("${REPO_ROOT}/agg" graph --snapshot "$FIXTURE" --repo gal-run/gal-cli)"
grep -F "Agent Git Graph" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "repo: gal-run/gal-cli" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "branches: 1 | lanes: 1 | worktrees: 1 | attention: 1" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "branch codex/feature-x [attention]" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "worktree gal-run/cli/gal-cli-rs/worktrees/feature-x | status=attention upstream=origin/codex/feature-x reasons=modified,untracked,stash,ahead,behind,untracked_agentic_layers" <<<"$TEXT_OUTPUT" >/dev/null

if "${REPO_ROOT}/agg" graph --snapshot "$FIXTURE" --repo does-not-exist >/dev/null 2>&1; then
  echo "expected unknown repo filter to fail" >&2
  exit 1
fi
