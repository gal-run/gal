// Package httpsearch implements search.Searcher against Qdrant's REST API.
// It pairs with the ingest.QdrantHTTPUpserter: same collection, same payload
// schema (TECH.md §5.1.2), same REST transport choice.
package httpsearch

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
	"github.com/gal-run/gal/services/gal-rag/internal/embeddings"
)

const defaultCollection = "gal_rag_chunks"

// Config holds the connection settings for the Qdrant HTTP search client.
type Config struct {
	BaseURL        string           // e.g. http://localhost:6333; fallback: QDRANT_URL env
	APIKey         string           // optional; fallback: QDRANT_API_KEY env
	CollectionName string           // defaults to "gal_rag_chunks"
	DefaultModel   embeddings.Model // fallback when SearchParams.EmbeddingConfig is empty
}

// Searcher implements search.Searcher against a Qdrant REST endpoint.
type Searcher struct {
	cfg    Config
	emb    *embeddings.Client
	client *http.Client
}

// New creates a Searcher backed by the Qdrant REST API.
func New(cfg Config, emb *embeddings.Client) *Searcher {
	if cfg.BaseURL == "" {
		cfg.BaseURL = os.Getenv("QDRANT_URL")
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "http://localhost:6333"
	}
	if cfg.APIKey == "" {
		cfg.APIKey = os.Getenv("QDRANT_API_KEY")
	}
	if cfg.CollectionName == "" {
		cfg.CollectionName = defaultCollection
	}
	if cfg.DefaultModel == "" {
		cfg.DefaultModel = embeddings.ModelVoyage35Lite_512
	}
	return &Searcher{
		cfg:    cfg,
		emb:    emb,
		client: &http.Client{Timeout: 15 * time.Second},
	}
}

// Delay satisfies the Searcher interface; real implementations return 0.
func (s *Searcher) Delay() time.Duration { return 0 }

// Dense runs vector-only similarity search via POST /points/search.
func (s *Searcher) Dense(ctx context.Context, p contracts.SearchParams) ([]contracts.ScoredHit, error) {
	model := modelFromConfig(p.EmbeddingConfig, s.cfg.DefaultModel)
	results, err := s.emb.Embed(ctx, []string{p.Query}, model)
	if err != nil {
		return nil, fmt.Errorf("httpsearch dense embed: %w", err)
	}

	body := map[string]any{
		"vector": map[string]any{
			"name":   model.VectorName(),
			"vector": results[0].Vector,
		},
		"filter":          buildFilter(p.Filter),
		"limit":           topK(p.TopK),
		"with_payload":    true,
		"with_vector":     false,
		"score_threshold": 0.3,
	}
	return s.postSearch(ctx, body, func(pt qdrantPoint) contracts.ScoredHit {
		return contracts.ScoredHit{Chunk: chunkFromPayload(pt.Payload), VectorScore: pt.Score}
	})
}

// Sparse approximates keyword search: fetches chunks whose payload content
// matches any query token using Qdrant's full-text filter. Scores are
// positional (rank → score in (0,1]) because Qdrant scroll has no inherent
// scoring. Callers merge Sparse hits with Dense hits in the ranker.
func (s *Searcher) Sparse(ctx context.Context, p contracts.SearchParams) ([]contracts.ScoredHit, error) {
	tokens := p.QueryTokens
	if len(tokens) == 0 {
		tokens = tokenize(p.Query)
	}
	if len(tokens) == 0 {
		return nil, nil
	}

	should := make([]map[string]any, 0, len(tokens))
	for _, tok := range tokens {
		should = append(should, map[string]any{
			"key":   "content",
			"match": map[string]any{"text": tok},
		})
	}
	must := buildFilterMust(p.Filter)
	filter := map[string]any{"should": should}
	if len(must) > 0 {
		filter["must"] = must
	}

	body := map[string]any{
		"filter":       filter,
		"limit":        topK(p.TopK),
		"with_payload": true,
	}
	raw, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/collections/%s/points/scroll", s.cfg.BaseURL, s.cfg.CollectionName)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	s.setHeaders(req)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("httpsearch sparse scroll: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		buf, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("qdrant scroll %d: %s", resp.StatusCode, string(buf))
	}

	var out struct {
		Result struct {
			Points []qdrantPoint `json:"points"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}

	hits := make([]contracts.ScoredHit, len(out.Result.Points))
	n := len(out.Result.Points)
	for i, pt := range out.Result.Points {
		// Linear positional score: first result = 1.0, last → ~0.
		score := 1.0 - float64(i)/float64(n+1)
		hits[i] = contracts.ScoredHit{Chunk: chunkFromPayload(pt.Payload), KeywordScore: score}
	}
	return hits, nil
}

// GetByIDs fetches full chunks for the given IDs, scoped to orgID.
func (s *Searcher) GetByIDs(ctx context.Context, orgID string, ids []string) ([]contracts.Chunk, error) {
	if len(ids) == 0 {
		return nil, nil
	}
	// Qdrant batch get: POST /collections/{name}/points
	body := map[string]any{
		"ids":          ids,
		"with_payload": true,
		"with_vector":  false,
	}
	raw, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/collections/%s/points", s.cfg.BaseURL, s.cfg.CollectionName)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	s.setHeaders(req)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("httpsearch get-by-ids: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		buf, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("qdrant get %d: %s", resp.StatusCode, string(buf))
	}

	var out struct {
		Result []qdrantPoint `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}

	chunks := make([]contracts.Chunk, 0, len(out.Result))
	for _, pt := range out.Result {
		c := chunkFromPayload(pt.Payload)
		if orgID == "" || c.OrgID == orgID {
			chunks = append(chunks, c)
		}
	}
	return chunks, nil
}

// FindNeighbors returns chunks that share symbols with the seed IDs.
// It scrolls the collection filtering on chunk.symbols overlapping the
// provided symbols list and excludes the seeds themselves.
func (s *Searcher) FindNeighbors(ctx context.Context, orgID string, ids, symbols []string, limit int) ([]contracts.Chunk, error) {
	if len(symbols) == 0 && len(ids) == 0 {
		return nil, nil
	}
	if limit <= 0 {
		limit = 20
	}

	// Build a filter: orgId match + any symbol in chunk.symbols.
	must := []map[string]any{
		{"key": "orgId", "match": map[string]any{"value": orgID}},
	}
	should := make([]map[string]any, 0, len(symbols))
	for _, sym := range symbols {
		should = append(should, map[string]any{
			"key":   "chunk.symbols",
			"match": map[string]any{"value": sym},
		})
	}
	filter := map[string]any{"must": must}
	if len(should) > 0 {
		filter["should"] = should
	}
	// Exclude seed IDs using must_not so Qdrant doesn't return the seeds
	// themselves as their own neighbors.
	if len(ids) > 0 {
		filter["must_not"] = []map[string]any{
			{"has_id": ids},
		}
	}

	body := map[string]any{
		"filter":       filter,
		"limit":        limit,
		"with_payload": true,
	}
	raw, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/collections/%s/points/scroll", s.cfg.BaseURL, s.cfg.CollectionName)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	s.setHeaders(req)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("httpsearch neighbors: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		buf, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("qdrant neighbors %d: %s", resp.StatusCode, string(buf))
	}

	var out struct {
		Result struct {
			Points []qdrantPoint `json:"points"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}

	chunks := make([]contracts.Chunk, len(out.Result.Points))
	for i, pt := range out.Result.Points {
		chunks[i] = chunkFromPayload(pt.Payload)
	}
	return chunks, nil
}

// ─── helpers ──────────────────────────────────────────────────────────────────

type qdrantPoint struct {
	ID      string         `json:"id"`
	Score   float64        `json:"score"`
	Payload map[string]any `json:"payload"`
}

func (s *Searcher) postSearch(ctx context.Context, body map[string]any, conv func(qdrantPoint) contracts.ScoredHit) ([]contracts.ScoredHit, error) {
	raw, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/collections/%s/points/search", s.cfg.BaseURL, s.cfg.CollectionName)
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	s.setHeaders(req)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("httpsearch search: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		buf, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("qdrant search %d: %s", resp.StatusCode, string(buf))
	}

	var out struct {
		Result []qdrantPoint `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}

	hits := make([]contracts.ScoredHit, len(out.Result))
	for i, pt := range out.Result {
		hits[i] = conv(pt)
	}
	return hits, nil
}

func (s *Searcher) setHeaders(r *http.Request) {
	r.Header.Set("Content-Type", "application/json")
	if s.cfg.APIKey != "" {
		r.Header.Set("api-key", s.cfg.APIKey)
	}
}

func buildFilter(f *contracts.Filter) map[string]any {
	must := buildFilterMust(f)
	if len(must) == 0 {
		return nil
	}
	return map[string]any{"must": must}
}

func buildFilterMust(f *contracts.Filter) []map[string]any {
	if f == nil {
		return nil
	}
	var must []map[string]any
	if f.OrgID != "" {
		must = append(must, map[string]any{"key": "orgId", "match": map[string]any{"value": f.OrgID}})
	}
	if len(f.RepoScopes) > 0 {
		must = append(must, map[string]any{"key": "repoScope", "match": map[string]any{"any": f.RepoScopes}})
	}
	if len(f.SourceTypes) > 0 {
		must = append(must, map[string]any{"key": "sourceType", "match": map[string]any{"any": f.SourceTypes}})
	}
	if len(f.Tags) > 0 {
		must = append(must, map[string]any{"key": "tags", "match": map[string]any{"any": f.Tags}})
	}
	if f.CreatedAfter > 0 {
		must = append(must, map[string]any{"key": "createdAt", "range": map[string]any{"gte": f.CreatedAfter}})
	}
	if f.CreatedBefore > 0 {
		must = append(must, map[string]any{"key": "createdAt", "range": map[string]any{"lte": f.CreatedBefore}})
	}
	return must
}

// chunkFromPayload converts a Qdrant point payload map to contracts.Chunk.
// Field names match the TECH.md §5.1.2 payload schema.
func chunkFromPayload(p map[string]any) contracts.Chunk {
	if p == nil {
		return contracts.Chunk{}
	}
	c := contracts.Chunk{
		ID:         str(p["id"]),
		OrgID:      str(p["orgId"]),
		RepoScope:  str(p["repoScope"]),
		SourceType: str(p["sourceType"]),
		Content:    str(p["content"]),
		CreatedAt:  i64(p["createdAt"]),
		UpdatedAt:  i64(p["updatedAt"]),
		Tags:       strSlice(p["tags"]),
	}
	if ref, ok := p["sourceRef"].(map[string]any); ok {
		c.SourceRef = contracts.SourceRef{
			Kind:  contracts.SourceRefKind(str(ref["kind"])),
			Owner: str(ref["owner"]),
			Repo:  str(ref["repo"]),
			Path:  str(ref["path"]),
			Ref:   str(ref["ref"]),
			URL:   str(ref["url"]),
		}
	}
	if cm, ok := p["chunk"].(map[string]any); ok {
		c.Chunk = contracts.ChunkMeta{
			Index:     int(i64(cm["index"])),
			Total:     int(i64(cm["total"])),
			ByteStart: int(i64(cm["byteStart"])),
			ByteEnd:   int(i64(cm["byteEnd"])),
			Language:  str(cm["language"]),
			Symbols:   strSlice(cm["symbols"]),
			Headings:  strSlice(cm["headings"]),
			Imports:   strSlice(cm["imports"]),
		}
	}
	return c
}

func modelFromConfig(cfg string, def embeddings.Model) embeddings.Model {
	switch embeddings.Model(cfg) {
	case embeddings.ModelOpenAITextSmall3_256,
		embeddings.ModelVoyage3_5,
		embeddings.ModelVoyageCode3_512,
		embeddings.ModelVoyage35Lite_512:
		return embeddings.Model(cfg)
	}
	return def
}

func topK(k int) int {
	if k <= 0 {
		return 20
	}
	if k > 100 {
		return 100
	}
	return k
}

// tokenize splits a query into lowercase tokens, stripping punctuation.
// Used for sparse search when QueryTokens is empty.
func tokenize(q string) []string {
	q = strings.ToLower(q)
	var tokens []string
	for _, word := range strings.Fields(q) {
		word = strings.Trim(word, ".,;:!?\"'()[]{}")
		if len(word) >= 3 {
			tokens = append(tokens, word)
		}
	}
	return tokens
}

func str(v any) string {
	if v == nil {
		return ""
	}
	s, _ := v.(string)
	return s
}

func i64(v any) int64 {
	if v == nil {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return int64(n)
	case int64:
		return n
	case int:
		return int64(n)
	}
	return 0
}

func strSlice(v any) []string {
	if v == nil {
		return nil
	}
	raw, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}
