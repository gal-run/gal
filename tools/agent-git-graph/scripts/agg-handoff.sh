#!/usr/bin/env bash
set -euo pipefail

WORKSPACE=""
SNAPSHOT_FILE=""
REPO_FILTER=""
JSON_OUTPUT=false
FETCH_REMOTES=false

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=scripts/agg-common.sh
. "${SCRIPT_DIR}/agg-common.sh"

usage() {
  cat <<'USAGE'
Usage:
  agg handoff [WORKSPACE] [--repo OWNER/REPO|RELATIVE_PATH] [--snapshot FILE] [--fetch] [--json]

Examples:
  ./agg handoff
  ./agg handoff /path/to/workspace --repo acme/example
  ./agg handoff --snapshot snapshot.json --repo acme/example --json
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --snapshot)
      SNAPSHOT_FILE="${2:-}"
      if [ -z "$SNAPSHOT_FILE" ]; then
        echo "--snapshot requires a file path" >&2
        exit 2
      fi
      shift 2
      ;;
    --repo)
      REPO_FILTER="${2:-}"
      if [ -z "$REPO_FILTER" ]; then
        echo "--repo requires an OWNER/REPO slug or repo root relative path" >&2
        exit 2
      fi
      shift 2
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    --fetch)
      FETCH_REMOTES=true
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --*)
      echo "unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [ -n "$WORKSPACE" ]; then
        echo "unexpected extra argument: $1" >&2
        usage >&2
        exit 2
      fi
      WORKSPACE="$1"
      shift
      ;;
  esac
done

if [ -z "$REPO_FILTER" ]; then
  if [ -z "$WORKSPACE" ]; then
    WORKSPACE="$(agg_infer_workspace_root "$PWD" || agg_infer_workspace_root "$REPO_ROOT" || true)"
  fi

  if [ -z "$WORKSPACE" ]; then
    echo "agg handoff requires --repo or a current workspace checkout" >&2
    exit 2
  fi

  REPO_FILTER="$(agg_infer_current_lane_filter "$WORKSPACE" "$PWD" || true)"
  if [ -z "$REPO_FILTER" ]; then
    echo "agg handoff requires --repo or a current git checkout inside the workspace" >&2
    exit 2
  fi
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for agg handoff" >&2
  exit 2
fi

SCAN_ARGS=(scan)
if [ -n "$WORKSPACE" ]; then
  SCAN_ARGS+=("$WORKSPACE")
fi
if [ -n "$SNAPSHOT_FILE" ]; then
  SCAN_ARGS+=(--snapshot "$SNAPSHOT_FILE")
fi
if $FETCH_REMOTES; then
  SCAN_ARGS+=(--fetch)
fi
SCAN_ARGS+=(--repo "$REPO_FILTER" --json)

HANDOFF_TMP="$(mktemp "${TMPDIR:-/tmp}/agg-handoff-report.XXXXXX")"
trap 'rm -f "$HANDOFF_TMP"' EXIT

"${REPO_ROOT}/agg" "${SCAN_ARGS[@]}" | jq \
  --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg repoFilter "$REPO_FILTER" \
  '
  def repo_identity:
    (
      [.repositories[].repository]
      | unique
      | .[0]
    );
  def owner_identity:
    (
      [.repositories[].owner]
      | unique
      | .[0]
    );
  def lane_status:
    if (.branch.detached == true) or
       (.dirt.modified == true) or
       ((.dirt.untrackedCount // 0) > 0) or
       ((.dirt.stashCount // 0) > 0) or
       ((.dirt.submoduleDriftCount // 0) > 0) or
       ((.agenticLayers.untrackedCount // 0) > 0)
    then
      "blocked"
    elif (.branch.hasUpstream != true) or ((.branch.ahead // 0) > 0) or ((.branch.behind // 0) > 0)
    then
      "safe_to_commit"
    else
      "safe_to_handoff"
    end;
  def blockers:
    [
      if .branch.detached == true then "detached" else empty end,
      if .dirt.modified == true then "modified" else empty end,
      if ((.dirt.untrackedCount // 0) > 0) then "untracked" else empty end,
      if ((.dirt.stashCount // 0) > 0) then "stash" else empty end,
      if ((.dirt.submoduleDriftCount // 0) > 0) then "submodule_drift" else empty end,
      if ((.agenticLayers.untrackedCount // 0) > 0) then "untracked_agentic_layers" else empty end
    ];
  def handoff_gaps:
    [
      if (.branch.hasUpstream != true) then "no_upstream" else empty end,
      if ((.branch.ahead // 0) > 0) then "ahead" else empty end,
      if ((.branch.behind // 0) > 0) then "behind" else empty end
    ];
  def recommendations:
    (
      [
        if .branch.detached == true then "attach the checkout to a branch before handoff" else empty end,
        if .dirt.modified == true or (.dirt.untrackedCount // 0) > 0 then "commit, stash, or move filesystem changes before handoff" else empty end,
        if (.dirt.stashCount // 0) > 0 then "review or clear repo-local stashes before handoff" else empty end,
        if (.dirt.submoduleDriftCount // 0) > 0 then "reconcile submodule drift before handoff" else empty end,
        if (.agenticLayers.untrackedCount // 0) > 0 then "track or remove local-only agentic-layer files before handoff" else empty end,
        if .branch.hasUpstream != true then "push with upstream tracking before handoff" else empty end,
        if ((.branch.ahead // 0) > 0) then "push local commits before handoff" else empty end,
        if ((.branch.behind // 0) > 0) then "pull or rebase onto upstream before handoff" else empty end
      ] | unique
    );
  def lane_row:
    . + {
      handoff: {
        status: lane_status,
        blockers: blockers,
        handoffGaps: handoff_gaps,
        recommendations: recommendations
      }
    };
  def repo_status($lanes):
    if ([$lanes[] | select(.handoff.status == "blocked")] | length) > 0 then
      "blocked"
    elif ([$lanes[] | select(.handoff.status == "safe_to_commit")] | length) > 0 then
      "safe_to_commit"
    else
      "safe_to_handoff"
    end;
  def repo_recommendations($lanes):
    [$lanes[] | .handoff.recommendations[]] | unique;

  if (.summary.repoCount == 0) then
    error("repo not found in scan model")
  else
    (.repositories | map(lane_row) | sort_by(.relativePath)) as $lanes
    | {
        schemaVersion: "agent-git-graph.handoff.v1",
        generatedAt: $generatedAt,
        source: {
          workspace: .source.workspace,
          snapshotFile: .source.snapshotFile,
          snapshotGeneratedAt: .source.snapshotGeneratedAt,
          fetchRemotes: .source.fetchRemotes,
          repoFilter: $repoFilter
        },
        repository: {
          repository: repo_identity,
          owner: owner_identity,
          status: repo_status($lanes)
        },
        summary: {
          laneCount: ($lanes | length),
          safeToHandoffCount: ([$lanes[] | select(.handoff.status == "safe_to_handoff")] | length),
          safeToCommitCount: ([$lanes[] | select(.handoff.status == "safe_to_commit")] | length),
          blockedCount: ([$lanes[] | select(.handoff.status == "blocked")] | length)
        },
        recommendations: repo_recommendations($lanes),
        lanes: $lanes
      }
  end
  ' > "$HANDOFF_TMP"

if $JSON_OUTPUT; then
  cat "$HANDOFF_TMP"
  exit 0
fi

jq -r '
  def lane_label:
    if .worktree.isWorktree then
      "worktree \(.relativePath)"
    else
      "checkout \(.relativePath)"
    end;
  def blocker_text:
    if (.handoff.blockers | length) == 0 then
      "none"
    else
      (.handoff.blockers | join(","))
    end;
  def gap_text:
    if (.handoff.handoffGaps | length) == 0 then
      "none"
    else
      (.handoff.handoffGaps | join(","))
    end;
  def recommendation_text:
    if (.handoff.recommendations | length) == 0 then
      "none"
    else
      (.handoff.recommendations | join(" | "))
    end;

  "Agent Git Handoff",
  "repo: \(.repository.repository)",
  "workspace: \(.source.workspace)",
  "snapshot: \(.source.snapshotGeneratedAt) | filter=\(.source.repoFilter)",
  "",
  "Summary:",
  "  repo status: \(.repository.status)",
  "  lanes: \(.summary.laneCount) | safe to handoff: \(.summary.safeToHandoffCount) | safe to commit: \(.summary.safeToCommitCount) | blocked: \(.summary.blockedCount)",
  "",
  "Lanes:",
  (
    .lanes[]
    | "  - \(lane_label) | branch=\(.branch.current // "DETACHED") | status=\(.handoff.status) | blockers=\(blocker_text) | handoff-gaps=\(gap_text)",
      "    next: \(recommendation_text)"
  ),
  "",
  "Repo next steps:",
  (
    if (.recommendations | length) == 0 then
      "  - none"
    else
      (.recommendations[] | "  - " + .)
    end
  )
' "$HANDOFF_TMP"
