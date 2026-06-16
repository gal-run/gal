# Architecture

## Problem statement

CLI agents are good at making progress, but they increase Git-state entropy:
more worktrees, more long-lived branches, more hidden dirt, and more session
state that is invisible to a developer who is not living inside the exact same
terminal lane.

The job of `agent-git-graph` is to make that state visible and actionable
without requiring an IDE-first workflow.

## Core model

The graph should connect these layers:

1. Workspace
2. Repository
3. Branch
4. Worktree
5. Commit
6. Issue or pull request
7. Agent session or checkpoint evidence

Each node needs enough state to answer:

- who owns this branch or worktree?
- is it clean?
- is it safe to commit?
- is it safe to hand off?
- is it safe to merge or close?

## Inputs

Primary inputs:

- local Git state from the active workspace
- a `git-evidence-snapshot.v1` document, supplied with `--snapshot` or
  produced by an external snapshot script (`--snapshot-script` /
  `AGG_SNAPSHOT_SCRIPT`)
- optional live GitHub PR and issue state

Secondary inputs:

- agent/session identifiers carried through commit trailers or checkpoint refs
- repo-local agent layer markers such as `AGENTS.md`, `.codex/`, `.claude/`,
  `.gemini/`, `.gal/`, and `.entire/`

## UX surfaces

The first useful surfaces are:

- concise CLI summary for "what is messy right now?"
- repo-focused graph for "show me this lane and its blockers"
- closure report for "can I hand this off or close it?"
- optional TUI for operators who want richer navigation without opening an IDE

## Reference baseline

`mhutchie/vscode-git-graph` is the clearest external inspiration for this
project because it demonstrates that developers will actively use a graph
surface when it makes Git state legible and actionable.

What we should borrow:

- graph affordances such as branch filtering, commit inspection, comparison,
  and issue or pull request linking
- interaction patterns that reduce cognitive load for "what changed?" and
  "where am I in this lane?"

What we should not borrow blindly:

- VS Code extension architecture
- a generic single-repository mental model that ignores multi-worktree agent
  lanes
- any assumption that topology alone is enough without cleanliness, evidence,
  and handoff state

This repo should remain an original Go implementation with its own model and
acceptance tests, while using the upstream project as a benchmark for UX
quality.

## Snapshot input contract

`agg` consumes a JSON document with `schemaVersion: "git-evidence-snapshot.v1"`
and a `repos` array. Each repo entry carries its `relativePath`, optional
`github` slug/owner, `branch` ahead/behind/upstream state, `dirt` counters,
worktree flag, and optional agent/session `evidence`. The complete, runnable
shape is captured by the fixtures in `tests/fixtures/` — treat those as the
reference for producing a compatible snapshot. `agg` never gathers raw git
evidence itself; it is an analysis and presentation layer over this contract.

## Implementation shape

- `./agg` is the stable source-checkout entrypoint.
- The core engine lives in Go under `cmd/agg` and `internal/agg`.
- The wrapper builds a cached local binary into `.tmp/bin/agg` so repeated
  runs do not pay the full compile cost.
- Shell acceptance tests remain in `tests/*.sh` to validate user-visible
  behavior across snapshot fixtures and messy-lane scenarios.

## Design constraints

- terminal-first by default
- explicit about dirt and blockers
- safe around multi-worktree and multi-org workspaces
- useful even when GitHub or external evidence backends are temporarily
  unavailable
- compatible with future editor integrations rather than dependent on them

## Recommended implementation order

1. Snapshot adapter
2. Internal graph model
3. Human-readable CLI report
4. Repo-scoped graph view
5. Handoff and closure checks
6. Optional TUI or static HTML export
