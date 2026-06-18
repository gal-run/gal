# Native Release Rollback Guide

This document describes how to revert to the monorepo release path if issues arise with the independent GAL Code native release process.

## Current State

- **Primary Release Path**: `gal-run/gal-code` (this repository)
- **Fallback Release Path**: `Scheduler-Systems/gal-run-private` (monorepo)

## Rollback Triggers

Rollback to the monorepo release path if:

1. Native binary builds fail consistently across multiple platforms
2. Artifact signing fails or produces invalid signatures
3. Published binaries don't match expected behavior
4. Update mechanisms (Homebrew, AUR, Docker) break
5. Critical security vulnerability discovered in release

## Rollback Procedure

### 1. Halt New Releases

```bash
# Disable the release workflow in this repo
gh workflow disable release-native-dry-run --repo gal-run/gal-code
```

### 2. Revert to Monorepo Release

The monorepo release pipeline in `Scheduler-Systems/gal-run-private` remains active. To trigger a release from there:

```bash
cd /path/to/gal-run-private
gh workflow run publish.yml --ref main -f bump=patch
```

### 3. Update Package Registries

Point npm, Homebrew, and AUR back to monorepo releases:

**npm**:

```bash
npm dist-tag add @gal-run/code@<monorepo-version> latest
```

**Homebrew**:
Update the formula in `Scheduler-Systems/homebrew-tap` to reference monorepo URLs:

```ruby
url "https://github.com/Scheduler-Systems/gal-run-private/releases/download/v<version>/gal-code-darwin-arm64.zip"
```

**AUR**:
Update PKGBUILD to reference monorepo:

```bash
source_aarch64=("gal-code-bin_${pkgver}_aarch64.tar.gz::https://github.com/Scheduler-Systems/gal-run-private/releases/download/v${pkgver}/gal-code-linux-arm64.tar.gz")
```

### 4. Notify Users

Post an announcement on:

- GitHub Releases
- Discord/Slack channels
- Documentation site

## Verification Checklist

After rollback, verify:

- [ ] `npm install -g @gal-run/code` installs correct version
- [ ] `brew install scheduler-systems/tap/gal-code` works
- [ ] `yay -S gal-code-bin` works (AUR)
- [ ] `docker pull ghcr.io/scheduler-systems/gal-code:latest` works
- [ ] Update mechanisms (electron auto-update, tauri updater) work

## Rollback Decision Matrix

| Issue                        | Severity | Action                     |
| ---------------------------- | -------- | -------------------------- |
| Build fails on one platform  | Medium   | Fix in next release        |
| Build fails on all platforms | Critical | Immediate rollback         |
| Signing fails                | Critical | Immediate rollback         |
| Update mechanisms broken     | High     | Evaluate fix vs rollback   |
| Security vulnerability       | Critical | Immediate rollback + patch |

## First Production Release

After successful dry-run verification:

1. Run dry-run workflow on `main` branch
2. Compare all artifacts with monorepo output
3. Perform manual QA on each platform
4. Get sign-off from release manager
5. Update this document to remove "rollback to monorepo" path
6. Archive monorepo release workflows

## Contacts

- Release Manager: @karabil
- Platform Team: @scheduler-systems/platform
- Security Team: @scheduler-systems/security

---

_This document will be archived after the first successful independent production release._
