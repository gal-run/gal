package search

import (
	"math"
	"sort"
	"time"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
)

// RecencyHalfLife is the half-life used in the recency sub-score. Matches
// the spec default of 90 days.
const RecencyHalfLife = 90 * 24 * time.Hour

// RecencyScore returns exp(-Δ_seconds / half_life), a value in (0, 1]
// where 1.0 is "fresh" (just-now) and approaches 0 for very old chunks.
func RecencyScore(createdAt int64, now time.Time) float64 {
	if createdAt <= 0 {
		return 0
	}
	delta := now.Unix() - createdAt
	if delta < 0 {
		return 1
	}
	halfSeconds := float64(RecencyHalfLife.Seconds())
	if halfSeconds <= 0 {
		return 0
	}
	return math.Exp(-float64(delta) / halfSeconds)
}

// Combine fuses dense + sparse sub-queries by ID and applies the hybrid
// score formula from TECH.md 7.3:
//
//	score(d) = α * vector_score(d)
//	         + β * keyword_score(d)
//	         + γ * recency_score(d)
//
// Defaults are 0.7 / 0.3 / 0.1 (see DefaultRanking). The returned slice
// is sorted by score descending and capped at topK (≤0 means no cap).
func Combine(dense, sparse []contracts.ScoredHit, r contracts.Ranking, topK int, now time.Time) []contracts.Hit {
	α := r.VectorWeight
	β := r.KeywordWeight
	γ := r.RecencyBoost
	if α == 0 && β == 0 && γ == 0 {
		r = contracts.DefaultRanking()
		α, β, γ = r.VectorWeight, r.KeywordWeight, r.RecencyBoost
	}

	merged := make(map[string]*contracts.ScoredHit, len(dense)+len(sparse))
	add := func(hits []contracts.ScoredHit) {
		for i := range hits {
			h := hits[i]
			if existing, ok := merged[h.Chunk.ID]; ok {
				if h.VectorScore > existing.VectorScore {
					existing.VectorScore = h.VectorScore
				}
				if h.KeywordScore > existing.KeywordScore {
					existing.KeywordScore = h.KeywordScore
				}
				continue
			}
			cp := h
			merged[h.Chunk.ID] = &cp
		}
	}
	add(dense)
	add(sparse)

	out := make([]contracts.Hit, 0, len(merged))
	for _, h := range merged {
		recency := RecencyScore(h.Chunk.CreatedAt, now)
		score := α*h.VectorScore + β*h.KeywordScore + γ*recency
		out = append(out, contracts.Hit{
			ID:              h.Chunk.ID,
			Score:           round4(score),
			VectorScore:     round4(h.VectorScore),
			KeywordScore:    round4(h.KeywordScore),
			SourceRef:       h.Chunk.SourceRef,
			Title:           TitleFromChunk(h.Chunk),
			Snippet:         SnippetFromContent(h.Chunk.Content),
			Tags:            h.Chunk.Tags,
			CreatedAt:       h.Chunk.CreatedAt,
			EmbeddingConfig: "",
		})
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Score != out[j].Score {
			return out[i].Score > out[j].Score
		}
		if out[i].VectorScore != out[j].VectorScore {
			return out[i].VectorScore > out[j].VectorScore
		}
		return out[i].CreatedAt > out[j].CreatedAt
	})
	if topK > 0 && len(out) > topK {
		out = out[:topK]
	}
	return out
}

// TitleFromChunk picks a displayable title.
func TitleFromChunk(c contracts.Chunk) string {
	if c.SourceRef.Path != "" {
		return c.SourceRef.Path
	}
	return c.ID
}

// SnippetFromContent truncates to a search-friendly snippet (≤ 240 runes).
func SnippetFromContent(content string) string {
	const max = 240
	if len(content) <= max {
		return content
	}
	return content[:max]
}

func round4(x float64) float64 {
	if x == 0 || math.IsNaN(x) || math.IsInf(x, 0) {
		return 0
	}
	return math.Floor(x*10000+0.5) / 10000
}
