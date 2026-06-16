#!/usr/bin/env bash

agg_resolve_dir() {
  local path="$1"

  (
    cd "$path" 2>/dev/null && pwd -P
  )
}

agg_infer_workspace_root() {
  local current="${1:-$PWD}"
  local marker="${AGG_WORKSPACE_MARKER:-.git-evidence-snapshot}"

  current="$(agg_resolve_dir "$current" || true)"
  if [ -z "$current" ]; then
    return 1
  fi

  while [ "$current" != "/" ]; do
    if [ -e "$current/$marker" ]; then
      printf '%s\n' "$current"
      return 0
    fi
    current="$(dirname "$current")"
  done

  return 1
}

agg_relative_to_workspace() {
  local absolute_path="$1"
  local workspace_root="$2"

  case "$absolute_path" in
    "$workspace_root")
      printf '.\n'
      ;;
    "$workspace_root"/*)
      printf '%s\n' "${absolute_path#"$workspace_root"/}"
      ;;
    *)
      return 1
      ;;
  esac
}

agg_infer_current_lane_filter() {
  local workspace_root="$1"
  local start_path="${2:-$PWD}"
  local lane_root=""

  lane_root="$(git -C "$start_path" rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -z "$lane_root" ]; then
    return 1
  fi

  agg_relative_to_workspace "$lane_root" "$workspace_root"
}

agg_infer_current_repo_filter() {
  local workspace_root="$1"
  local start_path="${2:-$PWD}"
  local lane_root=""
  local common_dir=""
  local common_dir_absolute=""
  local repo_root=""

  lane_root="$(git -C "$start_path" rev-parse --show-toplevel 2>/dev/null || true)"
  common_dir="$(git -C "$start_path" rev-parse --git-common-dir 2>/dev/null || true)"
  if [ -z "$lane_root" ] || [ -z "$common_dir" ]; then
    return 1
  fi

  common_dir_absolute="$(
    cd "$lane_root" 2>/dev/null &&
      cd "$common_dir" 2>/dev/null &&
      pwd -P
  )"
  if [ -z "$common_dir_absolute" ]; then
    return 1
  fi

  repo_root="$(dirname "$common_dir_absolute")"
  agg_relative_to_workspace "$repo_root" "$workspace_root"
}

agg_cache_root() {
  if [ -n "${XDG_CACHE_HOME:-}" ]; then
    printf '%s/agent-git-graph\n' "$XDG_CACHE_HOME"
    return 0
  fi

  if [ -n "${HOME:-}" ]; then
    printf '%s/.cache/agent-git-graph\n' "$HOME"
    return 0
  fi

  printf '%s/agent-git-graph\n' "${TMPDIR:-/tmp}"
}

agg_hash_string() {
  local value="$1"

  if command -v shasum >/dev/null 2>&1; then
    printf '%s' "$value" | shasum -a 256 | awk '{print $1}'
    return 0
  fi

  if command -v sha256sum >/dev/null 2>&1; then
    printf '%s' "$value" | sha256sum | awk '{print $1}'
    return 0
  fi

  printf '%s' "$value" | cksum | awk '{print $1}'
}

agg_cache_file_for_workspace() {
  local workspace_root="$1"
  local cache_root=""
  local workspace_hash=""

  cache_root="$(agg_cache_root)"
  workspace_hash="$(agg_hash_string "$workspace_root")"
  printf '%s/%s/snapshot.json\n' "$cache_root" "$workspace_hash"
}

agg_file_mtime() {
  local path="$1"

  if stat -f %m "$path" >/dev/null 2>&1; then
    stat -f %m "$path"
    return 0
  fi

  stat -c %Y "$path"
}
