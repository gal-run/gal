# GAL Local Model

This document describes the current local-first GAL CLI model and the public extraction work around it.

## Current Public Repo Status

Today this repository is the public home for:

- release assets
- installation instructions
- Homebrew formula
- issues and community discussion
- reference helpers, schemas, and tests for the local config model

The CLI source is still being extracted in stages. Public docs should describe the shipped local model, not a future multi-workspace design.

## Current Scope Model

GAL currently behaves as a workspace-scoped local config layer with optional repo-scoped overrides.

The effective precedence is:

`project scope > workspace scope > generated native files`

In practice:

- `~/.gal/config.yaml` stores the local workspace default
- `<repo>/.gal/config.yaml` stores repo-specific overrides
- native files like `AGENTS.md`, `.claude/`, `.cursor/`, and `.github/copilot-instructions.md` are generated outputs

## Directory Layout

Workspace scope:

```text
~/.gal/
  config.yaml
  sync-state.json
  config.json
```

Project scope:

```text
<repo>/.gal/
  config.yaml
  sync-state.json
```

## Resolution Rules

Effective config for a repo should be resolved like this:

1. Load the workspace config from `~/.gal/config.yaml`
2. Load repo overrides from `<repo>/.gal/config.yaml` when present
3. Use repo scope when the same setting exists in both places
4. Generate native agent files from the effective config

Important rules:

- repo overrides never silently mutate workspace config
- local approval writes the base config to `~/.gal/config.yaml`
- cloud/org sync can still materialize local config, but repo overrides remain local

## Command Model

For local-only users:

```bash
gal scan
gal approve --local
gal sync
```

For connected users:

```bash
gal auth login
gal sync --pull
```

For repo-specific overrides:

```bash
gal sync
```

If `<repo>/.gal/config.yaml` exists, it overrides `~/.gal/config.yaml` for that repo.

## Public Repo Rollout

The public repo rollout should continue in stages:

1. Keep docs, helpers, and tests aligned with the shipped local model
2. Publish more of the local resolver and sync logic that do not require private backend code
3. Publish the CLI source for local-first flows into this repository
4. Keep proprietary GAL Cloud and org approval backend logic private

This keeps the public repo truthful while still allowing incremental extraction of the CLI.

The current public reference layer includes:

- [apps/console/schemas/workspace-config.schema.json](../apps/console/schemas/workspace-config.schema.json)
- [apps/console/schemas/project-config.schema.json](../apps/console/schemas/project-config.schema.json)
- [apps/console/examples/workspace-config.yaml](../apps/console/examples/workspace-config.yaml)
- [apps/console/examples/project-config.yaml](../apps/console/examples/project-config.yaml)
- [docs/merge-rules.md](merge-rules.md)
- [apps/console/reference/resolve-config.mjs](../apps/console/reference/resolve-config.mjs)
- [apps/console/reference/filesystem-helpers.mjs](../apps/console/reference/filesystem-helpers.mjs)
- [apps/console/reference/config-documents.mjs](../apps/console/reference/config-documents.mjs)

The reference helper layer currently covers:

- workspace and project path helpers for `~/.gal/` and `<repo>/.gal/`
- project-root discovery that falls back to `.claude/` and `.gal/` when `.git` is absent
- raw workspace and project document I/O for YAML config files and JSON sync-state sidecars

## PR Policy For Public Work

Changes pushed to this public repository should follow these rules:

- do not claim the CLI source is public until the relevant source actually lands here
- document roadmap items as planned, not shipped, until the implementation is public
- keep install instructions accurate to the currently released CLI
- prefer additive docs and extraction steps over placeholder source trees
