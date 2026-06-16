# Reference: `agent-git-graph` vs `vscode-git-graph`

## Purpose

This document records the product lineage clearly:

- `agent-git-graph` was inspired by
  [`mhutchie/vscode-git-graph`](https://github.com/mhutchie/vscode-git-graph)
- the inspiration is at the idea and UX level
- this repository is not intended to be a literal port, clone, or published
  derivative of the upstream extension

That distinction matters because the target problem here is broader than commit
topology inside an IDE tab.

## Comparison

| Dimension | `vscode-git-graph` | `agent-git-graph` |
| --- | --- | --- |
| Primary surface | Visual Studio Code extension | Go CLI with future TUI or editor adapters |
| Default scope | One repository graph | Workspace, repository, branch, and worktree lanes |
| Primary user question | "Show me the Git history and let me act on it" | "Is this lane clean, safe to hand off, and safe to close?" |
| Core data | Git refs, commits, diffs, stashes, remotes | Git topology plus worktree state, cleanliness, evidence, and agent markers |
| Operational focus | Generic Git actions | Agent-session cleanup, closure, and handoff readiness |
| Integration style | IDE-native view and commands | Terminal-first engine with machine-readable output |

## What to borrow

- branch and ref filtering patterns
- commit and lane inspection affordances
- comparison workflows
- issue and pull request linking ideas
- keyboard-first navigation concepts if a TUI or editor surface is added later

## What to build differently

- explicit worktree-aware lane modeling
- first-class cleanliness state instead of treating dirt as a side detail
- workspace-scale summaries, not just repo-local history
- handoff and closure semantics based on blockers and evidence
- output that can be used by CLI agents, other CLIs, dashboards, and editors

## Implementation rule

Use the upstream project as a benchmark for whether the graph feels useful and
intuitive. Do not let it dictate the engine, data model, or repository
boundary of this project.
