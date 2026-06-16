# Contributing to gal

gal is **open core** under **Apache-2.0**. The only exception is commercial code
under `ee/` directories (see [docs/EE.md](docs/EE.md)). The same tree runs
self-hosted and powers the hosted cloud — contributions are welcome.

## Build

gal is a polyglot monorepo built with native per-language tools (no Bazel):

```bash
make -C kernel                              # pure-C reference monitor (head of tree)
(cd services && go build ./...)             # Go services (OSS build is GCP-free)
npx turbo run build                         # TypeScript: SDKs, MCP servers, apps
cargo build --manifest-path cli/Cargo.toml  # Rust CLI
```

`just all` runs the whole matrix; `just all-oss` builds every surface with `ee/` dropped.
Self-host the platform with `docker compose -f deploy/docker-compose.yml up`.

## Repo layout

| Path | What |
|------|------|
| `kernel/`   | pure-C reference monitor + frozen `decide()` ABI (head of the tree) |
| `services/` | Go API / microservices (PEP/PDP); GCP-free OSS build |
| `sdks/`     | TypeScript SDKs (agents, agent-network, swarm, prediction) |
| `mcp/`      | MCP servers (chrome, ide, terminal, vision) |
| `apps/`     | `console` + `dashboard` (Next.js) |
| `cli/`      | Rust `gal` CLI / enforcement hooks |
| `deploy/`   | self-host manifests (docker-compose, helm, argocd) |

## The `ee/` fence (open-core boundary)

License is **by location**: everything outside an `ee/` directory is Apache-2.0;
everything inside an `ee/` directory is commercial ([LICENSE.ee](LICENSE.ee)). The
always-on fence (`tools/check-license-fence.mjs`) enforces it — **published packages
must build-drop `ee/`; deployed apps may ship `ee/` inert behind the runtime
license-key gate** (the Langfuse model). Read [docs/EE.md](docs/EE.md) before adding
or touching `ee/`; never import an `ee/` symbol from Apache code in a published package.

## Pull requests

- **Every commit message must contain `[ci]`** (enforced by the branch ruleset).
- PRs to `main` require review + green CI (the build matrix above + the license fence).
- Keep changes scoped to one surface where possible; path-filtered CI builds only what changed.

## Licensing of contributions

By contributing you agree your contribution is licensed under **Apache-2.0** (or the
commercial license if it lives inside an `ee/` directory). gal uses **DCO** — add a
`Signed-off-by:` line (`git commit -s`). No CLA.

## Security

Report vulnerabilities privately — see [SECURITY.md](SECURITY.md). Do not open public
issues for security reports.
