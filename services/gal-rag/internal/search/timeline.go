package search

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
)

// TimelineBucketSize is the maximum number of buckets returned.
const TimelineBucketSize = 1024

// Timeline groups the union of dense + sparse hits into time buckets.
// The window is closed on both sides. A zero/empty window defaults to
// the last 30 days, weekly.
func Timeline(ctx context.Context, s Searcher, orgID string, req contracts.TimelineRequest) (contracts.TimelineResponse, error) {
	_ = orgID
	now := time.Now()
	from := req.Window.From
	to := req.Window.To
	if to == 0 {
		to = now.Unix()
	}
	if from == 0 {
		from = to - int64((30 * 24 * time.Hour).Seconds())
	}
	if from > to {
		return contracts.TimelineResponse{}, fmt.Errorf("timeline: window.from > window.to")
	}
	step := bucketSeconds(req.Window.Bucket)
	count := int((to-from)/step) + 1
	if count > TimelineBucketSize {
		step = (to-from)/int64(TimelineBucketSize) + 1
		count = TimelineBucketSize
	}

	p := contracts.SearchParams{
		Query:       req.Query,
		QueryTokens: tokenize(req.Query),
		TopK:        200,
		Filter:      req.Filter,
		Now:         now,
	}
	type sparseResult struct {
		hits []contracts.ScoredHit
		err  error
	}
	sparseCh := make(chan sparseResult, 1)
	go func() {
		hits, err := s.Sparse(ctx, p)
		sparseCh <- sparseResult{hits, err}
	}()
	dense, err := s.Dense(ctx, p)
	if err != nil {
		return contracts.TimelineResponse{}, fmt.Errorf("timeline: dense: %w", err)
	}
	sr := <-sparseCh
	if sr.err != nil {
		return contracts.TimelineResponse{}, fmt.Errorf("timeline: sparse: %w", sr.err)
	}

	merged := make(map[string]contracts.Hit, len(dense)+len(sr.hits))
	add := func(hits []contracts.ScoredHit) {
		for _, h := range hits {
			merged[h.Chunk.ID] = contracts.Hit{ID: h.Chunk.ID, CreatedAt: h.Chunk.CreatedAt}
		}
	}
	add(dense)
	add(sr.hits)

	buckets := make([][]contracts.Hit, count)
	for _, h := range merged {
		idx := int((h.CreatedAt - from) / step)
		if idx < 0 {
			idx = 0
		}
		if idx >= count {
			idx = count - 1
		}
		buckets[idx] = append(buckets[idx], h)
	}
	out := make([]contracts.TimelineBucket, 0, count)
	for i, hits := range buckets {
		sort.Slice(hits, func(a, b int) bool { return hits[a].CreatedAt < hits[b].CreatedAt })
		const maxTop = 3
		top := hits
		if len(top) > maxTop {
			top = top[:maxTop]
		}
		out = append(out, contracts.TimelineBucket{
			From:    from + int64(i)*step,
			To:      from + int64(i+1)*step,
			Count:   len(hits),
			TopHits: top,
		})
	}
	return contracts.TimelineResponse{Buckets: out}, nil
}

func bucketSeconds(kind string) int64 {
	switch kind {
	case "day":
		return int64((24 * time.Hour).Seconds())
	case "week", "":
		return int64((7 * 24 * time.Hour).Seconds())
	default:
		return int64((7 * 24 * time.Hour).Seconds())
	}
}
