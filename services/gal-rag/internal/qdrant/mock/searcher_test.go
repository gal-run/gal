package mock

import (
	"context"
	"testing"
	"time"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
	"github.com/gal-run/gal/services/gal-rag/internal/search"
)

func TestMockSearcherOrgFilter(t *testing.T) {
	corpus := []contracts.Chunk{
		{ID: "a", OrgID: "sched-sys", Content: "alpha", SourceType: "go", CreatedAt: time.Now().Unix()},
		{ID: "b", OrgID: "other-org", Content: "alpha", SourceType: "go", CreatedAt: time.Now().Unix()},
	}
	s := New(corpus, 16)
	p := contracts.SearchParams{
		Query:       "alpha",
		QueryTokens: []string{"alpha"},
		Filter:      &contracts.Filter{OrgID: "sched-sys"},
		TopK:        10,
	}
	hits, err := s.Dense(context.Background(), p)
	if err != nil {
		t.Fatal(err)
	}
	for _, h := range hits {
		if h.Chunk.OrgID != "sched-sys" {
			t.Errorf("org leak: %s", h.Chunk.OrgID)
		}
	}
}

func TestMockSearcherDelayHonored(t *testing.T) {
	s := New(nil, 16).WithDelay(50 * time.Millisecond)
	p := contracts.SearchParams{QueryTokens: []string{"a"}, Filter: &contracts.Filter{OrgID: "sched-sys"}}
	start := time.Now()
	if _, err := s.Dense(context.Background(), p); err != nil {
		t.Fatal(err)
	}
	if elapsed := time.Since(start); elapsed < 50*time.Millisecond {
		t.Errorf("delay = %v, want >= 50ms", elapsed)
	}
}

func TestMockSearcherImplementsInterface(t *testing.T) {
	var _ search.Searcher = New(nil, 16)
}
