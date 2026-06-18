# Migration Inventory

Parent issue: `gal-run/gal-private#6910`.

## Source To Extract

Initial source path in `gal-private`:

- `apps/gal-code`

## Release Ownership To Move

- GAL Code package/runtime release workflow.
- GAL Code native asset packaging.
- GAL Code runtime release notes.
- Runtime/provider compatibility validation.

## Contract Boundaries

Shared contracts consumed by other GAL products should move to versioned packages such as `gal-run/agent-network` or generated schema artifacts. Product domain logic stays out of this repo.

## First Extraction Gate

1. Approve visibility and licensing.
2. Extract `apps/gal-code` with history where feasible.
3. Identify which runtime interfaces stay local and which become shared contracts.
4. Build native assets in this repo as a dry-run.
5. Remove GAL Code native asset publish defaults from `gal-private` only after replacement proof exists.
