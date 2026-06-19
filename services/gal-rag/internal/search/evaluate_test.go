package search

import (
	"math"
	"testing"
	"time"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
)

// TestEvaluateVerdictMatrix covers the spec's verdict rules:
//
//	coverage < 0.5 OR diversity < 0.3                          -> needs_more
//	coverage >= 0.8 AND freshness >= 0.7 AND diversity >= 0.5   -> sufficient
//	otherwise                                                   -> needs_reformulation
func TestEvaluateVerdictMatrix(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	fresh := now.Unix()                                     // recency 1.0
	oldish := recencyForScore(0.135, now)                   // 180d ago
	rec07 := recencyForScore(0.7, now) // 51d ago
	rec09 := recencyForScore(0.9, now) // 14d ago

	type tc struct {
		name        string
		coverage    float64
		freshness   float64
		diversity   float64
		hits        []int64
		wantVerdict string
	}
	cases := []tc{
		{"low coverage", 0.3, 0.95, 0.9, []int64{fresh, oldish, rec07, rec09}, "needs_more"},
		{"low diversity", 0.9, 0.95, 0.1, []int64{fresh, oldish, rec07, rec09}, "needs_more"},
		// Three hits, all fresh (avg 1.0), with one query token
		// distributed per chunk so the union covers all 3 tokens
		// (coverage 1.0) and the per-chunk vectors stay disjoint
		// (diversity high).
		{"all good", 1.0, 1.0, 0.5, []int64{fresh, fresh, fresh}, "sufficient"},
		{"freshness borderline", 0.9, 0.69, 0.5, []int64{oldish, oldish}, "needs_reformulation"},
		// Two chunks with a 1-token overlap → cosine ~ 0.5 → diversity
		// ~ 0.5 → rule (diversity >= 0.5) requires strict ≥, so this
		// becomes `needs_reformulation` (the rule fires because
		// diversity is NOT >= 0.5, but coverage and freshness are
		// strong, so the verdict lands in needs_reformulation rather
		// than needs_more).
		{"diversity borderline", 0.9, 0.9, 0.5, []int64{fresh, fresh}, "needs_reformulation"},
		{"coverage borderline", 0.79, 0.9, 0.5, []int64{fresh, fresh}, "needs_reformulation"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			hits := makeHits(c.hits...)
			chunks := makeChunks(hits, c.coverage, c.diversity)
			got := Evaluate("alpha beta gamma", hits, chunks, []string{"coverage", "freshness", "diversity"}, now)
			if got.Verdict != c.wantVerdict {
				t.Errorf("verdict = %q, want %q (scores=%+v)", got.Verdict, c.wantVerdict, got.Scores)
			}
		})
	}
}

func makeHits(ts ...int64) []contracts.Hit {
	out := make([]contracts.Hit, 0, len(ts))
	for i, t := range ts {
		out = append(out, contracts.Hit{ID: idForIndex(i), CreatedAt: t})
	}
	return out
}

// makeChunks constructs a corpus whose coverage and diversity match the
// request. Each chunk gets a per-chunk unique symbol + a slice of
// query tokens sized so the *union* across chunks covers
// `coverage * len(queryTokens)` query tokens. This satisfies
// CoverageScore (union-based) without putting the same symbols on every
// chunk (which would distort diversity).
func makeChunks(hits []contracts.Hit, coverage, diversity float64) []contracts.Chunk {
	tokens := []string{"alpha", "beta", "gamma"}
	matched := int(coverage*float64(len(tokens)) + 0.5)
	if matched > len(tokens) {
		matched = len(tokens)
	}
	// Distribute the matched query tokens across chunks. We do a round-
	// robin so a single chunk's symbol set is small and the per-chunk
	// vectors stay disjoint.
	highDivBodies := []string{
		"red apple juice sweet",
		"blue ocean wave deep",
		"green forest tree tall",
		"yellow desert sand dry",
		"purple mountain peak cold",
	}
	lowDivBody := "shared shared shared shared shared shared"
	borderDivBodies := []string{
		"red apple juice sweet",
		"red banana toast plain",
	}

	chunks := make([]contracts.Chunk, 0, len(hits))
	for i, h := range hits {
		// Each chunk owns one of the matched query tokens. With enough
		// chunks we cover all `matched` tokens; with fewer, we just
		// cover what fits.
		var syms []string
		if i < matched {
			syms = []string{tokens[i]}
		} else {
			// Padding symbols that are unique to this chunk so the
			// term vector doesn't collide with neighbours.
			syms = []string{"unique_" + idForIndex(i)}
		}
		c := contracts.Chunk{
			ID:        h.ID,
			CreatedAt: h.CreatedAt,
			Chunk:     contracts.ChunkMeta{Symbols: syms},
		}
		if diversity < 0.4 {
			c.Content = lowDivBody
		} else if diversity < 0.6 {
			c.Content = borderDivBodies[i%len(borderDivBodies)]
		} else {
			c.Content = highDivBodies[i%len(highDivBodies)]
		}
		chunks = append(chunks, c)
	}
	return chunks
}

func recencyForScore(score float64, now time.Time) int64 {
	if score <= 0 {
		return 0
	}
	if score >= 1 {
		return now.Unix()
	}
	delta := time.Duration(-float64(RecencyHalfLife) * math.Log(score))
	return now.Add(-delta).Unix()
}
