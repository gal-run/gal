# gal Architecture

gal is an open-source toolkit building toward a config-and-policy control plane
for AI coding agents. Today it installs git SDLC hooks (tests-before-commit and
issue-reference checks) and ships MCP servers (terminal, vision, browser) for
your agents. Hosted config discovery and sync need an account; cross-agent hook
install and per-tool blocking enforcement are in active development. **The kernel is at head**: a small pure-C reference monitor
with a frozen ABI is the one contract the entire monorepo binds to. Everything
else is downstream of it.

## Kernel at head

`kernel/` is a clean copy of the public `gal-run/gal-kernel` reference monitor —
a small pure-C decision core that every other component **embeds via the C ABI**.
It is the ground truth at the head of the monorepo; all other surfaces are
downstream of it.

- `kernel/include/gal_kernel.h` — the bare core API: a typed request goes in, a
  verdict comes out. No heap, no I/O, no parsing in the core (seL4/SQLite
  discipline; see `kernel/KERNEL-C-GUIDELINES.md`).
- `kernel/include/gal_decide.h` — the **consumer ABI**: `decide(agent, capability,
  scope, action) → { effect, reason, obligations }`, JSON in / JSON out,
  implemented by the shell. This is the header downstream consumers (Go cgo,
  generated TS/Rust bindings) bind to. Treated as append-only: enum values and
  struct layouts already shipped never change; new capabilities append.
- `kernel/src/gal_kernel.c` — the decision core (fail-closed, default-deny).
- `kernel/src/gal_decide.c` — the shell that parses untrusted JSON (`third_party/jsmn.h`),
  calls the core, and serializes the result.
- `kernel/schemas/` — the `gal/v1` wire schemas (DecisionRequest / DecisionResult).
- `kernel/test/` — unit tests (`test_kernel.c`) and JSON-shell tests (`test_shell.c`)
  that pin the behavior; `make -C kernel asan` runs both under ASan+UBSan.

The kernel builds with its **own** `Makefile` (cc, `-std=c11 -Wall -Wextra
-Werror`): `make -C kernel all` compiles the core, `make -C kernel test` builds
and runs both suites. Because the kernel is at head, `just all` builds it
**first** so every consumer sees the current ABI. A change to `kernel/include/**`
is the single intentional cross-language fan-out (it rebuilds the Go cgo binding).

## Component map

| Surface     | Lang  | Tool          | What                                                                 | Distribution |
|-------------|-------|---------------|----------------------------------------------------------------------|--------------|
| `kernel/`   | C     | make / cc     | pure-C reference monitor (core + JSON shell) + frozen C ABI (`include/gal_decide.h`) + unit/shell tests | source (embedded via C ABI by consumers) + header release asset |
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
