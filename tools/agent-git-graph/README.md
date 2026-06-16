# agent-git-graph

Agent-aware Git graph and cleanliness control plane for CLI coding sessions.

## Why this exists

IDE Git graph extensions help a human inspect branch history, but they do not
solve the operational mess introduced by long-lived CLI agent sessions:

- branches and worktrees drift away from the developer's mental model
- dirty state hides inside agent-owned worktrees or detached lanes
- stashes, ahead/behind drift, and orphaned branches become easy to miss
- a developer cannot quickly answer "is this repo clean enough to hand off,
  merge, or close?"

This repository exists to build the developer-facing answer to that problem.

## Inspiration

The product idea for `agent-git-graph` was generated from
[`mhutchie/vscode-git-graph`](https://github.com/mhutchie/vscode-git-graph):
it proved that a graph-first Git surface can become part of a developer's
everyday workflow instead of a niche debugging tool.

That inspiration is product and UX lineage, not an implementation directive.
`agent-git-graph` keeps its own Go engine, data model, and CLI-first behavior
because the target problem is different: agent-owned worktrees, closure
readiness, handoff safety, and workspace-level cleanliness. The upstream repo's
license should be treated conservatively, so this project uses it as a feature
and interaction reference rather than a code-copying baseline.

## Product position

`agent-git-graph` is not a generic Git visualizer. It is an agent-aware graph
and closure surface that combines Git topology with the state that matters in
terminal-first agent workflows:

- repository ownership and workspace path
- branch and worktree topology
- dirty, staged, untracked, stash, and detached state
- ahead, behind, and diverged remote state
- issue and pull request linkage
- agent/session/checkpoint evidence
- closure blockers for commit, handoff, merge, and cleanup

## Boundary

- An external **git-evidence snapshot** producer remains the source of truth
  for raw workspace audits, evidence snapshots, and closure checks. `agg`
  consumes that snapshot; it does not gather raw evidence itself.
- `agent-git-graph` owns the operator and developer experience on top of that
  data: CLI UX, graph rendering, focused repo views, and session cleanliness
  workflows.
- Product repositories should stay clean. Raw session transcripts and large
  evidence blobs do not belong in ordinary product history.

The snapshot input contract is intentionally generic. `agg` accepts any JSON
document matching the `git-evidence-snapshot.v1` schema (see
[`docs/architecture.md`](docs/architecture.md) and the fixtures under
`tests/fixtures/`). Provide it directly with `--snapshot FILE`, or let `agg`
generate one by pointing it at a snapshot script via `--snapshot-script`,
the `AGG_SNAPSHOT_SCRIPT` environment variable, or the default
`scripts/git-evidence-snapshot.sh` under the detected workspace root.

## Configuration

- `--snapshot FILE` — read a pre-built `git-evidence-snapshot.v1` document.
- `--snapshot-script PATH` / `AGG_SNAPSHOT_SCRIPT` — executable that prints a
  snapshot to stdout when no `--snapshot` is given (absolute, or relative to
  the workspace root; defaults to `scripts/git-evidence-snapshot.sh`).
- `AGG_WORKSPACE_MARKER` — directory/file name used to auto-detect the
  workspace root by walking up from the current directory (default
  `.git-evidence-snapshot`).
- `AGG_CACHE_TTL_SECONDS` — how long a generated snapshot is cached.

## MVP

1. Read a `git-evidence-snapshot.v1` document and report format.
2. Build a repo/worktree/session data model for local use.
3. Render a terminal-first graph and cleanliness summary.
4. Add focused commands for handoff, cleanup, and closure readiness.
5. Export machine-readable output for editors, dashboards, and automation.

## Initial command shape

Planned commands:

```text
agg scan <workspace>
agg graph [--repo OWNER/REPO]
agg clean [--repo OWNER/REPO]
agg handoff [--repo OWNER/REPO]
agg doctor
```

These names are provisional. The first implementation should prove the model
before the command surface is frozen.

## Non-goals

- replacing `git`
- storing raw agent transcripts in source repos
- building an IDE-only feature
- hiding worktree dirt instead of making it explicit

## Current command

The current implemented commands are `scan`, `graph`, and `handoff`:

```bash
./agg scan /path/to/workspace
./agg scan --current
./agg scan --repo acme/example
./agg scan --snapshot /tmp/git-evidence-snapshot.json --json
./agg graph
./agg graph --repo acme/example
./agg graph --snapshot /tmp/git-evidence-snapshot.json --repo acme/example --json
./agg handoff
./agg handoff --repo acme/example
./agg handoff --snapshot /tmp/git-evidence-snapshot.json --repo acme/example --json
```

`./agg` now builds and caches a local Go binary under `.tmp/bin/agg` and then
execs it, so the checked-in entrypoint stays stable while the core engine lives
in Go source under `cmd/agg` and `internal/agg`.

`scan` reads the `git-evidence-snapshot.v1` schema, builds an internal
cleanliness model, and prints a terminal-first summary of attention lanes and
worktrees. `scan --current` narrows that report to the repo you are standing
in. `graph` reuses that model to render one repo's branches and worktree lanes
as a focused topology view, and now infers the current repo when `--repo` is
omitted. `handoff` turns the same lane model into a decision: safe to hand off,
safe to commit locally, or blocked; when run without `--repo`, it defaults to
the current checkout lane.

For large workspace runs, `scan` now separates first-party attention from
third-party fork noise, distinguishes active worktree edit lanes from
integration-only worktree lanes, exposes non-overlapping JSON buckets for
checkouts, active worktrees, integration worktrees, and forks, caches the
underlying workspace snapshot for fast repeat runs, and emits progress/timing
on stderr while the snapshot and scan model are being built.

## Agent wrapper

The repo also includes a thin skill wrapper at
`skills/agent-git-cleanliness/`. The skill is for agent behavior and workflow;
the `agg` CLI remains the executable source of truth.

For a concrete reference comparison against the upstream inspiration, see
[`docs/reference-vs-vscode-git-graph.md`](docs/reference-vs-vscode-git-graph.md).

## License

Licensed under the Apache License, Version 2.0. See [`LICENSE`](LICENSE) and
[`NOTICE`](NOTICE).

## Next step

Package `agg` into your existing CLI toolchain so the cached, current-scope
workflow is reachable as a natural everyday command.
