#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FIXTURE="${SCRIPT_DIR}/fixtures/mixed-signal-snapshot.json"

JSON_OUTPUT="$("${REPO_ROOT}/agg" scan --snapshot "$FIXTURE" --json)"

jq -e '
  .schemaVersion == "agent-git-graph.scan.v1" and
  .summary.repoCount == 5 and
  .summary.cleanCount == 1 and
  .summary.attentionCount == 4 and
  .summary.firstPartyAttentionCount == 3 and
  .summary.thirdPartyAttentionCount == 1 and
  .summary.firstPartyCheckoutAttentionCount == 1 and
  .summary.activeWorktreeAttentionCount == 1 and
  .summary.worktreeIntegrationAttentionCount == 1 and
  (.firstPartyAttention | length) == 3 and
  (.checkoutAttention | length) == 1 and
  (.activeWorktreeAttention | length) == 1 and
  (.worktreeIntegrationAttention | length) == 1 and
  (.externalAttention | length) == 1 and
  (.activeWorktreeAttention[0].classification.worktreeAttentionClass == "active_edit_lane") and
  (.worktreeIntegrationAttention[0].classification.worktreeAttentionClass == "integration_lane") and
  (.externalAttention[0].classification.ownership == "third_party_fork")
' >/dev/null <<<"$JSON_OUTPUT"

TEXT_OUTPUT="$("${REPO_ROOT}/agg" scan --snapshot "$FIXTURE" 2>/dev/null)"
grep -F "first-party attention: 3 | checkouts: 1 | active worktrees: 1 | integration worktrees: 1 | forks: 1" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "Primary checkout attention:" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "Active worktree lanes:" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "Worktree integration lanes:" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "Third-party fork attention:" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "example/upstream-tool | branch=main | reasons=ahead,behind | path=.forks/example/upstream-tool" <<<"$TEXT_OUTPUT" >/dev/null
