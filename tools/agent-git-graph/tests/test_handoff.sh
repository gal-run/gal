#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
FIXTURE="${SCRIPT_DIR}/fixtures/handoff-snapshot.json"

JSON_OUTPUT="$("${REPO_ROOT}/agg" handoff --snapshot "$FIXTURE" --repo gal-run/gal-handoff-demo --json)"

jq -e '
  .schemaVersion == "agent-git-graph.handoff.v1" and
  .repository.repository == "gal-run/gal-handoff-demo" and
  .repository.status == "blocked" and
  .summary.laneCount == 4 and
  .summary.safeToHandoffCount == 1 and
  .summary.safeToCommitCount == 1 and
  .summary.blockedCount == 2 and
  (.lanes[] | select(.relativePath == "gal-run/gal-handoff-demo") | .handoff.status == "safe_to_handoff") and
  (.lanes[] | select(.relativePath == "gal-run/gal-handoff-demo/worktrees/local-clean") | .handoff.status == "safe_to_commit" and (.handoff.handoffGaps | index("no_upstream"))) and
  (.lanes[] | select(.relativePath == "gal-run/gal-handoff-demo/worktrees/dirty") | .handoff.status == "blocked" and (.handoff.blockers | index("modified")) and (.handoff.blockers | index("untracked_agentic_layers"))) and
  (.lanes[] | select(.relativePath == "gal-run/gal-handoff-demo/worktrees/detached") | .handoff.status == "blocked" and (.handoff.blockers | index("detached")))
' >/dev/null <<<"$JSON_OUTPUT"

TEXT_OUTPUT="$("${REPO_ROOT}/agg" handoff --snapshot "$FIXTURE" --repo gal-run/gal-handoff-demo)"
grep -F "Agent Git Handoff" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "repo status: blocked" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "lanes: 4 | safe to handoff: 1 | safe to commit: 1 | blocked: 2" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "checkout gal-run/gal-handoff-demo | branch=main | status=safe_to_handoff" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "worktree gal-run/gal-handoff-demo/worktrees/local-clean | branch=codex/local-clean | status=safe_to_commit" <<<"$TEXT_OUTPUT" >/dev/null
grep -F "worktree gal-run/gal-handoff-demo/worktrees/detached | branch=DETACHED | status=blocked | blockers=detached" <<<"$TEXT_OUTPUT" >/dev/null

if "${REPO_ROOT}/agg" handoff --snapshot "$FIXTURE" --repo does-not-exist >/dev/null 2>&1; then
  echo "expected unknown repo filter to fail" >&2
  exit 1
fi
