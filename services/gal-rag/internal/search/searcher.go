// Package search hosts the hybrid retrieval algorithms. Searcher is the
// seam between gal-rag and the vector store. Real and mock
// implementations live side-by-side in this package's parent dir.
package search

import (
	"context"
	"time"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
)

// Searcher is implemented by both the production Qdrant client and the
// in-memory mock used in unit tests.
type Searcher interface {
	// Dense runs the vector-only sub-query and returns candidates with
	// vector scores in [0,1].
	Dense(ctx context.Context, p contracts.SearchParams) ([]contracts.ScoredHit, error)

	// Sparse runs the keyword-only sub-query (BM25 / sparse vector) and
	// returns candidates with keyword scores in [0,1].
	Sparse(ctx context.Context, p contracts.SearchParams) ([]contracts.ScoredHit, error)

	// GetByIDs returns the full chunks for the given IDs, scoped by orgId.
	GetByIDs(ctx context.Context, orgID string, ids []string) ([]contracts.Chunk, error)

	// FindNeighbors returns chunks that share symbols/imports with any of
	// the given seed IDs.
	FindNeighbors(ctx context.Context, orgID string, ids, symbols []string, limit int) ([]contracts.Chunk, error)

	// Delay returns a Duration that the test mock uses to simulate slow
	// paths. Real Qdrant implementations return 0.
	Delay() time.Duration
}
