# Release Runbook

This repo is private-first and must not publish public GAL Code artifacts until licensing and release ownership are approved.

Stable releases are mainline-only. Run `publish.yml` on `main`, and expect the workflow to fail rather than create a detached release commit if the checkout is stale or not on the `main` tip.

## Release Surfaces

The GAL Code release owns:

- runtime package artifacts
- GAL Code native assets
- runtime release notes
- provider/runtime compatibility evidence

It does not own GAL CLI/npm/Homebrew releases, app/API deploys, or extension marketplace publishes.

## Internal Dry Run

Before the first release:

1. Install dependencies.
2. Run type-check and tests.
3. Build runtime package artifacts.
4. Build native assets where supported.
5. Compare artifact names and update paths against the current monorepo release output.
6. Verify [status-aware upstream errors](status-upstream-errors.md) are present in the extracted runtime and covered by tests.

## Rollback

If the first independent GAL Code release fails, disable this repo's publish workflow and temporarily route GAL Code assets through `gal-private` until the failure is fixed.
