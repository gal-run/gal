package search

import (
	"context"
	"testing"
	"time"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
)

// graphSearcher is a tiny in-test Searcher for the BFS unit test. It
// avoids the import cycle on internal/qdrant/mock and gives the BFS
// deterministic input.
type graphSearcher struct {
	chunks map[string]contracts.Chunk
}

func (s *graphSearcher) Dense(_ context.Context, _ contracts.SearchParams) ([]contracts.ScoredHit, error) {
	return nil, nil
}
func (s *graphSearcher) Sparse(_ context.Context, _ contracts.SearchParams) ([]contracts.ScoredHit, error) {
	return nil, nil
}
func (s *graphSearcher) GetByIDs(_ context.Context, _ string, ids []string) ([]contracts.Chunk, error) {
	out := make([]contracts.Chunk, 0, len(ids))
	for _, id := range ids {
		if c, ok := s.chunks[id]; ok {
			out = append(out, c)
		}
	}
	return out, nil
}
func (s *graphSearcher) FindNeighbors(_ context.Context, _ string, _ []string, symbols []string, limit int) ([]contracts.Chunk, error) {
	sym := make(map[string]bool, len(symbols))
	for _, s := range symbols {
		sym[s] = true
	}
	out := make([]contracts.Chunk, 0, limit)
	for _, c := range s.chunks {
		for _, s := range c.Chunk.Symbols {
			if sym[s] {
				out = append(out, c)
				break
			}
		}
		for _, i := range c.Chunk.Imports {
			if sym[i] {
				out = append(out, c)
				break
			}
		}
		if len(out) >= limit {
			break
		}
	}
	return out, nil
}
func (s *graphSearcher) Delay() time.Duration { return 0 }

func TestGraphExpandBFS(t *testing.T) {
	corpus := map[string]contracts.Chunk{
		// auth imports jwt.Parse (so the auth→jwt edge is an "imports"
		// edge per the BFS inference in edgeKindBetween).
		"auth":    {ID: "auth", OrgID: "sched-sys", Chunk: contracts.ChunkMeta{Symbols: []string{"auth.Middleware", "RawToken"}, Imports: []string{"jwt.Parse"}}},
		"jwt":     {ID: "jwt", OrgID: "sched-sys", Chunk: contracts.ChunkMeta{Symbols: []string{"jwt.Parse", "jwt.Token"}, Imports: []string{"ProxyHandler"}}},
		"gateway": {ID: "gateway", OrgID: "sched-sys", Chunk: contracts.ChunkMeta{Symbols: []string{"ProxyHandler"}, Imports: []string{}}},
		"unrelated": {ID: "unrelated", OrgID: "sched-sys", Chunk: contracts.ChunkMeta{Symbols: []string{"Other"}}},
	}
	s := &graphSearcher{chunks: corpus}
	resp, err := GraphExpand(context.Background(), s, "sched-sys", contracts.GraphRequest{
		SeedIDs:   []string{"auth"},
		Hops:      2,
		EdgeKinds: []contracts.EdgeKind{contracts.EdgeImports, contracts.EdgeCalls},
	})
	if err != nil {
		t.Fatal(err)
	}
	got := nodeIDs(resp)
	if !contains(got, "auth") || !contains(got, "jwt") || !contains(got, "gateway") {
		t.Errorf("missing expected nodes; got %v", got)
	}
	if contains(got, "unrelated") {
		t.Errorf("unrelated leaked into the graph: %v", got)
	}
	if len(resp.Edges) == 0 {
		t.Errorf("expected at least one edge, got 0")
	}
}

func TestGraphExpandRespects200Cap(t *testing.T) {
	chunks := make(map[string]contracts.Chunk, 250)
	for i := 0; i < 250; i++ {
		chunks[idForIndex(i)] = contracts.Chunk{
			ID:    idForIndex(i),
			OrgID: "sched-sys",
			Chunk: contracts.ChunkMeta{Symbols: []string{"shared"}},
		}
	}
	s := &graphSearcher{chunks: chunks}
	resp, err := GraphExpand(context.Background(), s, "sched-sys", contracts.GraphRequest{
		SeedIDs: []string{"id-A"},
		Hops:    3,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.Nodes) > GraphMaxNodes {
		t.Errorf("len(nodes) = %d, want <= %d", len(resp.Nodes), GraphMaxNodes)
	}
	if len(resp.Nodes) > GraphMaxNodes {
		t.Errorf("len(nodes) = %d, want <= %d", len(resp.Nodes), GraphMaxNodes)
	}
	// The cap should be hit; with 250 chunks all sharing a symbol we
	// expect 200 results, but allow one fewer since the dedup-by-visit
	// skips the seed and we walk the map in arbitrary order.
	if len(resp.Nodes) < GraphMaxNodes-1 {
		t.Errorf("len(nodes) = %d, want ~%d", len(resp.Nodes), GraphMaxNodes)
	}
}

func TestGraphExpandEmptySeeds(t *testing.T) {
	s := &graphSearcher{chunks: map[string]contracts.Chunk{}}
	resp, err := GraphExpand(context.Background(), s, "sched-sys", contracts.GraphRequest{})
	if err != nil {
		t.Fatal(err)
	}
	if len(resp.Nodes) != 0 || len(resp.Edges) != 0 {
		t.Errorf("expected empty response, got %+v", resp)
	}
}

func nodeIDs(r contracts.GraphResponse) []string {
	out := make([]string, 0, len(r.Nodes))
	for _, n := range r.Nodes {
		out = append(out, n.ID)
	}
	return out
}

func contains(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}
