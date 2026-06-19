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
  agg graph [WORKSPACE] [--repo OWNER/REPO|RELATIVE_PATH] [--snapshot FILE] [--fetch] [--json]

Examples:
  ./agg graph
  ./agg graph /path/to/workspace --repo acme/example
  ./agg graph --snapshot snapshot.json --repo acme/example --json
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
    echo "agg graph requires --repo or a current workspace checkout" >&2
    exit 2
  fi

  REPO_FILTER="$(agg_infer_current_repo_filter "$WORKSPACE" "$PWD" || true)"
  if [ -z "$REPO_FILTER" ]; then
    echo "agg graph requires --repo or a current git checkout inside the workspace" >&2
    exit 2
  fi
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for agg graph" >&2
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

GRAPH_TMP="$(mktemp "${TMPDIR:-/tmp}/agg-graph-report.XXXXXX")"
trap 'rm -f "$GRAPH_TMP"' EXIT

"${REPO_ROOT}/agg" "${SCAN_ARGS[@]}" | jq \
  --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg repoFilter "$REPO_FILTER" \
  '
  def default_branch:
    (
      [.repositories[].branch.default | select(. != null and . != "")]
      | group_by(.)
      | sort_by(-length, .[0])
      | .[0][0]
    );
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
  def lane_row:
    {
      repository,
      relativePath,
      path,
      kind,
      checkoutType: (if .worktree.isWorktree then "worktree" else "primary" end),
      branch,
      dirt,
      evidence,
      agenticLayers,
      cleanliness
    };
  def branch_rows($defaultBranch):
    [
      .repositories[]
      | lane_row as $lane
      | {
          name: (.branch.current // "DETACHED"),
          isDefault: (.branch.current == $defaultBranch),
          lane: $lane
        }
    ]
    | group_by(.name)
    | map({
        name: .[0].name,
        isDefault: .[0].isDefault,
        laneCount: length,
        worktreeCount: (map(select(.lane.checkoutType == "worktree")) | length),
        attentionCount: (map(select(.lane.cleanliness.clean != true)) | length),
        upstreams: ([.[].lane.branch.upstream | select(. != null and . != "")] | unique),
        reasons: ([.[].lane.cleanliness.reasons[]] | unique),
        lanes: (map(.lane) | sort_by(.relativePath))
      })
    | sort_by((if .isDefault then 0 else 1 end), .name);
  def edges($repoIdentity; $branches):
    [
      ($branches[] | {
        from: $repoIdentity,
        to: ("branch:" + .name),
        kind: (if .isDefault then "default_branch" else "branch" end)
      }),
      ($branches[] | .lanes[] | {
        from: ("branch:" + (.branch.current // "DETACHED")),
        to: ("lane:" + .relativePath),
        kind: (if .checkoutType == "worktree" then "worktree_lane" else "primary_lane" end)
      })
    ];

  if (.summary.repoCount == 0) then
    error("repo not found in scan model")
  else
    (default_branch) as $defaultBranch
    | (repo_identity) as $repoIdentity
    | (branch_rows($defaultBranch)) as $branches
    | {
        schemaVersion: "agent-git-graph.graph.v1",
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
          defaultBranch: $defaultBranch,
          laneCount: (.repositories | length),
          primaryCheckoutCount: ([.repositories[] | select(.worktree.isWorktree != true)] | length),
          worktreeCount: ([.repositories[] | select(.worktree.isWorktree == true)] | length)
        },
        summary: {
          branchCount: ($branches | length),
          laneCount: (.repositories | length),
          worktreeCount: ([.repositories[] | select(.worktree.isWorktree == true)] | length),
          attentionCount: ([.repositories[] | select(.cleanliness.clean != true)] | length),
          cleanCount: ([.repositories[] | select(.cleanliness.clean == true)] | length),
          primaryCheckoutCount: ([.repositories[] | select(.worktree.isWorktree != true)] | length)
        },
        branches: $branches,
        lanes: (.repositories | sort_by(.relativePath)),
        edges: edges($repoIdentity; $branches)
      }
  end
  ' > "$GRAPH_TMP"

if $JSON_OUTPUT; then
  cat "$GRAPH_TMP"
  exit 0
fi

jq -r '
  def branch_label:
    if .isDefault then
      "\(.name) [default]"
    elif .attentionCount > 0 then
      "\(.name) [attention]"
    else
      .name
    end;
  def lane_label:
    if .checkoutType == "worktree" then
      "worktree \(.relativePath)"
    else
      "checkout \(.relativePath)"
    end;
  def lane_meta:
    "status=\(.cleanliness.status) upstream=\(.branch.upstream // "none")";
  def lane_reason_text:
    if (.cleanliness.reasons | length) == 0 then
      ""
    else
      " reasons=\(.cleanliness.reasons | join(","))"
    end;

  "Agent Git Graph",
  "repo: \(.repository.repository)",
  "workspace: \(.source.workspace)",
  "snapshot: \(.source.snapshotGeneratedAt) | filter=\(.source.repoFilter)",
  "",
  "Summary:",
  "  branches: \(.summary.branchCount) | lanes: \(.summary.laneCount) | worktrees: \(.summary.worktreeCount) | attention: \(.summary.attentionCount)",
  "  primary checkouts: \(.summary.primaryCheckoutCount) | clean lanes: \(.summary.cleanCount) | default branch: \(.repository.defaultBranch // "unknown")",
  "",
  "Topology:",
  "repo \(.repository.repository)",
  (
    .branches[]
    | "  - branch \(branch_label)",
      (.lanes[] | "    - \(lane_label) | \(lane_meta)\(lane_reason_text)")
  )
' "$GRAPH_TMP"
