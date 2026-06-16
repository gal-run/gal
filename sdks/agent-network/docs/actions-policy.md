# Actions Policy

This repo starts with a minimal CI policy because it is the contract boundary for GAL service-as-software packages.

## Required Checks

Every pull request must pass:

- TypeScript type-check.
- Unit tests.
- Package build.

The initial CI workflow runs these checks on pull requests and pushes to `main`.

## Permissions

Workflow permissions should remain read-only by default. Add write permissions only in workflows that need to publish releases or update generated artifacts, and document the reason in the workflow file.

## Secrets

Do not add product, deployment, or runtime secrets to this repo. Package publishing credentials, if needed later, must be scoped to the package registry and stored as repo or environment secrets with environment protection.

## Runners

Use standard GitHub-hosted runners until package builds need enterprise runner labels. Any self-hosted runner requirement must be documented in this file and must not block consumers from running local validation.
