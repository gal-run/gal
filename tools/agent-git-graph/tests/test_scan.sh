#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FIXTURE="${SCRIPT_DIR}/fixtures/sample-snapshot.json"

JSON_OUTPUT="$("${REPO_ROOT}/agg" scan --snapshot "$FIXTURE" --json)"

jq -e '
  .schemaVersion == "agent-git-graph.scan.v1" and
  .summary.repoCount == 3 and
  .summary.cleanCount == 1 and
  .summary.attentionCount == 2 and
  .summary.dirtyCount == 1 and
  .summary.syncGapCount == 1 and
  .summary.noUpstreamCount == 1 and
  .summary.detachedCount == 1 and
  .summary.worktreeCount == 1 and
  .summary.evidenceCount == 1 and
  .summary.agenticLayerWarningCount == 1
' >/dev/null <<<"$JSON_OUTPUT"

FILTERED_OUTPUT="$("${REPO_ROOT}/agg" scan --snapshot "$FIXTURE" --repo gal-run/gal-cli --json)"
jq -e '.summary.repoCount == 1 and .summary.attentionCount == 1' >/dev/null <<<"$FILTERED_OUTPUT"

WORKTREE_ONLY="$("${REPO_ROOT}/agg" scan --snapshot "$FIXTURE" --repo gal-run/cli/gal-cli-rs/worktrees/feature-x --json)"
jq -e '.summary.repoCount == 1 and .repositories[0].worktree.isWorktree == true' >/dev/null <<<"$WORKTREE_ONLY"

TEXT_OUTPUT="$("${REPO_ROOT}/agg" scan --snapshot "$FIXTURE")"
grep -F "Agent Git Graph Scan" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "repos: 3 | clean: 1 | attention: 2 | worktrees: 1" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "gal-run/gal-cli | branch=codex/feature-x | reasons=modified,untracked,stash,ahead,behind,untracked_agentic_layers" <<<"$TEXT_OUTPUT" >/dev/null

if "${REPO_ROOT}/agg" scan --snapshot "$FIXTURE" --repo does-not-exist >/dev/null 2>&1; then
  echo "expected unknown repo filter to fail" >&2
  exit 1
fi
