package ingest

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
)

// QdrantHTTPConfig is the minimal set of settings QdrantHTTPUpserter
// needs to talk to a Qdrant cluster over its REST API.
type QdrantHTTPConfig struct {
	BaseURL string // e.g. http://localhost:6333
	APIKey  string // optional
	// CollectionName matches the qdrant.CollectionName constant in
	// TECH.md §5.1. Defaults to "gal_rag_chunks".
	CollectionName string
}

// QdrantHTTPUpserter writes points to Qdrant via its REST API. It is
// the production Upserter that the worker pool uses; tests can pass a
// NoopUpserter or an in-memory fake.
type QdrantHTTPUpserter struct {
	cfg    QdrantHTTPConfig
	client *http.Client
}

// NewQdrantHTTPUpserter returns an Upserter backed by the Qdrant REST
// API. If cfg.BaseURL is empty, QDRANT_URL is consulted.
func NewQdrantHTTPUpserter(cfg QdrantHTTPConfig) *QdrantHTTPUpserter {
	if cfg.BaseURL == "" {
		cfg.BaseURL = os.Getenv("QDRANT_URL")
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "http://localhost:6333"
	}
	if cfg.CollectionName == "" {
		cfg.CollectionName = "gal_rag_chunks"
	}
	return &QdrantHTTPUpserter{
		cfg:    cfg,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// Upsert writes a batch of points to Qdrant. The REST payload shape
// follows the qdrant HTTP API: PUT /collections/{name}/points.
func (u *QdrantHTTPUpserter) Upsert(ctx context.Context, points []*Point) error {
	if len(points) == 0 {
		return nil
	}
	body := qdrantPointsRequest{Points: make([]qdrantPointBody, 0, len(points))}
	for _, p := range points {
		body.Points = append(body.Points, qdrantPointBody{
			ID:      p.ID,
			Vector:  qdrantDenseVector{OpenAI256: p.OpenAI256, Voyage512: p.Voyage512},
			Payload: buildPayload(p),
		})
	}
	raw, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/collections/%s/points?wait=true", u.cfg.BaseURL, u.cfg.CollectionName)
	req, _ := http.NewRequestWithContext(ctx, "PUT", url, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	if u.cfg.APIKey != "" {
		req.Header.Set("api-key", u.cfg.APIKey)
	}
	resp, err := u.client.Do(req)
	if err != nil {
		return fmt.Errorf("qdrant upsert: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		buf, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("qdrant upsert %d: %s", resp.StatusCode, string(buf))
	}
	return nil
}

// ExistsByContentHash returns true if a point with the same
// (orgId, contentHash) already exists in the collection.
func (u *QdrantHTTPUpserter) ExistsByContentHash(ctx context.Context, orgID, contentHash string) (bool, error) {
	body := map[string]any{
		"filter": map[string]any{
			"must": []map[string]any{
				{"key": "orgId", "match": map[string]any{"value": orgID}},
				{"key": "contentHash", "match": map[string]any{"value": contentHash}},
			},
		},
		"exact": true,
	}
	raw, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/collections/%s/points/count", u.cfg.BaseURL, u.cfg.CollectionName)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	if u.cfg.APIKey != "" {
		req.Header.Set("api-key", u.cfg.APIKey)
	}
	resp, err := u.client.Do(req)
	if err != nil {
		return false, fmt.Errorf("qdrant count: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		buf, _ := io.ReadAll(resp.Body)
		return false, fmt.Errorf("qdrant count %d: %s", resp.StatusCode, string(buf))
	}
	var out struct {
		Result struct {
			Count int `json:"count"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return false, err
	}
	return out.Result.Count > 0, nil
}

// DeleteByContentHash removes any point with the matching pair.
func (u *QdrantHTTPUpserter) DeleteByContentHash(ctx context.Context, orgID, contentHash string) error {
	body := map[string]any{
		"filter": map[string]any{
			"must": []map[string]any{
				{"key": "orgId", "match": map[string]any{"value": orgID}},
				{"key": "contentHash", "match": map[string]any{"value": contentHash}},
			},
		},
	}
	raw, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/collections/%s/points/delete?wait=true", u.cfg.BaseURL, u.cfg.CollectionName)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	if u.cfg.APIKey != "" {
		req.Header.Set("api-key", u.cfg.APIKey)
	}
	resp, err := u.client.Do(req)
	if err != nil {
		return fmt.Errorf("qdrant delete: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		buf, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("qdrant delete %d: %s", resp.StatusCode, string(buf))
	}
	return nil
}

// EnsureInterfaceSatisfied is a compile-time assertion that
// QdrantHTTPUpserter implements Upserter.
var _ Upserter = (*QdrantHTTPUpserter)(nil)

// ─── wire shape (mirrors the qdrant HTTP upsert contract) ──────────────

type qdrantPointsRequest struct {
	Points []qdrantPointBody `json:"points"`
}

type qdrantDenseVector struct {
	OpenAI256 []float32 `json:"dense_openai_256,omitempty"`
	Voyage512 []float32 `json:"dense_voyage_512,omitempty"`
}

type qdrantPointBody struct {
	ID      string         `json:"id"`
	Vector  qdrantDenseVector `json:"vector"`
	Payload map[string]any `json:"payload"`
}

func buildPayload(p *Point) map[string]any {
	// Truncate content to 8KB.
	content := p.Content
	if len(content) > 8*1024 {
		content = content[:8*1024] + "\n…[truncated]"
	}
	return map[string]any{
		"id":              p.ID,
		"orgId":           p.OrgID,
		"repoScope":       p.RepoScope,
		"sourceType":      p.SourceType,
		"sourceRef":       sourceRefToMap(p.SourceRef),
		"chunk": map[string]any{
			"index":     p.Chunk.Index,
			"total":     p.Chunk.Total,
			"byteStart": p.Chunk.ByteStart,
			"byteEnd":   p.Chunk.ByteEnd,
			"language":  p.Chunk.Language,
			"symbols":   stringSliceAny(p.Chunk.Symbols),
			"headings":  stringSliceAny(p.Chunk.Headings),
		},
		"content":         content,
		"contentHash":     p.ContentHash,
		"tags":            stringSliceAny(p.Tags),
		"createdAt":       p.CreatedAt,
		"updatedAt":       p.UpdatedAt,
		"embeddingConfig": p.EmbeddingConfig,
		"tokenCount":      p.TokenCount,
	}
}

func sourceRefToMap(ref contracts.SourceRef) map[string]any {
	m := map[string]any{"kind": ref.Kind}
	if ref.Owner != "" {
		m["owner"] = ref.Owner
	}
	if ref.Repo != "" {
		m["repo"] = ref.Repo
	}
	if ref.Path != "" {
		m["path"] = ref.Path
	}
	if ref.Ref != "" {
		m["ref"] = ref.Ref
	}
	if ref.URL != "" {
		m["url"] = ref.URL
	}
	return m
}

func stringSliceAny(s []string) []any {
	if s == nil {
		return []any{}
	}
	out := make([]any, len(s))
	for i, v := range s {
		out[i] = v
	}
	return out
}

// IsQdrantNotFound is a small helper for callers that want to surface a
// 404 separately from other non-2xx responses.
func IsQdrantNotFound(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "not found")
}
