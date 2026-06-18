# Governance

`gal-run/gal-code` is the private-first owner repo for GAL Code runtime extraction from `gal-private`.

## Ownership

- Owner org: `gal-run`.
- Initial code owner: `@karabil` via `.github/CODEOWNERS`.
- Source path before extraction: `gal-run/gal-private/apps/gal-code`.

## Visibility Rule

Keep the repo private until licensing, OpenCode attribution, dependency licenses, and source exposure are approved.

## Branch Protection Plan

After the bootstrap push lands, protect `main` with:

- Pull request required before merge.
- At least one approving review where GitHub permits it.
- Required check: `Repo Governance / repo-governance`.
- Dismiss stale approvals on new commits.
- Require conversation resolution before merge.
- Restrict force pushes and branch deletion.

## Release Ownership Rule

This repo is the canonical owner for GAL Code runtime release decisions after extraction. `gal-private` must stop publishing GAL Code native assets by default after a successful replacement release exists.
