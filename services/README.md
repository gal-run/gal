# gal — governance platform (OSS services)

Open, self-hostable Go services for the **gal** governance kernel: a policy
decision point (PDP), authentication, an API gateway, MCP transport, semantic
code RAG, and the pure-Go governance inference runtime. Licensed under
**Apache-2.0** (see `LICENSE`/`NOTICE`).

This tree is **GCP-free**: it builds and links with **no** Google Cloud /
Firebase dependency. Persistence for self-hosted deployments uses Postgres.

```
go build ./...   # builds the OSS services, no cloud build tag, no GCP deps
go vet ./...
go test ./...
```

## Services

| Component | Role |
|---|---|
| `gateway/` | Reverse proxy / rate-limit / JWT verification (PEP edge) |
| `governance-svc/` | The policy decision point — proposals, policies, compliance, drift audit; Postgres-backed (`GOV_STORE=postgres`) |
| `auth-svc/` | JWT / OAuth authentication |
| `mcp-gateway/` | MCP Streamable HTTP transport for AI agents |
| `mcp-svc/` | MCP service surface |
| `dispatch-svc/` `repo-svc/` `sdlc-svc/` `team-svc/` `swarm-svc/` | Control-plane services |
| `gal-rag/` | Semantic code-search RAG (Postgres + vector store) |
| `gal-inference-svc/` | Governance model inference runtime (loads weights at deploy time) |
| `gal-cli/` | CLI for managing agent/governance configuration |
| `lib/` | Shared libraries: auth, contracts, HTTP handler, telemetry, httpclient |
| `pkg/gal/` | Pure-Go forward pass for the governance MLP (8→24→24→2) |

## Governance model runtime

`pkg/gal` ships the **math runtime only** (the dense/relu/softmax forward
pass). It ships **no trained weights** — the model parameters are supplied at
runtime via `gal.LoadWeights` / `gal.SetWeights` (e.g. from a JSON file). With
no weights loaded, `Infer` fails safe and returns
`hold_for_operator_review`.

## Persistence

Self-hosted deployments select the Postgres backend:

```bash
GOV_STORE=postgres JWT_SECRET=dev-secret go run ./governance-svc/cmd/server/
```

The default build links no Google Cloud SDK. (A separate, proprietary managed
control plane — billing, the cross-tenant telemetry aggregator, and
multi-tenant operations — is not part of this open distribution.)

## Public endpoints (no auth)

| Method | Path | Backend | Description |
|---|---|---|---|
| GET | `/health` | gateway | Health check |
| GET | `/health/ready` | gateway | Readiness probe |
| GET | `/metrics` | gateway | Aggregate downstream health |
| POST | `/webhooks/github` | repo-svc | GitHub webhooks (signature-verified) |
| GET | `/auth/oauth/callback` | auth-svc | OAuth callback |

## Development

Prerequisites: Go 1.25+, `JWT_SECRET` env var, and (for stateful services) a
Postgres instance.

```bash
JWT_SECRET=dev-secret go run ./gateway/cmd/server/
```
