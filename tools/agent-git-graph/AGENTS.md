# agent-git-graph

Repo-local instructions for this repository.

## Scope

This repo owns the developer-facing graph and cleanliness UX for CLI agent
workflows. The raw workspace-audit/evidence-gathering layer that produces the
`git-evidence-snapshot.v1` input lives outside this repo; keep that schema
boundary intact instead of duplicating audit logic here.

## Rules

- Do not commit raw agent transcripts, tool logs, or secret-bearing evidence.
- Use `.tmp/` for generated prototypes, screenshots, and one-off reports.
- Prefer small, reviewable slices. Keep policy changes and UX changes easy to
  audit.
- When consuming snapshot data, treat `git-evidence-snapshot.v1` as the input
  contract and preserve that boundary instead of duplicating policy logic
  blindly.

## Workflow

- After the initial scaffold exists, prefer worktrees for feature changes.
- Before shipping a cleanup or closure feature, test it against a deliberately
  messy repo state as well as a clean repo state.
