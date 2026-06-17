<p align="center">
  <img src="hero-banner.png" alt="gal - open governance platform" width="700">
</p>

<p align="center">
  <a href="https://gal.run"><img src="https://img.shields.io/badge/docs-gal.run-blue" alt="Documentation"></a>
  <a href="https://status.scheduler-systems.com"><img src="https://img.shields.io/badge/status-scheduler--systems-green" alt="Service status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-brightgreen" alt="License"></a>
</p>

# gal — open governance platform; kernel at head; build from source today

gal governs AI agents from a small, auditable core. A pure-C **reference
monitor** sits at the head of the repo behind a **frozen ABI**; every other
surface — Go services, TypeScript SDKs and MCP servers, the Rust CLI, the
dashboard — binds to that one contract. gal is Apache-2.0, open core, and you
build the whole platform **from source today**:

```bash
# build everything from source, in ABI order (kernel header first)
just all          # or `just kernel` / `just services` for one ecosystem
```

> **Self-host via Docker Compose is a work-in-progress.**
> [`deploy/docker-compose.yml`](deploy/docker-compose.yml) is a **skeleton**: the
> per-service images (`ghcr.io/gal-run/<svc>:dev`) are not yet published, and the
> Go services are currently skeleton binaries. To build the images locally,
> uncomment the `build:` block under each service and run:
>
> ```bash
> docker compose -f deploy/docker-compose.yml up --build
> ```
>
> A pinned, published-image compose for one-command self-host is on the roadmap.

## Why kernel at head

The reference monitor (`kernel/`, pure C — a clean copy of the public
`gal-run/gal-kernel`) is the single contract the entire monorepo binds to. Its
ABI — `kernel/include/gal_decide.h` — is frozen and append-only, so consumers in
any language **embed it via the C ABI**. Builds run in **ABI order**: the kernel
is built first, then everything downstream (the Go cgo binding, codegen
consumers, the rest).

## Monorepo layout

| Path        | Lang  | What                                                              | Ships as |
|-------------|-------|-------------------------------------------------------------------|----------|
| `kernel/`   | C     | pure-C reference monitor (core + JSON shell) + frozen C ABI + tests | source (embedded via C ABI) + header |
| `services/` | Go    | governance, auth, gateway, mcp-gateway, dispatch, repo, sdlc, team, swarm, gal-rag | `ghcr.io/gal-run/<svc>` images |
| `sdks/`     | TS    | agents-schema, agent-network, swarm, prediction, contracts        | npm `@gal-run/*` |
| `mcp/`      | TS    | mcp-chrome, mcp-terminal, mcp-ide, mcp-vision                     | npm `@gal-run/mcp-*` |
| `apps/`     | TS/JS | `dashboard/` (Next.js, deployed), `console/` (relocated legacy app) | deployed |
| `cli/`      | Rust  | `gal-cli`                                                         | crates.io + Homebrew tap |
| `deploy/`   | —     | Dockerfiles, helm/argocd/IaC, docker-compose                     | — |
| `docs/`     | —     | architecture, ABI spec, EE policy, runbooks                      | — |
| `tools/`    | —     | license-fence, codegen, ci helpers                               | — |

## Build

The root `justfile` (mirrored by a thin `Makefile`) delegates to each
ecosystem's native tool — no Bazel.

```bash
just kernel     # make/cc  -> compile pure-C core (frozen C ABI header)
just services   # go build (single go.mod / go.work)
just sdks        # npm + turbo (affected-only, remote-cached)
just mcp
just apps
just cli        # cargo
just fence      # license-by-location check
just all        # everything, in ABI order (kernel header first)
just all-oss    # OSS-only: drops all ee/ code from every artifact
```

CI is path-filtered (GitHub Actions, ubuntu-latest only): each language builds
only when its paths change; the license fence runs always. An ABI header change
is the one intentional cross-language fan-out (it rebuilds the Go cgo binding).
Every commit message must contain `[ci]`.

## Install the CLI

```bash
# Homebrew
brew install gal-run/tap/gal

# crates.io
cargo install gal-cli
```

```bash
gal scan              # discover existing AI agent configs
gal approve --local   # standardize into ~/.gal/config.yaml
gal sync              # distribute the canonical config to your agents
```

## MCP servers

gal publishes MCP servers as standalone npm packages: `@gal-run/mcp-chrome`,
`@gal-run/mcp-terminal`, `@gal-run/mcp-ide`, `@gal-run/mcp-vision`. The hosted
governance MCP endpoint is `https://api.gal.run/mcp` (OAuth on first use):

```json
{
  "mcpServers": {
    "gal": { "type": "streamable-http", "url": "https://api.gal.run/mcp" }
  }
}
```

## Open core

Code outside any `ee/` directory is **Apache-2.0** (see [`LICENSE`](LICENSE) and
[`NOTICE`](NOTICE)). Per-component `ee/` directories hold commercial Enterprise
Edition code ([`LICENSE.ee`](LICENSE.ee)), which is inert without a valid signed
license key and is dropped entirely from OSS builds. See [`docs/EE.md`](docs/EE.md).

**gal-cloud** is the hosted, managed offering — the same kernel + services with
EE features enabled and operated for you. Architecture:
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Migration plan:
[`docs/MIGRATION.md`](docs/MIGRATION.md).

## Status & support

- **Status:** [status.scheduler-systems.com](https://status.scheduler-systems.com) — component map in [`STATUS.md`](STATUS.md) / [docs/status-components.md](docs/status-components.md)
- **Issues:** use this repository for bug reports and feature requests
- **Email:** support@scheduler-systems.com — enterprise: sales@scheduler-systems.com

## About

gal is built by [Scheduler Systems](https://scheduler-systems.com).

## License

Apache-2.0 (default) — [`LICENSE`](LICENSE) + [`NOTICE`](NOTICE).
Enterprise Edition (`ee/`) — [`LICENSE.ee`](LICENSE.ee).
