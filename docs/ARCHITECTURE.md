# gal Architecture

gal is an open governance platform. **The kernel is at head**: a small pure-C
reference monitor with a frozen ABI is the one contract the entire monorepo
binds to. Everything else is downstream of it.

## Kernel at head

`kernel/` is a pure-C reference monitor exposing a **frozen ABI** in
`kernel/include/gal/gal_decide.h`. The Makefile produces `libgal_decide.a`,
`libgal_decide.so`, and installs the header. The header is treated as
append-only: enum values and struct layouts already shipped never change;
new capabilities append, new fields go behind a new versioned struct. ABI
conformance tests (`kernel/tests/abi_conformance.c`) pin the contract.

Because the kernel is at head, `just all` builds it **first** so every cgo and
codegen consumer sees the current header. An ABI header change is the single
intentional cross-language fan-out (it rebuilds the Go cgo binding).

## Component map

| Surface     | Lang  | Tool          | What                                                                 | Distribution |
|-------------|-------|---------------|----------------------------------------------------------------------|--------------|
| `kernel/`   | C     | make / cc     | reference monitor + frozen ABI + conformance tests                   | source + prebuilt `libgal_decide` + header release asset |
| `services/` | Go    | go build      | governance, auth, gateway, mcp-gateway, dispatch, repo, sdlc, team, swarm, gal-rag; one `go.mod`/`go.work`; `pkg/abi` cgo binds the kernel; one binary per `cmd/<svc>` | per-service `ghcr.io/gal-run/<svc>:<ver>` images |
| `sdks/`     | TS    | npm + turbo   | agents-schema, agent-network, swarm, prediction, contracts           | npm `@gal-run/*` (changesets) |
| `mcp/`      | TS    | npm + turbo   | mcp-chrome, mcp-terminal, mcp-ide, mcp-vision                        | npm `@gal-run/mcp-*` (changesets) |
| `apps/`     | TS/JS | npm + turbo   | `dashboard/` (Next.js, deployed), `console/` (relocated legacy app)  | deployed, not published |
| `cli/`      | Rust  | cargo         | `gal-cli` workspace                                                  | crates.io + Homebrew tap |
| `deploy/`   | —     | docker/helm   | Dockerfiles, helm/argocd/IaC, docker-compose self-host stub          | — |
| `docs/`     | —     | —             | this map, ABI spec, EE policy, runbooks                              | — |
| `tools/`    | —     | node          | license-fence check, codegen, ci helpers                             | — |

## Build & CI

The root `justfile` (mirrored by a thin `Makefile`) delegates to each
ecosystem's **native** tool — no Bazel. `just <surface>` builds one surface;
`just all` runs in ABI order. CI is path-filtered GitHub Actions
(`dorny/paths-filter`, ubuntu-latest only): `kernel` on `kernel/**`,
`services` on `services/**` + `kernel/include/**`, `ts` on
`sdks/**|mcp/**|apps/**` (turbo affected-only), `cli` on `cli/**`, and `fence`
always. Every commit message must contain `[ci]` (repo ruleset).

## ee/ fence (open core)

License is determined by **location**. Code outside any `ee/` directory is
Apache-2.0 (root `LICENSE`). Code inside a per-component `ee/` directory
(`services/governance/ee/`, `sdks/swarm/src/ee/`, `cli/src/ee/`,
`apps/dashboard/src/ee/`) is commercial (`LICENSE.ee`), each carrying its own
commercial `LICENSE` + header. `tools/check-license-fence.mjs` (always-on in
CI) enforces the fence: every `ee/` has a commercial LICENSE, no Apache header
inside `ee/`, and no non-`ee/` file imports an `ee/` symbol in the OSS build.
ee/ code is runtime-inert without a valid signed license key (kernel capability
check) and is dropped entirely from OSS builds. See `docs/EE.md`.

## gal-cloud

gal-cloud is the hosted, managed offering of gal (managed control plane,
licensed Enterprise Edition features, support). The OSS platform is fully
self-hostable today (`deploy/docker-compose.yml`); gal-cloud is the same
kernel + services with the commercial `ee/` capabilities enabled by a valid
license key and operated for you.
