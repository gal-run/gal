# gal-rag DEV

This file documents the local-dev workflow for the gal-rag search API
(Task #4). It is intentionally short — the production deployment guide
lives in [`TECH.md`](./TECH.md).

## Prerequisites

- Go 1.25+
- Docker (for Qdrant + Postgres)
- A JWT signing secret. For local dev any non-empty value will do; the
  tests in this directory use `test-secret`.

## 1. Start the dependencies

```bash
cd dev
docker compose up -d
curl http://localhost:6333/healthz      # expect {"status":"ok"}

# Postgres is started by Task #3's bootstrap. If you don't have it yet:
#   createdb gal_rag
#   psql -d gal_rag -f ../migrations/0001_init.sql
```

## 2. Create the Qdrant collection (one-time)

```bash
for field in orgId repoScope sourceType createdAt tags embeddingConfig; do
  curl -X PUT "http://localhost:6333/collections/gal_rag_chunks/index" \
    -H "Content-Type: application/json" \
    -d "{\"field_name\": \"$field\"}"
done
```

The collection itself is created lazily by the first upsert; you can
also create it explicitly via the Qdrant UI at <http://localhost:6333/dashboard>.

## 3. Generate a dev JWT

`auth/jwtauth` expects `HS256` with a shared `JWT_SECRET`. For local
curl calls you can use this one-liner:

```bash
JWT_SECRET=test-secret
# Generates a token with org_id=sched-sys that the auth chain accepts.
TOKEN=$(go run ./scripts/mint_jwt/main.go -secret "$JWT_SECRET" -org sched-sys)
echo "$TOKEN"
```

(Or copy a real Firebase-issued JWT from your dev environment.)

## 4. Boot the service

```bash
JWT_SECRET=test-secret \
QDRANT_URL=http://localhost:6333 \
DATABASE_URL=postgres://localhost:5432/gal_rag?sslmode=disable \
go run ./cmd/server
```

The service listens on `:8090` (overridable via `PORT`).

## 5. Curl examples

The first three examples assume a single ingested chunk for testing:

```bash
curl -X PUT http://localhost:6333/collections/gal_rag_chunks/points?wait=true \
  -H "Content-Type: application/json" \
  -d '{
    "points": [
      {
        "id": "01HFIX1",
        "vector": [0.1, 0.2, 0.3, 0.4],
        "payload": {
          "id": "01HFIX1",
          "orgId": "sched-sys",
          "repoScope": "gal-run/backend/go-services",
          "sourceType": "md",
          "content": "JWT propagation in gal-rag uses lib/auth.Middleware.",
          "contentHash": "sha256:abc",
          "tags": ["auth", "jwt"],
          "createdAt": 1700000000,
          "updatedAt": 1700000000,
          "embeddingConfig": "VOYAGE_CODE_3_512",
          "sourceRef": {"kind": "github_file", "path": "README.md"},
          "chunk": {"index": 0, "total": 1, "symbols": ["auth.Middleware"], "headings": []}
        }
      }
    ]
  }'
```

### 5.1 `GET /health`

```bash
curl -s http://localhost:8090/health
# {"status":"ok","service":"gal-rag"}
```

### 5.2 `POST /rag/search`

```bash
curl -s -X POST http://localhost:8090/rag/search \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "JWT propagation",
    "embeddingConfig": "VOYAGE_CODE_3_512",
    "topK": 5,
    "filter": {
      "orgId": "sched-sys",
      "repoScopes": ["gal-run/backend/go-services"]
    },
    "includeContent": true
  }'
```

Expected response shape:

```json
{
  "results": [
    {
      "id": "01HFIX1",
      "score": 0.87,
      "vectorScore": 0.92,
      "keywordScore": 0.41,
      "sourceRef": {"kind": "github_file", "path": "README.md"},
      "title": "README.md",
      "snippet": "JWT propagation in gal-rag uses lib/auth.Middleware.",
      "tags": ["auth", "jwt"],
      "createdAt": 1700000000,
      "embeddingConfig": "VOYAGE_CODE_3_512"
    }
  ],
  "nextQuery": [],
  "coverage": {"estimatedRecall": 1.0, "gaps": []}
}
```

### 5.3 `POST /rag/get`

```bash
curl -s -X POST http://localhost:8090/rag/get \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ids": ["01HFIX1"]}'
```

### 5.4 `POST /rag/graph`

```bash
curl -s -X POST http://localhost:8090/rag/graph \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "seedIds": ["01HFIX1"],
    "hops": 2,
    "edgeKinds": ["imports", "calls"]
  }'
```

### 5.5 `POST /rag/timeline`

```bash
curl -s -X POST http://localhost:8090/rag/timeline \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "JWT propagation",
    "filter": {"orgId": "sched-sys"},
    "window": {"from": 1699999999, "to": 1717286400, "bucket": "week"}
  }'
```

### 5.6 `POST /rag/evaluate`

```bash
curl -s -X POST http://localhost:8090/rag/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "JWT propagation",
    "resultIds": ["01HFIX1"],
    "criteria": ["coverage", "freshness", "diversity"]
  }'
```

Expected response shape:

```json
{
  "scores": {"coverage": 1.0, "freshness": 0.95, "diversity": 1.0},
  "verdict": "sufficient",
  "suggestedNextQuery": ""
}
```

### 5.7 `RAG_FILTER_FORBIDDEN` — 403 demo

```bash
curl -i -X POST http://localhost:8090/rag/search \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "JWT propagation",
    "filter": {"orgId": "evil-org"}
  }'
# HTTP/1.1 403 Forbidden
# {"error":"filter.orgId must match JWT claim; override is forbidden","code":"RAG_FILTER_FORBIDDEN"}
```

## 6. Unit tests

```bash
go test ./internal/search/... ./internal/qdrant/mock/... ./internal/auth/...
```

Integration tests (require a live Qdrant + Postgres):

```bash
go test -tags=integration ./test/integration/...
```
