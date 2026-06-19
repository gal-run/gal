# Migration to the gal Monorepo

The standalone gal repositories consolidate into this single monorepo. The
kernel is at head; every other surface lands as a path-scoped component and its
former standalone repo is **archived after its content lands here** (history
preserved, new work happens in the monorepo).

## Migration sequence

Land surfaces in **ABI order**, so each consumer sees a stable contract:

1. **kernel/** — FIRST. Pure-C reference monitor + frozen ABI header. Nothing
   else can bind until the header exists at head.
2. **services/** (Go) — single `go.mod`/`go.work`; `pkg/abi` cgo-binds the
   kernel; per-service `cmd/<svc>` binaries. Depends on (1).
3. **sdks/** + **mcp/** (TS turbo workspace) — published `@gal-run/*` packages.
   Any kernel-derived types are codegen'd from the header.
4. **apps/** — `dashboard/` (Next.js) and `console/` (relocated legacy JS app).
5. **cli/** (Rust) — `gal-cli` cargo workspace; crates.io + Homebrew tap.
6. **deploy/ docs/ tools/** — Dockerfiles/helm/argocd/IaC, docs, fence/codegen.

## Per-component checklist

For each component migrated into the monorepo:

- [ ] Content copied in under its monorepo path (history preserved where
      feasible via `git mv` / subtree import).
- [ ] Native build wired into the root `justfile` (`just <surface>`).
- [ ] CI path filter added/confirmed in `.github/workflows/ci.yml`.
- [ ] Any commercial code relocated into a per-component `ee/` dir with its own
      commercial `LICENSE` + headers; fence passes (`just fence`).
- [ ] Publish path wired: npm (changesets) / crates.io + Homebrew / `ghcr.io`
      image / kernel release asset — tag-driven, path-scoped
      (`pkg/<name>@<semver>`).
- [ ] Consumers repointed to the published artifact (internal deps use
      workspace ranges; published artifacts pin real semver).
- [ ] Smoke test: a consumer can pull the ONE component without seeing the
      monorepo.
- [ ] **Standalone repo archived** once its content has fully landed here.

## Already done in this foundation

- [x] Top-level skeleton + build delegation (`justfile` + thin `Makefile`).
- [x] Frozen kernel ABI header + reference-monitor + conformance test +
      Makefile.
- [x] Go `go.work`/`go.mod` + `pkg/abi` cgo binding + per-service `cmd/<svc>`.
- [x] TS turbo workspace for `sdks/*` + `mcp/*` + changesets config.
- [x] Rust `gal-cli` cargo workspace with OSS feature flag.
- [x] Per-component `ee/` dirs + commercial licenses + always-on fence.
- [x] Path-filtered CI, OSS-first README, docs, deploy stub.
- [x] **Legacy JS app relocated into `apps/console/`** (config-document
      resolver, schemas, examples) so the root is the monorepo, not the old app.
