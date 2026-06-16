# Release Runbook

This repo is private-first. Do not publish public packages until contract shape,
security boundaries, and provider-adapter policy are approved.

## Package

- Package name: `@gal/swarm`.
- Current status: private burst-compute contract package.
- First internal release: `v0.1.0`.
- Artifact policy: GitHub Release with an attached `npm pack` tarball.

## Internal Release Gate

Before publishing an internal package version:

1. Confirm `npm run type-check`, `npm test`, and `npm run build` pass.
2. Confirm `npm run smoke:consumer` passes from a packed artifact.
3. Confirm `npm run proof:wave-300` passes for the dry-run control-plane proof.
4. Confirm no provider credentials, infrastructure secrets, or runtime tokens are included.
5. Confirm provider adapters remain out of the core package.
6. Tag only after the package artifact is reproducible from `main`.

## v0.1.0 Commands

```sh
npm ci
npm run type-check
npm test
npm run build
npm run smoke:consumer
npm run proof:wave-300
npm pack --pack-destination /tmp
git tag v0.1.0
gh release create v0.1.0 /tmp/gal-swarm-0.1.0.tgz --title "GAL Swarm v0.1.0" --notes-file docs/releases/v0.1.0.md
```
