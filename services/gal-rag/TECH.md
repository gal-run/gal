# gal-rag — Technical Specification

**Status:** Draft v0.1 (2026-06-02)
**RFC:** internal design note
**Owner:** gal-rag team
**Related spec:** [`.tmp/gal-memory-routing-spec.md`](../../.tmp/gal-memory-routing-spec.md)

---

## 1. Purpose

`gal-rag` is the **unified semantic retrieval layer** for the GAL platform. It
sits between the existing memory store (Firestore-backed, exact-match) and
agent query consumers (MCP tools, internal services), providing:

- **Vector search** over code, markdown, ADRs, issues, PRs, and learned
  knowledge.
- **Hybrid ranking** that combines dense vector similarity with exact
  keyword / tag matches.
- **Agentic retrieval primitives** — composable MCP tools (`gal_rag_search`,
  `gal_rag_graph`, `gal_rag_timeline`, `gal_rag_evaluate`) that an agent can
  chain to perform multi-hop retrieval, coverage checks, and self-critique.

`gal-rag` does **not** replace `gal_memory_search` (Firestore) or GitHub
search — it complements them. Per the GAL memory routing spec, agents query
layers in this order:

```
Session context → GAL memory (Firestore) → gal-rag (vector+keyword) → GitHub
```

`gal-rag` is the second-half of the GAL layer: it adds semantic recall to the
exact-match Firestore store and pre-filters GitHub candidates before
escalation.

---

## 2. Service Boundaries

### 2.1 What gal-rag owns

| Concern | Owned by gal-rag |
|---|---|
| Embedding generation cache (text + content-hash → vector) | Yes |
| Qdrant collection schema and lifecycle | Yes |
| Hybrid ranking (vector + keyword) | Yes |
| Search API (REST + GraphQL) | Yes |
| Ingestion webhook handlers (GitHub push, content upsert) | Yes |
| Dead-letter queue for failed ingestion | Yes |
| Agentic retrieval MCP tools (`gal_rag_*`) | Yes |

### 2.2 What gal-rag calls

| Dependency | Purpose | Auth |
|---|---|---|
| **gal-model** (`backend/gal-model`) | Embedding generation for text/code chunks (uses existing PyTorch sidecar or hosted Voyage/OpenAI as configured) | Service-to-service JWT |
| **repo-svc** | GitHub webhook fan-out (`/webhooks/github` already wired through gateway) | Signed webhook + internal JWT |
| **mal-svc** | Org-scoped memory storage and metadata joins (`/memory/*`) | JWT propagation via `lib/auth` |
| **team-svc** | Org metadata, membership, `org-memory` pool (`/org-memory/*`) | JWT propagation |
| **Qdrant** (v1.15.0) | Vector + payload storage and HNSW search | Local network, API key in env |
| **PostgreSQL** | Embedding job queue + dead-letter table | Internal DB user |

### 2.3 What does NOT change

- **`gal_memory_search` / `gal_read_memory` / `gal_write_memory`** continue to
  read/write Firestore. `gal-rag` is additive — Firestore remains the
  source-of-truth for org/repo memory.
- **`gal_get_peer_activity`** is unaffected.
- **Gateway routing** is unchanged. gal-rag runs as a new microservice behind
  the gateway at `/rag/*` and is also exposed directly to MCP clients at
  `/mcp` (parallel to `mcp-gateway`).

---

## 3. Tech Stack Decision: Go

**Decision: Go**, matching the existing backend monorepo.

### 3.1 Justification

| Criterion | Go | Rust |
|---|---|---|
| Matches the backend monorepo | Yes | No (Rust lives in `gal-cli`) |
| Shared `lib/` (Firestore, auth, telemetry, httpclient) | Reusable | Would need parallel impl |
| HTTP/gRPC service patterns (`chi`, `httputil.ReverseProxy`) | Mature, established | Would introduce new stack |
| Qdrant client (`qdrant/go-client`) | First-class, gRPC | First-class too |
| Cold-start latency for cold container | Negligible | Negligible |
| Engineering pool | All backend engineers on this team | Smaller subset |

Rust was considered (memory efficiency, async-first, `qdrant-client` crate is
excellent) but the operational cost of running a second language runtime in
the same monorepo outweighs the benefits. The gal-cli Rust migration earlier
this year was a CLI binary — a long-running service is a different concern.
If a hot-path becomes Qdrant-bound, a Rust ingestion worker can be added
later (similar pattern to gal-cli).

### 3.2 Framework choice

- **HTTP:** `github.com/go-chi/chi/v5` (matches gateway, mal-svc, team-svc)
- **Auth:** `github.com/go-chi/jwtauth/v5` + `lib/auth` (already extracted)
- **Qdrant:** `github.com/qdrant/go-client` v1.15.0
- **Postgres:** `github.com/jackc/pgx/v5` (job queue, DLQ)
- **Telemetry:** `lib/telemetry` (OTLP, slog)
- **Structured logging:** `log/slog` (Cloud Run JSON handler in `lib/telemetry`)

---

## 4. Architecture

```
                ┌──────────────┐
   MCP clients  │   Gateway    │  port 8080 (existing)
   ────────────▶│  (chi mux)   │
                └──────┬───────┘
                       │ /rag/*  /mcp
                       ▼
                ┌──────────────┐
                │   gal-rag    │  port 8080
                │   (chi mux)  │
                └──┬─────┬─────┘
        ┌──────────┘     └──────────┐
        ▼                           ▼
  ┌───────────┐              ┌──────────────┐
  │  Qdrant   │              │  PostgreSQL  │
  │  v1.15.0  │              │ (DLQ, jobs)  │
  └───────────┘              └──────────────┘
        ▲                           ▲
        │                           │
        │                  ┌────────┴────────┐
        │                  │  Ingestion      │
        │                  │  Worker         │
        │                  │  (goroutine     │
        │                  │   pool)         │
        │                  └────────┬────────┘
        │                           │
        │                  ┌────────┴────────┐
        │                  │  gal-model      │
        │                  │  (embeddings)   │
        │                  └─────────────────┘
        ▲                           ▲
        │                           │
   GitHub webhook             Push events
   (via repo-svc)             (existing /webhooks/github)
```

gal-rag is a **single Go binary** with three internal goroutine pools:

1. **HTTP server** — REST + GraphQL endpoints.
2. **Ingestion worker** — consumes from a Postgres-backed job queue, calls
   gal-model for embeddings, upserts to Qdrant.
3. **DLQ replayer** — cron-driven, retries or quarantines failed jobs.

---

## 5. Qdrant Schema

### 5.1 Collection: `gal_rag_chunks`

**One collection, multi-tenant via payload filter.** This matches the dev
infrastructure setup documented in
[`dev/README.md`](./dev/README.md#collection-strategy-recommendation).

#### 5.1.1 Vector configuration

| Name | Dim | Distance | Source |
|---|---|---|---|
| `dense_openai_256` | 256 | Cosine | OpenAI `text-embedding-3-small` (Matryoshka truncated) |
| `dense_voyage_512` | 512 | Cosine | Voyage `voyage-3.5` / `voyage-code-3` / `voyage-3.5-lite` |
| `sparse_bm25` | variable | BM25 | Server-side sparse vector computed by Qdrant |

Both dense vectors are stored as **named vectors** on the same point. The
sparse vector powers hybrid keyword search. At query time the client picks
the dense vector to use, or the server auto-selects based on the
`embedding_config` requested.

> **Why two dense vectors?** Existing embedding schema
> (`gal-app/crates/warp_graphql_schema/api/schema.graphql`) enumerates
> `OPENAI_TEXT_SMALL_3_256` and `VOYAGE_*_512`. Until a single embedding
> provider is selected, both must be supported without re-indexing.

#### 5.1.2 Payload schema

```json
{
  "id": "01J...",                  // ULID, also Qdrant point ID
  "orgId": "sched-sys",            // tenant scope
  "repoScope": "example-org/example-repo",  // owner/repo, "" for org-only
  "sourceType": "go",              // go | rust | ts | py | md | issue | pr | adr | memory
  "sourceRef": {
    "kind": "github_file",         // github_file | github_issue | github_pr | memory_entry | adr
    "owner": "gal-run",
    "repo": "example-repo",
    "path": "auth-svc/cmd/server/main.go",
    "ref": "abc123",               // commit SHA / issue number / memory entry id
    "url": "https://github.com/..."
  },
  "chunk": {
    "index": 0,                    // ordinal in source document
    "total": 12,
    "byteStart": 1024,
    "byteEnd": 2048,
    "language": "go",
    "symbols": ["main", "handler"], // extracted function/type names
    "headings": ["Auth handlers"]   // for markdown: section headings
  },
  "content": "func (s *authService) login(...) { ... }",  // ≤ 8KB truncated
  "contentHash": "sha256:...",     // dedup key
  "tags": ["auth", "jwt"],
  "createdAt": 1717286400,         // unix seconds, indexed
  "updatedAt": 1717286400,
  "embeddingConfig": "VOYAGE_CODE_3_512",
  "tokenCount": 412
}
```

#### 5.1.3 Payload indexes (created on startup)

| Field | Type | Reason |
|---|---|---|
| `orgId` | `keyword` | Tenant filter (mandatory on every search) |
| `repoScope` | `keyword` | Repo-scoped retrieval (Layer 2 routing) |
| `sourceType` | `keyword` | Filter by asset type |
| `tags` | `keyword` (array) | Tag-based pre-filtering |
| `createdAt` | `integer` | Recency boosting, time-range filters |
| `embeddingConfig` | `keyword` | Filter to single embedding model |
| `sourceRef.url` | `keyword` | Lookup by canonical URL |

Indexes are created idempotently at service startup. A migration script
(`migrations/0001_init_indexes.json`) lists the canonical set for
out-of-band reconciliation.

---

## 6. Ingestion Pipeline

### 6.1 Data flow

```
GitHub webhook
    │
    ▼
repo-svc (existing)
    │  POST /webhooks/github
    ▼
gateway → /webhooks/github
    │
    ▼
repo-svc handler
    │  enqueue IngestJob (Postgres)
    ▼
gal-rag.IngestionWorker (goroutine pool, N=4)
    │
    ├──► git fetch (sparse checkout) for changed paths
    │
    ├──► chunker (code or markdown)
    │
    ├──► gal-model.Embed(chunks)        ── 256d + 512d vectors
    │
    ├──► dedup (contentHash → already-stored check)
    │
    ├──► Qdrant.upsert(batch, all named vectors + payload)
    │
    └──► mark IngestJob complete OR move to DLQ
```

For non-GitHub sources (memory entries, ADRs, agents writing learned
patterns), the same `IngestionWorker` is called directly via an internal
Go API (`gal-rag/internal/ingest.Enqueue`).

### 6.2 Chunker

Two chunker strategies, selected by file extension and source kind:

#### 6.2.1 Code chunker

- **Library:** `github.com/alecthomas/chroma/v2` (Go-native syntax tree
  chunker) for Go/Rust/TS/Python.
- **Strategy:** split on top-level functions, types, and methods. Fall back
  to 1200-token windows with 200-token overlap if a function exceeds the
  budget.
- **Metadata captured:** language, symbols, byte range, parent file.

#### 6.2.2 Markdown chunker

- **Strategy:** split on heading boundaries (`#`, `##`, `###`). Keep
  heading text in the chunk preamble. Target 800 tokens, 100-token overlap.
- **Metadata captured:** section headings, ADR number (if file is
  `docs/adr/NNNN-*.md`).

### 6.3 Deduplication

A chunk is uniquely identified by `sha256(orgId|repoScope|path|byteStart|byteEnd|contentHash)`.
The ingestion worker queries Qdrant by payload filter `contentHash` before
embedding. If a hit exists with the same `embeddingConfig`, the chunk is
skipped. This is an O(payload index) lookup — cheap, and avoids redundant
embedding spend on re-ingest.

For full repo re-indexing, a `force=true` flag bypasses the dedup check.

### 6.4 Backfill strategy

| Source | Strategy |
|---|---|
| Existing GitHub repos registered in repo-svc | Full clone, chunker over `*.go`, `*.rs`, `*.ts`, `*.py`, `*.md` under `src/`, `lib/`, `cmd/`, `docs/`, `README.md`. Bounded concurrency (4 workers per repo, 8 repos in parallel). |
| Existing Firestore `org_memory` | One-time migration: iterate `org_memory` collection, embed each entry, upsert with `sourceType=memory`. |
| Existing Firestore `memory_entries` (mal-svc) | One-time migration: same as above with `sourceType=memory`. |
| New GitHub pushes | Webhook-driven, incremental per changed file. |
| New `gal_write_memory` calls | Dual-write: existing Firestore write + gal-rag enqueue (best-effort, DLQ on failure). |

A CLI command `gal-rag backfill --repo owner/name [--path path]` triggers a
re-index of a specific repo. A `--all` flag iterates every registered repo.

### 6.5 Webhook integration

`repo-svc` already handles `/webhooks/github` and fans out to a queue
internally. We add a new event type to that queue: `repo_svc.events.ingest`
(carries `{owner, repo, ref, paths_changed}`). `gal-rag` subscribes via
either:

- (Preferred) Direct Postgres `LISTEN` on the same DB as repo-svc uses for
  its queue. Simple, no new infra.
- Alternative) New pub/sub topic `gal.ingest`. More moving parts, skip for
  v1.

---

## 7. Search API

### 7.1 REST contract (exposed at `/rag/*` via gateway)

All endpoints require a valid JWT (same auth chain as the rest of
the backend monorepo: `jwtauth.Verifier` + `jwtauth.Authenticator` + `auth.Middleware`).
The orgId claim scopes every request.

#### 7.1.1 `POST /rag/search` — hybrid search

**Request**

```json
{
  "query": "how do we propagate JWTs between services?",
  "embeddingConfig": "VOYAGE_CODE_3_512",
  "topK": 20,
  "filter": {
    "orgId": "sched-sys",                    // forced by JWT, do not allow override
    "repoScopes": ["example-org/example-repo"],
    "sourceTypes": ["go", "md"],
    "tags": ["auth"],
    "createdAfter": 1700000000
  },
  "ranking": {
    "vectorWeight": 0.7,
    "keywordWeight": 0.3,
    "recencyBoost": 0.1
  },
  "includeContent": false
}
```

**Response**

```json
{
  "results": [
    {
      "id": "01J...",
      "score": 0.87,
      "vectorScore": 0.92,
      "keywordScore": 0.41,
      "sourceRef": {
        "kind": "github_file",
        "owner": "gal-run",
        "repo": "example-repo",
        "path": "lib/httpclient/client.go",
        "url": "https://github.com/..."
      },
      "title": "lib/httpclient/client.go",
      "snippet": "...func (c *Client) do(req *http.Request, result any) error { if userID := auth.UserID(req.Context())...",
      "tags": ["httpclient", "auth"],
      "createdAt": 1717286400,
      "embeddingConfig": "VOYAGE_CODE_3_512"
    }
  ],
  "nextQuery": [
    "JWT raw token extraction",
    "auth.RawToken context key"
  ],
  "coverage": {
    "estimatedRecall": 0.78,
    "gaps": ["no results for 'mcp-gateway auth'"]
  }
}
```

#### 7.1.2 `POST /rag/get` — full content fetch (progressive disclosure)

```json
{
  "ids": ["01J...", "01J..."]
}
```

Returns the full `content` field (≤ 8KB) for each requested ID. This is
the **second step of the progressive disclosure pattern** (compact index →
get).

#### 7.1.3 `POST /rag/graph` — entity relationship expansion

Walks references between chunks (function calls, imports, ADR→spec links,
issue→PR links). Useful when an agent finds a starting chunk and needs the
surrounding graph.

**Request**

```json
{
  "seedIds": ["01J..."],
  "hops": 2,
  "edgeKinds": ["imports", "calls", "references", "implements"]
}
```

**Response**

```json
{
  "nodes": [{"id": "01J...", "label": "auth.Middleware", "depth": 0}],
  "edges": [{"from": "01J...", "to": "01J...", "kind": "calls"}]
}
```

Implemented by storing lightweight adjacency metadata in payload
(`chunk.symbols`, `chunk.imports`) and doing BFS in-memory with per-hop
Qdrant filter queries. Hard cap of 200 nodes per request to bound work.

#### 7.1.4 `POST /rag/timeline` — temporal view

Returns chunks for a source (file, issue, ADR) ordered by commit time, or
for a date range, returns chunks created/updated in that window.

```json
{
  "query": "auth middleware changes",
  "filter": { "repoScope": "example-org/example-repo" },
  "window": { "from": 1700000000, "to": 1717286400 },
  "bucket": "week"
}
```

Useful for "what changed recently" queries without committing to a full
graph traversal.

#### 7.1.5 `POST /rag/evaluate` — self-critique

Used by agents to score their own retrieval round and decide whether to
chain a follow-up query.

**Request**

```json
{
  "query": "how do we propagate JWTs between services?",
  "resultIds": ["01J...", "01J..."],
  "criteria": ["coverage", "freshness", "diversity"]
}
```

**Response**

```json
{
  "scores": {
    "coverage": 0.78,
    "freshness": 0.92,
    "diversity": 0.65
  },
  "verdict": "sufficient | needs_more | needs_reformulation",
  "suggestedNextQuery": "auth.Middleware implementation"
}
```

`coverage` is computed as the fraction of distinct symbols/topics in the
top-K results that overlap with the query tokens. `freshness` uses
`createdAt`. `diversity` uses the mean pairwise distance between result
vectors (low distance = redundant). The verdict is a deterministic rule
over the scores — `coverage < 0.5 OR diversity < 0.3 → needs_more` etc.

### 7.2 GraphQL contract (optional, v2)

The warp GraphQL schema enumerates embedding configs in the
`EmbeddingConfig` enum. We add three new root fields for parity with REST:

```graphql
type RootQuery {
  ragSearch(input: RagSearchInput!): RagSearchResult!
  ragGet(input: RagGetInput!): RagGetResult!
  ragEvaluate(input: RagEvaluateInput!): RagEvaluateResult!
}

input RagSearchInput {
  query: String!
  embeddingConfig: EmbeddingConfig!
  topK: Int = 20
  filter: RagFilterInput
  includeContent: Boolean = false
}
```

Schema lives next to the existing
[`schema.graphql`](../../web/gal-app/crates/warp_graphql_schema/api/schema.graphql)
in a new file `api/gal-rag.graphql` and is merged at codegen time.

### 7.3 Hybrid ranking algorithm

The `POST /rag/search` endpoint runs two Qdrant queries in parallel and
combines:

```
score(d) = α * vector_score(d)
         + β * keyword_score(d)
         + γ * recency_score(d)

where:
  vector_score(d)  = cosine(dense_q, dense_d)               ∈ [0, 1]
  keyword_score(d) = bm25(d, query_tokens)                  ∈ [0, 1], normalized
  recency_score(d) = exp(-Δ_seconds(d, now) / half_life)    ∈ (0, 1]
                     with half_life = 90 days default

defaults: α = 0.7, β = 0.3, γ = 0.1
```

Both sub-queries are scoped by the same `filter` block (org, repo,
sourceType, tags, time). Results are merged with a min-heap of size `topK`
by combined score. When the same document appears in both result sets
(rare with Qdrant point IDs), the higher of the two scores wins.

For the `sparse_bm25` vector we delegate to Qdrant's built-in BM25 scoring
(via the sparse vector path). This avoids running an external ranker.

### 7.4 Progressive disclosure (Layer 2 extension)

Per the memory routing spec, GAL queries follow this flow:

1. **Compact index** — `gal_rag_search` returns `{id, title, snippet,
   sourceRef, score, tags}` only. No `content` field unless
   `includeContent=true`.
2. **Filter by relevance** — agent inspects compact index, drops irrelevant
   IDs.
3. **Full content** — `gal_rag_get(ids=[...])` fetches `content` for the
   surviving IDs.

This is the same pattern `gal_memory_search` + `gal_memory_get` already
implements. `gal-rag` extends it with the `nextQuery` and `coverage` fields
in the compact response so the agent can decide whether to issue a
follow-up search **before** pulling full content — saving tokens on
clearly-empty result sets.

---

## 8. MCP Integration

### 8.1 New tools (additive, no breaking change)

| Tool | Role in agentic loop |
|---|---|
| `gal_rag_search` | Compact index (first call) |
| `gal_rag_get` | Full content for filtered IDs (progressive disclosure step 2) |
| `gal_rag_graph` | Multi-hop expansion when a seed chunk needs surrounding context |
| `gal_rag_timeline` | Temporal view (recent changes, history of a file) |
| `gal_rag_evaluate` | Self-critique of result quality (decides whether to chain) |

These tools are **exposed both ways**:

1. Through the existing `gal-mcp` (TypeScript) MCP server — add
   `registerRagTools(server, apiClient)` parallel to
   [`registerMemoryTools`](../../mcp/gal-mcp/src/tools/memory-tools.ts).
2. Through the Go `mcp-gateway` Streamable HTTP transport — register the
   same five tools as additional `mcpToolDefinitions` in
   `mcp-gateway/internal/handler/mcp.go` (next to the existing `memory`,
   `compliance`, `governance` tool defs).

### 8.2 Backward compatibility

`gal_memory_search` / `gal_read_memory` / `gal_write_memory` remain
unchanged. Their backing endpoints (Firestore via `team-svc` and `mal-svc`)
stay intact.

A recommended migration path for agent authors:

| Old call | New call (when semantic recall needed) |
|---|---|
| `gal_memory_search` (exact match) | `gal_rag_search` |
| `gal_memory_get` | `gal_rag_get` |
| `gal_read_memory` (full pull) | `gal_rag_search` (compact) + `gal_rag_get` (progressive) |
| `gal_write_memory` | `gal_write_memory` (unchanged; gal-rag enqueues ingestion worker best-effort) |

The two systems remain dual-writable from the agent's perspective: an
agent can call `gal_write_memory` for an exact-match entry and then call
`gal_rag_search` later to find it semantically. gal-rag's ingestion worker
is the bridge — it watches `org_memory` and `memory_entries` for new
documents and ingests them.

### 8.3 Agentic retrieval patterns

The five tools compose into common patterns the agent can execute
without human guidance:

#### 8.3.1 Multi-hop retrieval

```
agent:  call gal_rag_search("JWT propagation")
        → returns 5 chunks, score > 0.7
        call gal_rag_graph(seedIds=top2, hops=2, edgeKinds=["imports","calls"])
        → expands to 12 nodes
        call gal_rag_evaluate(query, allResultIds, ["coverage","diversity"])
        → verdict: needs_more, suggestedNextQuery: "auth.Middleware implementation"
        call gal_rag_search(suggestedNextQuery, topK=10)
        → returns 6 more chunks
        call gal_rag_get(survivingIds)
        → full content for context
```

#### 8.3.2 Coverage gap detection

`gal_rag_search` returns `coverage.gaps` and `nextQuery` in the compact
response. The agent should treat these as **first-class** inputs to the
next iteration, not afterthoughts. A `gal-rag` client wrapper
(`internal/agentic/loop.go`) can enforce this:

```go
for iter := 0; iter < maxHops; iter++ {
    res, _ := rag.Search(ctx, q, filter)
    if evaluate(res, q).Verdict == "sufficient" {
        return rag.Get(ctx, compact(res))
    }
    q = res.NextQuery[0]
}
```

#### 8.3.3 Session-aware filtering

Every MCP tool call carries the `sessionId` (already plumbed through
`memory-tools.ts` via `getStoredSessionId()`). `gal-rag` filters by
session-scoped writes (memory entries tagged with the session) on top of
org/repo scope. This matches the "peer activity" pattern already in
`gal_get_peer_activity`.

### 8.4 Existing tool extensions (optional)

We do **not** modify the existing `gal_memory_search` / `gal_memory_get`
signatures. The five new tools are the public surface. If we later decide
to add a `denseVector` field to compact memory results (Firestore), that
is a separate change to `team-svc` and out of scope here.

---

## 9. Error Handling & Observability

### 9.1 Error contract

All errors follow the existing `contracts.APIError` shape used across
the backend monorepo:

```go
type APIError struct {
    Error   string `json:"error"`
    Code    string `json:"code,omitempty"`
    Details any    `json:"details,omitempty"`
}
```

`gal-rag`-specific codes:

| Code | HTTP | Cause |
|---|---|---|
| `RAG_FILTER_FORBIDDEN` | 403 | Request attempted to override `orgId` claim |
| `RAG_INVALID_EMBEDDING_CONFIG` | 400 | Unknown `embeddingConfig` value |
| `RAG_QDRANT_UNAVAILABLE` | 503 | Qdrant cluster unreachable |
| `RAG_MODEL_UNAVAILABLE` | 503 | gal-model embedding service down |
| `RAG_TIMEOUT` | 504 | Qdrant query exceeded 5s budget |
| `RAG_INGEST_FAILED` | 500 | Ingestion job permanently failed (DLQ) |
| `RAG_INGEST_RETRYING` | 202 | Ingestion job enqueued, retry in progress |

### 9.2 Retries

- **External (Qdrant, gal-model):** exponential backoff with jitter
  (`github.com/cenkalti/backoff/v5`, already in `go.sum` as indirect).
  - Initial: 200ms, max: 30s, max attempts: 5
  - Per-request deadline: 5s for search, 30s for ingestion
- **Internal (ingestion worker):** failed jobs are re-enqueued with
  exponential backoff up to 3 attempts, then moved to the DLQ table.
- **Webhook delivery (GitHub → repo-svc → gal-rag):** no change. repo-svc
  already handles webhook redelivery per GitHub's retry contract.

### 9.3 Dead letter queue

- **Storage:** Postgres table `gal_rag_dlq` with columns `id`, `payload`,
  `last_error`, `attempts`, `first_seen_at`, `last_seen_at`,
  `quarantined_at`.
- **Trigger:** 3 failed ingestion attempts, or a permanent error
  (unparseable content, embedding dimension mismatch, payload too large).
- **Operations:** a `gal-rag dlq list` / `dlq replay <id>` /
  `dlq discard <id>` subcommand on the binary.
- **Metrics:** DLQ depth exposed at `/metrics`; alert at depth > 50.

### 9.4 Observability

#### 9.4.1 Logging

All logs flow through `lib/telemetry.Logger()` — structured slog JSON
to stdout, picked up by Cloud Logging. Every log line includes:

- `service: "gal-rag"`
- `orgId` (when available)
- `requestId` (chi middleware)
- `traceId` / `spanId` (OTLP propagation)

Log levels: `LOG_LEVEL=debug` for dev, `info` for prod.

#### 9.4.2 Metrics (Prometheus at `/metrics`)

| Metric | Type | Labels |
|---|---|---|
| `gal_rag_search_requests_total` | counter | `embedding_config`, `result_count_bucket` |
| `gal_rag_search_duration_seconds` | histogram | `embedding_config` |
| `gal_rag_ingest_jobs_total` | counter | `source_type`, `status` |
| `gal_rag_ingest_job_duration_seconds` | histogram | `source_type` |
| `gal_rag_dlq_depth` | gauge | — |
| `gal_rag_qdrant_query_errors_total` | counter | `error_code` |
| `gal_rag_embedding_api_calls_total` | counter | `model`, `status` |

The gateway already aggregates `/health` from all services; we add
`gal-rag` to that loop in `gateway-deployment.yaml`'s `metricsHandler`.

#### 9.4.3 Tracing

OTLP traces via `lib/telemetry.InitTracer("gal-rag")`. Spans cover:

- `rag.search` (parent) → `qdrant.dense_query` + `qdrant.sparse_query` (children)
- `rag.ingest` (parent) → `gal_model.embed` + `qdrant.upsert` (children)
- `rag.graph.expand` (parent) → per-hop `qdrant.filter_query` (children)

Trace context is propagated through the existing W3C `traceparent` header
chain that the gateway already supports.

---

## 10. Local Dev Setup

### 10.1 Prerequisites

- Go 1.25+ (matches the backend monorepo)
- Docker (for Qdrant via the existing
  [`dev/docker-compose.yml`](./dev/docker-compose.yml))
- A running gal-model instance OR `OPENAI_API_KEY` / `VOYAGE_API_KEY` env
  for direct embedding API access
- Firestore credentials OR the Firestore emulator
- `JWT_SECRET` matching other services

### 10.2 First-run

```bash
cd "$HOME/gal-run/backend/gal-rag"

# 1. Start Qdrant
cd dev && docker compose up -d && cd ..
curl http://localhost:6333/healthz   # expect {"status":"ok"}

# 2. Create Postgres DB for ingestion jobs + DLQ
createdb gal_rag

# 3. Run migrations
psql -d gal_rag -f migrations/0001_init.sql

# 4. Start gal-rag (reads from ../../lib for shared packages)
JWT_SECRET=dev-secret \
DATABASE_URL=postgres://localhost/gal_rag?sslmode=disable \
QDRANT_URL=http://localhost:6333 \
GAL_MODEL_URL=http://localhost:9000 \
go run ./cmd/server/

# 5. Verify
curl http://localhost:8090/health        # gal-rag's port
curl http://localhost:8090/metrics
```

### 10.3 Backfill a repo (CLI)

```bash
# Same binary exposes a CLI subcommand
go run ./cmd/server/ backfill --repo example-org/example-repo --path auth-svc
go run ./cmd/server/ backfill --all
```

### 10.4 Inspecting Qdrant

Open `http://localhost:6333/dashboard` for the built-in Qdrant UI. The
`gal_rag_chunks` collection will appear after the first ingest.

### 10.5 Running tests

```bash
go test ./...                              # unit tests
go test -tags=integration ./test/integration/...   # spins up qdrant + postgres containers
```

Integration tests use `testcontainers-go` to launch ephemeral Qdrant +
Postgres instances — no external dependencies.

### 10.6 Running with the full backend stack

gal-rag plugs into the existing Stratus manifests. To add to the dev
overlay:

1. Create `stratus/base/gal-rag-deployment.yaml` and `gal-rag-svc.yaml`
   matching the pattern of `mal-deployment.yaml`.
2. Add `QDRANT_URL`, `GAL_MODEL_URL`, `DATABASE_URL` to
   `stratus/base/external-secrets.yaml`.
3. Add `/rag/*` routes to `gateway/cmd/server/main.go`'s `mountProxy`
   block (alongside the existing `/mal/*` and `/mcp/*` mounts).
4. Add `gal-rag` to `gateway/cmd/server/main.go`'s `serviceURLs` struct
   and `metricsHandler` checks.

---

## 11. Local Dev Stack Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  developer machine                                          │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │  gal-rag     │  │  backend-svcs │  │  Qdrant          │   │
│  │  (this)      │  │  (existing)  │  │  (docker)        │   │
│  │  :8090       │  │  :8080       │  │  :6333 / :6334   │   │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘   │
│         │                 │                   │             │
│         │    ┌────────────┴────────────┐      │             │
│         └───►│  gal-model (sidecar)    │      │             │
│              │  :9000 (embeddings)     │      │             │
│              └─────────────────────────┘      │             │
│                                              │             │
│  ┌──────────────┐                             │             │
│  │  Postgres    │◄────────────────────────────┘             │
│  │  :5432       │  (ingestion queue + DLQ)                 │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘
```

### 11.1 Ports and URLs

| Service | Port | URL |
|---|---|---|
| gal-rag REST | 8090 | `http://localhost:8090` |
| gal-rag gRPC (Qdrant client) | n/a | uses go-client default |
| Qdrant REST | 6333 | `http://localhost:6333` |
| Qdrant gRPC | 6334 | `http://localhost:6334` |
| Qdrant Dashboard | 6333 | `http://localhost:6333/dashboard` |
| gal-model (sidecar) | 9000 | `http://localhost:9000` |
| the backend monorepo gateway | 8080 | `http://localhost:8080` |
| Postgres | 5432 | `postgres://localhost:5432/gal_rag` |

---

## 12. File Layout

```
gal-rag/
├── TECH.md                       (this file)
├── README.md                     (quickstart, links to TECH.md)
├── go.mod
├── go.sum
├── Dockerfile                    (matches the backend monorepo pattern)
├── cmd/
│   └── server/
│       ├── main.go               (HTTP server + worker bootstrap)
│       └── main_test.go
├── dev/
│   ├── docker-compose.yml        (Qdrant + Postgres for local)
│   └── README.md
├── migrations/
│   └── 0001_init.sql             (jobs, dlq tables)
├── internal/
│   ├── api/                      (chi handlers, GraphQL if/when added)
│   ├── auth/                     (re-exports lib/auth helpers)
│   ├── chunk/                    (code + markdown chunkers)
│   ├── ingest/                   (worker, dedup, enqueue)
│   ├── search/                   (Qdrant query, hybrid ranker, evaluate)
│   ├── mcp/                      (tool definitions for mcp-gateway)
│   ├── agentic/                  (loop helpers: Search → Evaluate → Re-search)
│   ├── embeddings/               (gal-model client)
│   ├── qdrant/                   (collection, payload schema, indexes)
│   ├── store/                    (Postgres job/DLQ store)
│   ├── telemetry/                (re-exports lib/telemetry)
│   └── contracts/                (RagSearchRequest, RagResult, etc.)
└── test/
    └── integration/              (testcontainers-go based)
```

The module path is `github.com/gal-run/gal/services/gal-rag` (lives in the
existing monorepo as a sub-package; it imports `lib/...` from the parent
module). This is consistent with how `mcp-gateway/internal/...` is laid
out in the same monorepo.

---

## 13. Milestones

| ID | Milestone | Depends on |
|---|---|---|
| M1 | Local Qdrant + Postgres running, `gal_rag_chunks` collection + indexes created | (Task #2 done) |
| M2 | Code + markdown chunkers pass unit tests with golden files | M1 |
| M3 | gal-model client integration; embeddings cached by content hash | M2 |
| M4 | GitHub webhook → ingestion worker → Qdrant upsert (E2E for one repo) | M1, M3 |
| M5 | `POST /rag/search` returns hybrid results, scoring matches offline eval | M4 |
| M6 | `gal_rag_*` MCP tools registered in `gal-mcp` (TS) and `mcp-gateway` (Go) | M5 |
| M7 | Backfill script migrates one real repo (example-org/example-repo) | M4 |
| M8 | Stratus manifest + gateway route + `/metrics` integration | M5 |
| M9 | Self-host on dev cluster, smoke test with real Claude session | M6, M7, M8 |

---

## 14. Open Questions

1. **Embedding model selection:** do we default to Voyage code-3 for code
   and OpenAI small-3 for markdown, or one model for both? Carrying both
   doubles embedding spend but preserves choice. **Recommendation:** start
   with both populated, evaluate offline, retire the loser after M5.
2. **Chunk size:** 800 vs 1200 tokens for markdown, with what overlap?
   Needs offline eval against the memory routing spec's "95% of writes
   land correctly on first attempt" success metric.
3. **Graph edges:** do we precompute `imports` / `calls` edges at ingest
   time, or compute on demand from chunk symbols? Precompute is faster at
   query time but adds ingest cost. **Recommendation:** precompute for
   `imports` (cheap, static), compute on demand for `calls` (expensive,
   dynamic).
4. **DLQ retention:** how long do we keep quarantined entries? 30 days
   seems reasonable; needs ops confirmation.
5. **Multi-region:** Qdrant is single-region for v1. Stratus runs in
   `us-central1`; if we add an EU region later, vector replication is
   non-trivial. Out of scope for v1.

---

## 15. References

- RFC: internal design note
- Memory routing spec: `.tmp/gal-memory-routing-spec.md`
- Embedding schema enum: `gal-run/web/gal-app/crates/warp_graphql_schema/api/schema.graphql`
- Existing memory tools: `gal-run/mcp/gal-mcp/src/tools/memory-tools.ts`
- Go services README: `the backend services README`
- Shared lib (auth, firestore, telemetry, handler, httpclient): `the shared backend lib`
- Qdrant dev setup: `gal-rag/dev/README.md`
- Dev compose: `gal-rag/dev/docker-compose.yml`
