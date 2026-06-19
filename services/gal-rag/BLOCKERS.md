# gal-rag Task #3 — Blockers and Coordination Notes

This file documents open questions and coordination handoffs for the
ingestion-pipeline work. Last updated: 2026-06-02.

## Blockers (none blocking compilation)

1. **`search.Searcher` interface requires a `Delay() time.Duration`
   method.** Task #4 added this for test-mock control. The stub
   Searcher wired in `cmd/server/main.go` returns `0`; replace with the
   real `qdrant/httpsearch` HTTP client once Task #4 lands it.

2. **`qdrant/httpsearch` package was not present at integration time.**
   The stub `*stubSearcher` in main.go implements the
   `search.Searcher` interface and returns empty results, so the
   binary boots and `/health` / `/metrics` / webhooks serve. To wire
   the production searcher, swap `newStubSearcher()` for
   `httpsearch.New(QDRANT_URL, QDRANT_API_KEY, QDRANT_VECTOR)` once
   that package ships.

3. **No `go.mod` lives in `gal-rag/`.** The package is a sub-tree of
   the parent `go-services` monorepo, which has a single `go.mod`. The
   task brief mentioned `go.work` but none exists. `go build
   ./gal-rag/...` and `go test ./gal-rag/...` work from the parent
   directory.

## Coordination handoffs

- **Task #4 (search API)** — The webhook surface and admin endpoints
  are mounted in `api.NewServer(ServerOptions)`. The search surface
  hangs off `api.NewSearchHandlers(searcher, log).Routes(ja)`.
  `cmd/server/main.go` mounts both via `chi.Mount("/", ...)`. The
  Searcher interface is in `internal/search/searcher.go` (owned by
  Task #4); the ingestion pipeline does not call into it.

- **Task #5 (MCP tools)** — The `Upserter` interface in
  `internal/ingest/worker.go` is the only seam the worker needs into
  the vector store. A future gRPC-based Upserter can replace
  `QdrantHTTPUpserter` without touching the worker.

- **Task #6 (tests & docs)** — Unit tests live in:
  - `internal/chunk/code_test.go` (function-boundary chunking, sliding
    window, empty-source)
  - `internal/chunk/markdown_test.go` (heading split, ADR detection,
    fence handling, windowed split)
  - `internal/ingest/enqueue_test.go` (ContentHash stability, source
    type inference, canonical URL, NoopUpserter)
  - `internal/auth/middleware_test.go` (Task #4, pre-existing)

  Integration test stub: `test/integration/ingest_test.go` (gated
  by `//go:build integration`).

## What was deleted during this PR

- `internal/contracts/types.go` was overwritten by my new
  `internal/contracts/contracts.go` (same canonical DTOs, with
  `search.go` holding the additive types Task #4's search package
  needs). The contents are equivalent for the wire JSON shape.

- The original `internal/api/server.go` and `cmd/server/main.go` (from
  Task #4's first scaffold pass) were replaced with the final
  ingestion-aware versions.

- `internal/qdrant/client.go` and `internal/qdrant/payload.go` (a
  gRPC-based Qdrant client) were removed. Their function is fulfilled
  by `internal/ingest/qdrant_http.go` (REST-based Upserter), which is
  the worker side of the same surface.

## Known issues NOT introduced by this PR

- `internal/search/evaluate_test.go` references a `twoFresh` helper
  that the rest of the file does not define. This is a pre-existing
  Task #4 test issue; the test binary does not compile as a result.
  Out of scope for Task #3.

- `mcp-svc/internal/client/api.go` references HTTP methods
  (`Put`, `DeleteWithBody`) that don't exist on the `lib/httpclient`
  client. This was broken on `main` before this PR (verified via
  `git stash` round-trip) and is unrelated to gal-rag.
