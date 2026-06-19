# Release Runbook

This repo is private-first. Do not publish public packages until contract shape and licensing are approved.

## Initial Package

- Package name: `@gal/agent-network`.
- Current status: private network/interoperability package.
- First internal release: `v0.1.0`.
- Current boundary split release: `v0.2.0`.
- Artifact policy: GitHub Release with an attached `npm pack` tarball. Do not publish to npm until licensing, package access, and compatibility policy are approved.

## Internal Release Gate

Before publishing an internal package version:

1. Confirm `npm run type-check`, `npm test`, and `npm run build` pass.
2. Confirm `npm run smoke:consumer` passes from a packed artifact.
3. Confirm exported contracts have compatibility notes.
4. Confirm the target consumer PR or issue is linked.
5. Confirm the package registry and access policy are private.
6. Tag only after the package artifact is reproducible from `main`.

## Release Commands

```sh
npm ci
npm run type-check
npm test
npm run build
npm run smoke:consumer
npm pack --pack-destination /tmp
git tag v0.2.0
gh release create v0.2.0 /tmp/gal-agent-network-0.2.0.tgz --title "Agent Network v0.2.0" --notes-file docs/releases/v0.2.0.md
```

The attached tarball is the internal package artifact. Runtime deployments remain owned by GAL or product adapters.

## Public Release Gate

Public release is blocked until:

- Licensing is approved.
- Contract stability is approved.
- Backward-compatibility policy is documented.
- Public package name and namespace are approved.

## Release Notes Stub

Each release note should include:

- Contract changes.
- Compatibility impact.
- Consumer migration steps.
- Validation commands.
