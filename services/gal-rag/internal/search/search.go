package search

import (
	"context"
	"sync"
	"time"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
)

// Search is the high-level orchestrator used by /rag/search. It runs
// dense + sparse in parallel, fuses them through Combine, computes
// coverage, and assembles the nextQuery list.
func Search(ctx context.Context, s Searcher, p contracts.SearchParams) (contracts.SearchResponse, error) {
	if p.TopK <= 0 {
		p.TopK = 20
	}
	if p.Now.IsZero() {
		p.Now = time.Now()
	}
	if p.QueryTokens == nil {
		p.QueryTokens = tokenize(p.Query)
	}
	if d := s.Delay(); d > 0 {
		select {
		case <-time.After(d):
		case <-ctx.Done():
			return contracts.SearchResponse{}, ctx.Err()
		}
	}

	var (
		wg       sync.WaitGroup
		denseH   []contracts.ScoredHit
		sparseH  []contracts.ScoredHit
		denseErr error
		sparseEr error
	)
	wg.Add(2)
	go func() {
		defer wg.Done()
		denseH, denseErr = s.Dense(ctx, p)
	}()
	go func() {
		defer wg.Done()
		sparseH, sparseEr = s.Sparse(ctx, p)
	}()
	wg.Wait()
	if denseErr != nil {
		return contracts.SearchResponse{}, denseErr
	}
	if sparseEr != nil {
		return contracts.SearchResponse{}, sparseEr
	}

	r := contracts.Ranking{}
	if p.Filter != nil {
		_ = p.Filter
	}
	ranking := r
	results := Combine(denseH, sparseH, ranking, p.TopK, p.Now)

	union := make(map[string]contracts.ScoredHit, len(denseH)+len(sparseH))
	for _, h := range denseH {
		union[h.Chunk.ID] = h
	}
	for _, h := range sparseH {
		union[h.Chunk.ID] = h
	}

	cov := computeCoverage(p.QueryTokens, union)
	comps := make([]contracts.Chunk, 0, len(union))
	for _, h := range union {
		comps = append(comps, h.Chunk)
	}
	return contracts.SearchResponse{
		Results:   results,
		NextQuery: nextQueryFromChunks(p.QueryTokens, comps),
		Coverage:  cov,
	}, nil
}

func computeCoverage(queryTokens []string, union map[string]contracts.ScoredHit) contracts.Coverage {
	if len(queryTokens) == 0 {
		return contracts.Coverage{EstimatedRecall: 1, Gaps: []string{}}
	}
	covered := make(map[string]bool, len(queryTokens))
	for _, h := range union {
		for _, sym := range h.Chunk.Chunk.Symbols {
			covered[sym] = true
		}
		for _, heading := range h.Chunk.Chunk.Headings {
			for _, t := range tokenize(heading) {
				covered[t] = true
			}
		}
		for _, t := range tokenize(h.Chunk.Content) {
			covered[t] = true
		}
	}
	coveredCount := 0
	var gaps []string
	for _, t := range queryTokens {
		if covered[t] {
			coveredCount++
		} else {
			gaps = append(gaps, t)
		}
	}
	recall := float64(coveredCount) / float64(len(queryTokens))
	return contracts.Coverage{EstimatedRecall: round4(recall), Gaps: gaps}
}

func nextQueryFromChunks(queryTokens []string, chunks []contracts.Chunk) []string {
	seen := make(map[string]bool, len(queryTokens))
	for _, t := range queryTokens {
		seen[t] = true
	}
	syms := make(map[string]int)
	for _, c := range chunks {
		for _, s := range c.Chunk.Symbols {
			if !seen[s] {
				syms[s]++
			}
		}
		for _, h := range c.Chunk.Headings {
			for _, t := range tokenize(h) {
				if !seen[t] {
					syms[t]++
				}
			}
		}
	}
	if len(syms) == 0 {
		return []string{}
	}
	type kv struct {
		k string
		v int
	}
	arr := make([]kv, 0, len(syms))
	for k, v := range syms {
		arr = append(arr, kv{k, v})
	}
	for i := 0; i < len(arr); i++ {
		for j := i + 1; j < len(arr); j++ {
			if arr[j].v > arr[i].v || (arr[j].v == arr[i].v && arr[j].k < arr[i].k) {
				arr[i], arr[j] = arr[j], arr[i]
			}
		}
	}
	limit := 2
	if limit > len(arr) {
		limit = len(arr)
	}
	out := make([]string, 0, limit)
	for i := 0; i < limit; i++ {
		out = append(out, arr[i].k)
	}
	return out
}
