# Actions Policy

This repo must release GAL Code without triggering `gal-private` app/API deploys or GAL CLI/extension publishes.

## Required Checks

During bootstrap, every pull request must pass the repo governance workflow.

After source extraction, required checks should include:

- dependency install
- type-check
- unit tests
- runtime package build
- native asset dry-run
- provider/runtime compatibility tests

## Permissions

Workflow permissions should stay read-only by default. Release workflows may request write permissions only for release creation or artifact upload.

## Secrets

Do not add app/API deploy, Firebase, k3s, npm CLI, VS Code Marketplace, Open VSX, Chrome Web Store, or Homebrew credentials here. Runtime/provider credentials used for tests must be scoped to dedicated test environments.
