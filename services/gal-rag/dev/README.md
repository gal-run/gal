# gal-rag Qdrant Dev Environment

Local Qdrant instance for developing and testing the gal-rag retrieval service.

---

## Quick Start

```bash
cd "$HOME/gal-run/backend/gal-rag/dev"

# Start Qdrant
docker compose up -d

# Verify health
curl http://localhost:6333/healthz

# Stop Qdrant
docker compose down

# Stop and remove data volume (destructive)
docker compose down -v
```

---

## Default Ports and URLs

| Service | Port | URL |
|---------|------|-----|
| REST API | 6333 | http://localhost:6333 |
| gRPC | 6334 | http://localhost:6334 |
| Web UI | 6333 | http://localhost:6333/dashboard |

---

## Health Check

```bash
# Liveness probe
curl http://localhost:6333/healthz
# Expected: {"status":"ok"}

# Full readiness (checks all components)
curl http://localhost:6333/readyz
# Expected: {"status":"ok"}

# Cluster / telemetry info
curl http://localhost:6333/
```

---

## Create a Test Collection

```bash
# Create a collection with a 384-dim dense vector (e.g. all-MiniLM-L6-v2)
curl -X PUT http://localhost:6333/collections/test_chunks \
  -H "Content-Type: application/json" \
  -d '{
    "vectors": {
      "size": 384,
      "distance": "Cosine"
    },
    "optimizers_config": {
      "default_segment_number": 2
    }
  }'

# Upsert a test point
curl -X PUT http://localhost:6333/collections/test_chunks/points?wait=true \
  -H "Content-Type: application/json" \
  -d '{
    "points": [
      {
        "id": 1,
        "vector": [0.1, 0.2, 0.3, 0.4],
        "payload": {
          "orgId": "sched-sys",
          "repoScope": "gal-run/backend/go-services",
          "sourceType": "go",
          "createdAt": "2026-06-02T00:00:00Z",
          "content": "func main() {}"
        }
      }
    ]
  }'

# Search
curl -X POST http://localhost:6333/collections/test_chunks/points/search \
  -H "Content-Type: application/json" \
  -d '{
    "vector": [0.1, 0.2, 0.3, 0.4],
    "limit": 5,
    "filter": {
      "must": [
        { "key": "orgId", "match": { "value": "sched-sys" } }
      ]
    }
  }'

# Delete the test collection
curl -X DELETE http://localhost:6333/collections/test_chunks
```

---

## Collection Strategy Recommendation

For gal-rag we recommend a **single shared collection with payload filtering** rather than separate collections per org or repo.

**Rationale**

| Approach | Pros | Cons |
|----------|------|------|
| **Shared collection + payload filter** (recommended) | One schema to maintain; easy cross-repo/org search; simpler backups; scales with single HNSW index | Slightly larger index; requires careful payload indexing |
| Separate collection per org/repo | Natural isolation; smaller per-collection indexes | Schema drift across collections; harder global search; operational overhead |

**Shared collection name:** `gal_rag_chunks`

**Required payload indexes for hybrid search**

| Field | Index Type | Purpose |
|-------|------------|---------|
| `orgId` | keyword | Tenant isolation, multi-tenancy filtering |
| `repoScope` | keyword | Repository-scoped retrieval |
| `sourceType` | keyword | Filter by language or asset type (go, rust, md, etc.) |
| `createdAt` | integer (timestamp) | Time-range filtering, recency boosting |

Create the indexes after collection creation:

```bash
for field in orgId repoScope sourceType createdAt; do
  curl -X PUT "http://localhost:6333/collections/gal_rag_chunks/index" \
    -H "Content-Type: application/json" \
    -d "{\"field_name\": \"$field\"}"
done
```

---

## Client Libraries

### Go

- **Package:** `github.com/qdrant/go-client`
- **Recommended version:** `v1.15.0` (matches server version)
- **Install:**
  ```bash
  go get github.com/qdrant/go-client@v1.15.0
  ```
- **Notes:** gRPC-based; supports all Qdrant operations including hybrid search and sparse vectors.

### Rust

- **Crate:** `qdrant-client`
- **Recommended version:** `1.15.0` (matches server version)
- **Install:**
  ```toml
  [dependencies]
  qdrant-client = "1.15"
  ```
- **Notes:** Async-first, built on `tonic`. Feature flags for `reqwest` (REST fallback) if needed.

---

## Resource Limits

The compose file caps Qdrant at **2 GB RAM** with a **512 MB reservation**. Adjust in `docker-compose.yml` if your dev machine has more or less headroom:

```yaml
deploy:
  resources:
    limits:
      memory: 2G
    reservations:
      memory: 512M
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Port 6333 already in use | Change the host port in `docker-compose.yml`: `"6333:6333"` -> `"6335:6333"` |
| Out of memory on startup | Lower the memory limit to `1G` or increase Docker Desktop RAM allocation |
| Data persists across restarts | Normal — stored in named volume `qdrant-storage`. Use `docker compose down -v` to wipe |
| Web UI not loading | Ensure you visit `http://localhost:6333/dashboard` (trailing path required) |
