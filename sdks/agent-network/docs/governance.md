# Governance

`gal-run/agent-network` is an extraction from the GAL release-surface split.

## Ownership

- Owner org: `gal-run`.
- Initial code owner: `@example-org` via `.github/CODEOWNERS`.
- Product domain logic remains in each product API repo.

## Source Of Truth

Product APIs are the source of truth for product behavior. This repo is the source of truth for shared service-as-software contracts, adapter boundaries, and future generated compatibility artifacts.

## Branch Protection Plan

After the bootstrap PR lands, protect `main` with:

- Pull request required before merge.
- At least one approving review where GitHub permits it.
- Required CI check: `CI / test`.
- Dismiss stale approvals on new commits.
- Require conversation resolution before merge.
- Restrict force pushes and branch deletion.

Admin bypass may be used only for bootstrap or unblock work that is documented in the relevant issue or PR.

## Contract Change Rules

Changes that alter exported task state, Agent Card fields, auth fields, or artifact/error contracts must include:

- Compatibility note in the PR body.
- Focused tests or schema fixtures.
- Consumer impact notes for downstream service, CLI, MCP, and A2A adapters.
