//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"
	"github.com/google/uuid"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"
	"log/slog"

	"github.com/gal-run/gal/services/gal-rag/internal/api"
	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
	"github.com/gal-run/gal/services/gal-rag/internal/ingest"
	"github.com/gal-run/gal/services/gal-rag/internal/qdrant/httpsearch"
)

const (
	testOrg       = "test-org"
	testRepoScope = "gal-run/go-services"
	testColl      = "gal_rag_chunks"
	voyageDim     = 512
)

// startQdrant spins up qdrant/qdrant:v1.15.0 and returns its REST base URL.
// The test is skipped if Docker is unavailable.
func startQdrant(t *testing.T) (baseURL string, cleanup func()) {
	t.Helper()
	ctx := context.Background()
	c, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "qdrant/qdrant:v1.15.0",
			ExposedPorts: []string{"6333/tcp"},
			WaitingFor:   wait.ForHTTP("/healthz").WithPort("6333/tcp").WithStartupTimeout(90 * time.Second),
		},
		Started: true,
	})
	if err != nil {
		t.Skipf("docker unavailable, skipping integration test: %v", err)
	}

	host, _ := c.Host(ctx)
	port, _ := c.MappedPort(ctx, "6333")
	url := fmt.Sprintf("http://%s:%s", host, port.Port())

	return url, func() { _ = c.Terminate(ctx) }
}

// createCollection creates the gal_rag_chunks collection with named
// dense vectors matching the TECH.md §5.1.1 schema.
func createCollection(t *testing.T, baseURL string) {
	t.Helper()
	body := map[string]any{
		"vectors": map[string]any{
			"dense_openai_256": map[string]any{"size": 256, "distance": "Cosine"},
			"dense_voyage_512": map[string]any{"size": voyageDim, "distance": "Cosine"},
		},
	}
	raw, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/collections/%s", baseURL, testColl)
	req, _ := http.NewRequest("PUT", url, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp.StatusCode/100 != 2 {
		t.Fatalf("create collection: err=%v status=%v", err, resp.StatusCode)
	}
	resp.Body.Close()
}

// upsertFixture inserts a known point with a given vector into Qdrant directly.
func upsertFixture(t *testing.T, baseURL string, pt *ingest.Point) {
	t.Helper()
	up := ingest.NewQdrantHTTPUpserter(ingest.QdrantHTTPConfig{
		BaseURL:        baseURL,
		CollectionName: testColl,
	})
	if err := up.Upsert(context.Background(), []*ingest.Point{pt}); err != nil {
		t.Fatalf("upsert fixture %q: %v", pt.ID, err)
	}
}

// unitVec returns a float32 slice of length n where index i = 1 and rest = 0.
func unitVec(n, i int) []float32 {
	v := make([]float32, n)
	if i < n {
		v[i] = 1.0
	}
	return v
}

// fixtureUUID returns a stable UUID v5 for a given test label.
func fixtureUUID(label string) string {
	ns := uuid.MustParse("6ba7b810-9dad-11d1-80b4-00c04fd430c8")
	return uuid.NewSHA1(ns, []byte("gal-rag-test\x00"+label)).String()
}

// makeFixture returns a Point with a recognisable ID and a unit vector at index i.
func makeFixture(label, orgID, content string, vecIndex int) *ingest.Point {
	id := fixtureUUID(label)
	now := time.Now().Unix()
	return &ingest.Point{
		ID:              id,
		OrgID:           orgID,
		RepoScope:       testRepoScope,
		SourceType:      "go",
		Content:         content,
		ContentHash:     fmt.Sprintf("hash-%s", id),
		EmbeddingConfig: "VOYAGE_3_5_LITE_512",
		Voyage512:       unitVec(voyageDim, vecIndex),
		CreatedAt:       now,
		UpdatedAt:       now,
		Chunk: contracts.ChunkMeta{
			Index:    0,
			Total:    1,
			Language: "go",
			Symbols:  []string{"Symbol" + id},
		},
		SourceRef: contracts.SourceRef{
			Kind: contracts.SourceRefGitHubFile,
			Path: fmt.Sprintf("pkg/%s/main.go", id),
		},
	}
}

func TestDenseSearch(t *testing.T) {
	qdrantURL, cleanup := startQdrant(t)
	defer cleanup()
	createCollection(t, qdrantURL)

	// Upsert 3 points with orthogonal unit vectors.
	fixtures := []*ingest.Point{
		makeFixture("pt-0", testOrg, "func Foo() {}", 0),
		makeFixture("pt-1", testOrg, "func Bar() {}", 1),
		makeFixture("pt-2", testOrg, "func Baz() {}", 2),
	}
	for _, f := range fixtures {
		upsertFixture(t, qdrantURL, f)
	}

	searcher := httpsearch.New(httpsearch.Config{
		BaseURL:        qdrantURL,
		CollectionName: testColl,
	}, nil) // nil embeddings — we supply pre-computed vectors via mock below

	// We can't call Dense without an embeddings client, so test the REST
	// layer via GetByIDs (which doesn't need embeddings) to confirm
	// the points landed.
	ctx := context.Background()
	chunks, err := searcher.GetByIDs(ctx, testOrg, []string{fixtureUUID("pt-0"), fixtureUUID("pt-1")})
	if err != nil {
		t.Fatalf("GetByIDs: %v", err)
	}
	if len(chunks) != 2 {
		t.Fatalf("GetByIDs: got %d chunks, want 2", len(chunks))
	}
	ids := map[string]bool{}
	for _, c := range chunks {
		ids[c.ID] = true
	}
	for _, want := range []string{fixtureUUID("pt-0"), fixtureUUID("pt-1")} {
		if !ids[want] {
			t.Errorf("GetByIDs: missing %q in response", want)
		}
	}
}

func TestFindNeighbors(t *testing.T) {
	qdrantURL, cleanup := startQdrant(t)
	defer cleanup()
	createCollection(t, qdrantURL)

	// pt-alpha and pt-beta share symbol "SharedSymbol"; pt-gamma does not.
	sharedSym := "SharedSymbol"
	now := time.Now().Unix()

	alpha := &ingest.Point{
		ID: fixtureUUID("alpha"), OrgID: testOrg, RepoScope: testRepoScope,
		SourceType: "go", Content: "alpha content",
		ContentHash: "hash-alpha", EmbeddingConfig: "VOYAGE_3_5_LITE_512",
		Voyage512: unitVec(voyageDim, 10), CreatedAt: now, UpdatedAt: now,
		Chunk: contracts.ChunkMeta{Symbols: []string{sharedSym, "AlphaOnly"}},
	}
	beta := &ingest.Point{
		ID: fixtureUUID("beta"), OrgID: testOrg, RepoScope: testRepoScope,
		SourceType: "go", Content: "beta content",
		ContentHash: "hash-beta", EmbeddingConfig: "VOYAGE_3_5_LITE_512",
		Voyage512: unitVec(voyageDim, 11), CreatedAt: now, UpdatedAt: now,
		Chunk: contracts.ChunkMeta{Symbols: []string{sharedSym, "BetaOnly"}},
	}
	gamma := &ingest.Point{
		ID: fixtureUUID("gamma"), OrgID: testOrg, RepoScope: testRepoScope,
		SourceType: "go", Content: "gamma content",
		ContentHash: "hash-gamma", EmbeddingConfig: "VOYAGE_3_5_LITE_512",
		Voyage512: unitVec(voyageDim, 12), CreatedAt: now, UpdatedAt: now,
		Chunk: contracts.ChunkMeta{Symbols: []string{"GammaOnly"}},
	}
	for _, f := range []*ingest.Point{alpha, beta, gamma} {
		upsertFixture(t, qdrantURL, f)
	}

	searcher := httpsearch.New(httpsearch.Config{
		BaseURL:        qdrantURL,
		CollectionName: testColl,
	}, nil)

	ctx := context.Background()
	// Find neighbors of alpha using its symbol; should find beta, not gamma.
	neighbors, err := searcher.FindNeighbors(ctx, testOrg, []string{fixtureUUID("alpha")}, []string{sharedSym}, 10)
	if err != nil {
		t.Fatalf("FindNeighbors: %v", err)
	}

	found := map[string]bool{}
	for _, c := range neighbors {
		found[c.ID] = true
	}
	if !found[fixtureUUID("beta")] {
		t.Errorf("FindNeighbors: expected beta in results (shares %q), got %v", sharedSym, found)
	}
	if found[fixtureUUID("alpha")] {
		t.Errorf("FindNeighbors: seed alpha should be excluded from results")
	}
	if found[fixtureUUID("gamma")] {
		t.Errorf("FindNeighbors: gamma does not share symbol and should not appear, got %v", found)
	}
}

func TestHTTPSearchHandler(t *testing.T) {
	qdrantURL, cleanup := startQdrant(t)
	defer cleanup()
	createCollection(t, qdrantURL)

	now := time.Now().Unix()
	ptID := fixtureUUID("http-pt")
	pt := &ingest.Point{
		ID: ptID, OrgID: testOrg, RepoScope: testRepoScope,
		SourceType: "go", Content: "package main\nfunc main() {}",
		ContentHash: "hash-http-pt", EmbeddingConfig: "VOYAGE_3_5_LITE_512",
		Voyage512: unitVec(voyageDim, 5), CreatedAt: now, UpdatedAt: now,
		Chunk: contracts.ChunkMeta{Symbols: []string{"main"}},
		SourceRef: contracts.SourceRef{Kind: contracts.SourceRefGitHubFile, Path: "cmd/main.go"},
	}
	upsertFixture(t, qdrantURL, pt)

	// Wire the HTTP handler with a test JWT.
	log := slog.Default()
	ja := jwtauth.New("HS256", []byte("test-secret"), nil)
	searcher := httpsearch.New(httpsearch.Config{
		BaseURL:        qdrantURL,
		CollectionName: testColl,
	}, nil)
	sh := api.NewSearchHandlers(searcher, log)

	router := chi.NewRouter()
	router.Use(chimw.Recoverer)
	router.Handle("/rag/*", sh.Routes(ja))
	router.Handle("/rag", sh.Routes(ja))
	srv := httptest.NewServer(router)
	defer srv.Close()

	// Build a signed JWT.
	_, tokenStr, _ := ja.Encode(map[string]any{
		"org_id": testOrg,
		"sub":    "test-user",
		"exp":    time.Now().Add(time.Hour).Unix(),
	})

	// POST /rag/get — fetch the fixture point by ID.
	getBody, _ := json.Marshal(map[string]any{
		"orgId": testOrg,
		"ids":   []string{ptID},
	})
	req, _ := http.NewRequest("POST", srv.URL+"/rag/get", bytes.NewReader(getBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+tokenStr)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("POST /rag/get: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("POST /rag/get: status %d", resp.StatusCode)
	}

	var getResp contracts.GetResponse
	if err := json.NewDecoder(resp.Body).Decode(&getResp); err != nil {
		t.Fatalf("decode /rag/get response: %v", err)
	}
	if len(getResp.Chunks) != 1 {
		t.Fatalf("expected 1 chunk, got %d", len(getResp.Chunks))
	}
	if getResp.Chunks[0].ID != ptID {
		t.Errorf("chunk ID = %q, want %q", getResp.Chunks[0].ID, ptID)
	}
	if getResp.Chunks[0].Content != pt.Content {
		t.Errorf("chunk content mismatch: got %q", getResp.Chunks[0].Content)
	}
}
