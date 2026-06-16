---
name: agent-git-cleanliness
description: Use when the user asks whether a repo or workspace is clean, wants a git graph or cleanliness check for CLI agent sessions, needs worktree-aware handoff or cleanup guidance, or wants to find branch, stash, detached, or ahead-behind drift without relying on an IDE.
---

# Agent Git Cleanliness

Use this skill when the job is to inspect or explain repository cleanliness in
terminal-first agent workflows.

## Default workflow

1. Resolve scope first.
   - If the user names one repo, stay repo-scoped.
   - If the user asks about the full workspace, keep the first pass read-only.
2. Prefer the `agent-git-graph` CLI when available.
   - In this repository, run `./agg scan`, `./agg graph`, or `./agg handoff`.
   - Use `--repo OWNER/REPO` or a worktree relative path to narrow scope.
   - Use `./agg scan --current` for the repo you are standing in.
   - `./agg graph` now infers the current repo when `--repo` is omitted.
   - `./agg handoff` now defaults to the current checkout lane when `--repo` is omitted.
   - Use `--json` when you need machine-readable output for follow-on steps.
3. If no snapshot file is provided, let `agg` generate one with the configured
   snapshot script (`--snapshot-script` / `AGG_SNAPSHOT_SCRIPT`, default
   `scripts/git-evidence-snapshot.sh`).
   - Repeat scans automatically reuse a short-lived cached snapshot unless `--fetch` or `--no-cache` is set.
4. Read the report in this order:
   - primary checkout attention
   - active worktree lanes
   - worktree integration lanes
   - third-party fork attention
   - worktrees
   - dirty counts
   - sync gaps
   - no-upstream or detached lanes
5. Recommend cleanup conservatively.
   - preserve active worktrees
   - prefer moving work into a dedicated worktree over editing a live checkout
   - do not reset or delete user state without explicit approval

## Commands

Repo or workspace scan:

```bash
./agg scan /path/to/workspace
./agg scan --current
./agg scan --repo acme/example
./agg scan --repo acme/example/worktrees/fix-lane
```

Snapshot-driven scan:

```bash
./agg scan --snapshot /tmp/git-evidence-snapshot.json
./agg scan --snapshot /tmp/git-evidence-snapshot.json --json
./agg graph --snapshot /tmp/git-evidence-snapshot.json --repo acme/example
./agg handoff --snapshot /tmp/git-evidence-snapshot.json --repo acme/example
```

Repo topology view:

```bash
./agg graph
./agg graph --repo acme/example
./agg graph --repo acme/example --json
./agg handoff
./agg handoff --repo acme/example
./agg handoff --repo acme/example --json
```

## Interpretation rules

- `modified`, `untracked`, `stash`, or `submodule_drift` means the lane is not
  commit-clean.
- `ahead` or `behind` means the lane is not handoff-clean until the remote
  relationship is understood.
- `no_upstream` means the branch is not fully integrated into the remote graph.
- `detached` means the checkout is operationally risky unless it is deliberate.
- Worktree rows should be treated as first-class lanes, not hidden residue.
- `graph` is the better surface when the user wants to understand one repo's
  lane topology rather than the whole workspace summary.
- `handoff` is the better surface when the user wants a go/no-go answer for one
  repo lane and the next conservative action to take.

## Escalation

- If the user wants enforcement, point them to the `agent-git-graph` repo for
  CLI/report evolution and to whatever snapshot/policy producer feeds the
  `git-evidence-snapshot.v1` input.
- If the user wants a richer UX, keep the same `agg scan` data model and extend
  into repo graph, handoff, or closure surfaces rather than inventing a second
  source of truth.
