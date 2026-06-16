#!/usr/bin/env bash
set -euo pipefail

WORKSPACE=""
SNAPSHOT_FILE=""
SNAPSHOT_SCRIPT_OVERRIDE="${AGG_SNAPSHOT_SCRIPT:-}"
REPO_FILTER=""
CURRENT_SCOPE=false
JSON_OUTPUT=false
FETCH_REMOTES=false
USE_CACHE=true
CACHE_TTL_SECONDS="${AGG_CACHE_TTL_SECONDS:-120}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
# shellcheck source=scripts/agg-common.sh
. "${SCRIPT_DIR}/agg-common.sh"

usage() {
  cat <<'USAGE'
Usage:
  agg scan [WORKSPACE] [--snapshot FILE] [--repo OWNER/REPO|RELATIVE_PATH] [--current] [--fetch] [--no-cache] [--cache-ttl SECONDS] [--json]

Examples:
  ./agg scan /path/to/workspace
  ./agg scan --snapshot snapshot.json
  ./agg scan --repo acme/example
  ./agg scan --current
  ./agg scan --repo acme/example/worktrees/fix-lane --json
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
    --snapshot-script)
      SNAPSHOT_SCRIPT_OVERRIDE="${2:-}"
      if [ -z "$SNAPSHOT_SCRIPT_OVERRIDE" ]; then
        echo "--snapshot-script requires a file path" >&2
        exit 2
      fi
      shift 2
      ;;
    --repo)
      REPO_FILTER="${2:-}"
      if [ -z "$REPO_FILTER" ]; then
        echo "--repo requires a repository slug or relative path" >&2
        exit 2
      fi
      shift 2
      ;;
    --current)
      CURRENT_SCOPE=true
      shift
      ;;
    --json)
      JSON_OUTPUT=true
      shift
      ;;
    --fetch)
      FETCH_REMOTES=true
      shift
      ;;
    --no-cache)
      USE_CACHE=false
      shift
      ;;
    --cache-ttl)
      CACHE_TTL_SECONDS="${2:-}"
      if [ -z "$CACHE_TTL_SECONDS" ]; then
        echo "--cache-ttl requires a number of seconds" >&2
        exit 2
      fi
      shift 2
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

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required for agg scan" >&2
  exit 2
fi

case "$CACHE_TTL_SECONDS" in
  ''|*[!0-9]*)
    echo "--cache-ttl must be a non-negative integer" >&2
    exit 2
    ;;
esac

SNAPSHOT_TMP=""
REPORT_TMP="$(mktemp "${TMPDIR:-/tmp}/agg-scan-report.XXXXXX")"
trap 'rm -f "$SNAPSHOT_TMP" "$REPORT_TMP"' EXIT

SCAN_STARTED_AT="$(date +%s)"

if [ -z "$WORKSPACE" ]; then
  WORKSPACE="$(agg_infer_workspace_root "$PWD" || agg_infer_workspace_root "$REPO_ROOT" || true)"
fi

if [ -z "$SNAPSHOT_FILE" ]; then
  if [ -z "$WORKSPACE" ]; then
    echo "workspace path not provided and could not be inferred" >&2
    exit 2
  fi

  if [ ! -d "$WORKSPACE" ]; then
    echo "workspace not found: $WORKSPACE" >&2
    exit 2
  fi

  SNAPSHOT_SCRIPT_CANDIDATE="${SNAPSHOT_SCRIPT_OVERRIDE:-scripts/git-evidence-snapshot.sh}"
  case "$SNAPSHOT_SCRIPT_CANDIDATE" in
    /*) SNAPSHOT_SCRIPT="$SNAPSHOT_SCRIPT_CANDIDATE" ;;
    *) SNAPSHOT_SCRIPT="$WORKSPACE/$SNAPSHOT_SCRIPT_CANDIDATE" ;;
  esac
  if [ ! -x "$SNAPSHOT_SCRIPT" ]; then
    echo "git-evidence snapshot script not found: $SNAPSHOT_SCRIPT (set AGG_SNAPSHOT_SCRIPT or pass --snapshot-script, or provide --snapshot FILE)" >&2
    exit 2
  fi

  CACHE_FILE=""
  if $USE_CACHE && ! $FETCH_REMOTES; then
    CACHE_FILE="$(agg_cache_file_for_workspace "$WORKSPACE")"
    if [ -f "$CACHE_FILE" ]; then
      CACHE_AGE_SECONDS="$((SCAN_STARTED_AT - $(agg_file_mtime "$CACHE_FILE")))"
      if [ "$CACHE_AGE_SECONDS" -le "$CACHE_TTL_SECONDS" ]; then
        SNAPSHOT_FILE="$CACHE_FILE"
        echo "[agg] using cached workspace snapshot ${CACHE_FILE} (age ${CACHE_AGE_SECONDS}s)" >&2
      fi
    fi
  fi

  if [ -z "$SNAPSHOT_FILE" ]; then
    SNAPSHOT_TMP="$(mktemp "${TMPDIR:-/tmp}/agg-scan-snapshot.XXXXXX")"
    SNAPSHOT_STARTED_AT="$(date +%s)"
    echo "[agg] generating workspace snapshot for ${WORKSPACE}" >&2
    if $FETCH_REMOTES; then
      "$SNAPSHOT_SCRIPT" "$WORKSPACE" --fetch > "$SNAPSHOT_TMP"
    else
      "$SNAPSHOT_SCRIPT" "$WORKSPACE" > "$SNAPSHOT_TMP"
    fi
    SNAPSHOT_FINISHED_AT="$(date +%s)"
    echo "[agg] snapshot ready in $((SNAPSHOT_FINISHED_AT - SNAPSHOT_STARTED_AT))s" >&2

    if [ -n "$CACHE_FILE" ]; then
      mkdir -p "$(dirname "$CACHE_FILE")"
      cp "$SNAPSHOT_TMP" "$CACHE_FILE"
      SNAPSHOT_FILE="$CACHE_FILE"
      echo "[agg] cached workspace snapshot at ${CACHE_FILE}" >&2
    else
      SNAPSHOT_FILE="$SNAPSHOT_TMP"
    fi
  fi
fi

if [ ! -e "$SNAPSHOT_FILE" ]; then
  echo "snapshot not found: $SNAPSHOT_FILE" >&2
  exit 2
fi

if $CURRENT_SCOPE && [ -z "$REPO_FILTER" ]; then
  if [ -z "$WORKSPACE" ]; then
    echo "workspace path not provided and could not be inferred for --current" >&2
    exit 2
  fi

  REPO_FILTER="$(agg_infer_current_repo_filter "$WORKSPACE" "$PWD" || true)"
  if [ -z "$REPO_FILTER" ]; then
    echo "could not infer the current repository lane for --current" >&2
    exit 2
  fi
fi

if ! jq -e '.schemaVersion == "git-evidence-snapshot.v1" and (.repos | type == "array")' "$SNAPSHOT_FILE" >/dev/null 2>&1; then
  echo "invalid git-evidence snapshot: $SNAPSHOT_FILE" >&2
  exit 2
fi

echo "[agg] building scan model" >&2

jq \
  --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg snapshotFile "$SNAPSHOT_FILE" \
  --arg repoFilter "$REPO_FILTER" \
  '
  def repo_id:
    if .github.slug != null then .github.slug else .relativePath end;
  def repo_owner:
    if .github.owner != null then .github.owner else (.relativePath | split("/")[0]) end;
  def is_dirty:
    (.dirt.modified == true) or
    ((.dirt.untrackedCount // 0) > 0) or
    ((.dirt.stashCount // 0) > 0) or
    ((.dirt.submoduleDriftCount // 0) > 0);
  def has_sync_gap:
    ((.branch.ahead // 0) > 0) or ((.branch.behind // 0) > 0);
  def is_detached:
    (.branch.current == null or .branch.current == "");
  def has_edit_dirt:
    (.dirt.modified == true) or
    ((.dirt.untrackedCount // 0) > 0) or
    ((.dirt.stashCount // 0) > 0) or
    ((.dirt.submoduleDriftCount // 0) > 0) or
    ((.agenticLayers.untrackedCount // 0) > 0);
  def has_evidence:
    (.evidence.entireCheckpoint != null) or
    (((.evidence.entireCheckpointRefs // []) | length) > 0) or
    (.evidence.entireCheckpointRemote != null) or
    (.evidence.galSession != null) or
    (.evidence.galAgentLayer != null) or
    (.evidence.galEvidence != null);
  def reasons:
    [
      if .dirt.modified == true then "modified" else empty end,
      if ((.dirt.untrackedCount // 0) > 0) then "untracked" else empty end,
      if ((.dirt.stashCount // 0) > 0) then "stash" else empty end,
      if ((.dirt.submoduleDriftCount // 0) > 0) then "submodule_drift" else empty end,
      if ((.branch.ahead // 0) > 0) then "ahead" else empty end,
      if ((.branch.behind // 0) > 0) then "behind" else empty end,
      if (.branch.hasUpstream != true) then "no_upstream" else empty end,
      if is_detached then "detached" else empty end,
      if ((.agenticLayers.untrackedCount // 0) > 0) then "untracked_agentic_layers" else empty end
    ];
  def attention_score:
    ((if .dirt.modified == true then 40 else 0 end) +
     ((.dirt.untrackedCount // 0) * 5) +
     ((.dirt.stashCount // 0) * 8) +
     ((.dirt.submoduleDriftCount // 0) * 10) +
     ((.branch.ahead // 0) * 2) +
     ((.branch.behind // 0) * 2) +
     (if .branch.hasUpstream != true then 12 else 0 end) +
     (if is_detached then 20 else 0 end) +
     ((.agenticLayers.untrackedCount // 0) * 6));
  def repo_row:
    {
      repository: repo_id,
      owner: repo_owner,
      relativePath,
      path,
      kind,
      branch: {
        current: .branch.current,
        default: .branch.default,
        upstream: .branch.upstream,
        hasUpstream: (.branch.hasUpstream == true),
        ahead: (.branch.ahead // 0),
        behind: (.branch.behind // 0),
        detached: is_detached
      },
      worktree: {
        isWorktree: (.worktree.isWorktree == true)
      },
      dirt: {
        modified: (.dirt.modified == true),
        untrackedCount: (.dirt.untrackedCount // 0),
        stashCount: (.dirt.stashCount // 0),
        submoduleDriftCount: (.dirt.submoduleDriftCount // 0)
      },
      evidence: {
        hasEvidence: has_evidence,
        entireCheckpointRefs: ((.evidence.entireCheckpointRefs // []) | length),
        checkpointRemoteConfigured: (.evidence.entireCheckpointRemote != null),
        galSession: (.evidence.galSession != null),
        galAgentLayer: (.evidence.galAgentLayer != null),
        galEvidence: (.evidence.galEvidence != null)
      },
      agenticLayers: {
        count: (.agenticLayers.count // 0),
        trackedCount: (.agenticLayers.trackedCount // 0),
        untrackedCount: (.agenticLayers.untrackedCount // 0)
      },
      classification: {
        ownership: (if .kind == "third_party_fork" then "third_party_fork" else "first_party" end),
        laneType: (if .worktree.isWorktree == true then "worktree" else "primary_checkout" end),
        attentionScope: (
          if (reasons | length) == 0 then
            "clean"
          elif .kind == "third_party_fork" then
            "third_party_fork"
          elif .worktree.isWorktree == true then
            "first_party_worktree"
          else
            "first_party_checkout"
          end
        ),
        worktreeAttentionClass: (
          if .worktree.isWorktree != true or (reasons | length) == 0 then
            null
          elif has_edit_dirt then
            "active_edit_lane"
          else
            "integration_lane"
          end
        )
      },
      cleanliness: {
        status: (if (reasons | length) == 0 then "clean" else "attention" end),
        clean: ((reasons | length) == 0),
        reasons: reasons,
        attentionScore: attention_score
      }
    };
  def selected_repos:
    .repos
    | if $repoFilter == "" then
        .
      else
        map(select(
          .github.slug == $repoFilter or
          .relativePath == $repoFilter or
          .github.name == $repoFilter
        ))
      end
    | map(repo_row);

  {
    schemaVersion: "agent-git-graph.scan.v1",
    generatedAt: $generatedAt,
    source: {
      workspace: .workspace,
      snapshotFile: $snapshotFile,
      snapshotGeneratedAt: .generatedAt,
      fetchRemotes: .fetchRemotes,
      repoFilter: (if $repoFilter == "" then null else $repoFilter end)
    },
    summary: {
      repoCount: (selected_repos | length),
      cleanCount: (selected_repos | map(select(.cleanliness.clean == true)) | length),
      attentionCount: (selected_repos | map(select(.cleanliness.clean != true)) | length),
      firstPartyAttentionCount: (selected_repos | map(select(.cleanliness.clean != true and .classification.ownership == "first_party")) | length),
      thirdPartyAttentionCount: (selected_repos | map(select(.cleanliness.clean != true and .classification.ownership == "third_party_fork")) | length),
      firstPartyCheckoutAttentionCount: (selected_repos | map(select(.cleanliness.clean != true and .classification.attentionScope == "first_party_checkout")) | length),
      activeWorktreeAttentionCount: (selected_repos | map(select(.classification.worktreeAttentionClass == "active_edit_lane")) | length),
      worktreeIntegrationAttentionCount: (selected_repos | map(select(.classification.worktreeAttentionClass == "integration_lane")) | length),
      dirtyCount: (selected_repos | map(select(.dirt.modified or .dirt.untrackedCount > 0 or .dirt.stashCount > 0 or .dirt.submoduleDriftCount > 0)) | length),
      syncGapCount: (selected_repos | map(select(.branch.ahead > 0 or .branch.behind > 0)) | length),
      noUpstreamCount: (selected_repos | map(select(.branch.hasUpstream != true)) | length),
      detachedCount: (selected_repos | map(select(.branch.detached == true)) | length),
      worktreeCount: (selected_repos | map(select(.worktree.isWorktree == true)) | length),
      evidenceCount: (selected_repos | map(select(.evidence.hasEvidence == true)) | length),
      agenticLayerWarningCount: (selected_repos | map(select(.agenticLayers.untrackedCount > 0)) | length)
    },
    owners: (
      selected_repos
      | group_by(.owner)
      | map({
          owner: .[0].owner,
          repoCount: length,
          attentionCount: (map(select(.cleanliness.clean != true)) | length)
        })
      | sort_by(-.repoCount, .owner)
    ),
    attention: (
      selected_repos
      | map(select(.cleanliness.clean != true))
      | sort_by(-.cleanliness.attentionScore, .repository, .relativePath)
    ),
    firstPartyAttention: (
      selected_repos
      | map(select(.cleanliness.clean != true and .classification.ownership == "first_party"))
      | sort_by(-.cleanliness.attentionScore, .repository, .relativePath)
    ),
    checkoutAttention: (
      selected_repos
      | map(select(.cleanliness.clean != true and .classification.attentionScope == "first_party_checkout"))
      | sort_by(-.cleanliness.attentionScore, .repository, .relativePath)
    ),
    activeWorktreeAttention: (
      selected_repos
      | map(select(.classification.worktreeAttentionClass == "active_edit_lane"))
      | sort_by(-.cleanliness.attentionScore, .repository, .relativePath)
    ),
    worktreeIntegrationAttention: (
      selected_repos
      | map(select(.classification.worktreeAttentionClass == "integration_lane"))
      | sort_by(-.cleanliness.attentionScore, .repository, .relativePath)
    ),
    externalAttention: (
      selected_repos
      | map(select(.cleanliness.clean != true and .classification.ownership == "third_party_fork"))
      | sort_by(-.cleanliness.attentionScore, .repository, .relativePath)
    ),
    worktrees: (
      selected_repos
      | map(select(.worktree.isWorktree == true))
      | sort_by(.repository, .relativePath)
    ),
    repositories: (
      selected_repos
      | sort_by(.repository, .relativePath)
    )
  }
  ' "$SNAPSHOT_FILE" > "$REPORT_TMP"

if [ -n "$REPO_FILTER" ] && [ "$(jq -r '.summary.repoCount' "$REPORT_TMP")" = "0" ]; then
  echo "repo not found in snapshot: $REPO_FILTER" >&2
  exit 1
fi

REPORT_REPO_COUNT="$(jq -r '.summary.repoCount' "$REPORT_TMP")"
REPORT_ATTENTION_COUNT="$(jq -r '.summary.attentionCount' "$REPORT_TMP")"
REPORT_FIRST_PARTY_ATTENTION="$(jq -r '.summary.firstPartyAttentionCount' "$REPORT_TMP")"
REPORT_FORK_ATTENTION="$(jq -r '.summary.thirdPartyAttentionCount' "$REPORT_TMP")"
SCAN_FINISHED_AT="$(date +%s)"
echo "[agg] scan ready in $((SCAN_FINISHED_AT - SCAN_STARTED_AT))s: repos=${REPORT_REPO_COUNT} attention=${REPORT_ATTENTION_COUNT} primary=${REPORT_FIRST_PARTY_ATTENTION} forks=${REPORT_FORK_ATTENTION}" >&2

if $JSON_OUTPUT; then
  cat "$REPORT_TMP"
  exit 0
fi

jq -r '
  def reasons_text:
    if (.cleanliness.reasons | length) == 0 then "clean" else (.cleanliness.reasons | join(",")) end;

  "Agent Git Graph Scan",
  "workspace: \(.source.workspace)",
  "snapshot: \(.source.snapshotGeneratedAt) | filter=\(.source.repoFilter // "all") | fetchRemotes=\(.source.fetchRemotes)",
  "",
  "Summary:",
  "  repos: \(.summary.repoCount) | clean: \(.summary.cleanCount) | attention: \(.summary.attentionCount) | worktrees: \(.summary.worktreeCount)",
  "  first-party attention: \(.summary.firstPartyAttentionCount) | checkouts: \(.summary.firstPartyCheckoutAttentionCount) | active worktrees: \(.summary.activeWorktreeAttentionCount) | integration worktrees: \(.summary.worktreeIntegrationAttentionCount) | forks: \(.summary.thirdPartyAttentionCount)",
  "  dirty: \(.summary.dirtyCount) | sync gaps: \(.summary.syncGapCount) | no upstream: \(.summary.noUpstreamCount) | detached: \(.summary.detachedCount)",
  "  evidence rows: \(.summary.evidenceCount) | agentic layer warnings: \(.summary.agenticLayerWarningCount)",
  "",
  "Primary checkout attention:",
  (
    if (.checkoutAttention | length) == 0 then
      "  none"
    else
      (.checkoutAttention[:15][] | "  - \(.repository) | branch=\(.branch.current // "DETACHED") | reasons=\(reasons_text) | path=\(.relativePath)")
    end
  ),
  "",
  "Active worktree lanes:",
  (
    if (.activeWorktreeAttention | length) == 0 then
      "  none"
    else
      (.activeWorktreeAttention[:15][] | "  - \(.repository) | branch=\(.branch.current // "DETACHED") | reasons=\(reasons_text) | path=\(.relativePath)")
    end
  ),
  "",
  "Worktree integration lanes:",
  (
    if (.worktreeIntegrationAttention | length) == 0 then
      "  none"
    else
      (.worktreeIntegrationAttention[:15][] | "  - \(.repository) | branch=\(.branch.current // "DETACHED") | reasons=\(reasons_text) | path=\(.relativePath)")
    end
  ),
  "",
  "Third-party fork attention:",
  (
    if (.externalAttention | length) == 0 then
      "  none"
    else
      (.externalAttention[:15][] | "  - \(.repository) | branch=\(.branch.current // "DETACHED") | reasons=\(reasons_text) | path=\(.relativePath)")
    end
  ),
  "",
  "Worktrees:",
  (
    if (.worktrees | length) == 0 then
      "  none"
    else
      (.worktrees[:15][] | "  - \(.repository) | branch=\(.branch.current // "DETACHED") | status=\(.cleanliness.status) | path=\(.relativePath)")
    end
  ),
  "",
  "Owners:",
  (
    if (.owners | length) == 0 then
      "  none"
    else
      (.owners[:12][] | "  - \(.owner): repos=\(.repoCount) attention=\(.attentionCount)")
    end
  )
' "$REPORT_TMP"
