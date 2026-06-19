package search

import (
	"math"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
)

// Evaluate scores a result set against the agent's self-critique criteria
// and produces a deterministic verdict per the spec:
//
//	coverage < 0.5 OR diversity < 0.3                  -> "needs_more"
//	coverage >= 0.8 AND freshness >= 0.7 AND diversity >= 0.5 -> "sufficient"
//	otherwise                                          -> "needs_reformulation"
//
// `chunks` is the list of full Chunks referenced by `hits` (same IDs).
// `criteria` selects which sub-scores to compute; nil means "all".
func Evaluate(query string, hits []contracts.Hit, chunks []contracts.Chunk, criteria []string, now time.Time) contracts.EvaluateResponse {
	if criteria == nil {
		criteria = []string{"coverage", "freshness", "diversity"}
	}
	want := make(map[string]bool, len(criteria))
	for _, c := range criteria {
		want[strings.ToLower(c)] = true
	}

	scores := contracts.EvaluateScores{}
	if want["coverage"] {
		scores.Coverage = round4(CoverageScore(query, chunks))
	}
	if want["freshness"] {
		scores.Freshness = round4(FreshnessScore(hits, now))
	}
	if want["diversity"] {
		scores.Diversity = round4(DiversityScore(chunks))
	}

	resp := contracts.EvaluateResponse{Scores: scores}
	switch {
	case scores.Coverage < 0.5 || scores.Diversity < 0.3:
		resp.Verdict = "needs_more"
		resp.SuggestedNextQuery = nextQueryFor(query, chunks)
	case scores.Coverage >= 0.8 && scores.Freshness >= 0.7 && scores.Diversity >= 0.5:
		resp.Verdict = "sufficient"
	default:
		resp.Verdict = "needs_reformulation"
		resp.SuggestedNextQuery = nextQueryFor(query, chunks)
	}
	return resp
}

// CoverageScore returns the fraction of query tokens present in the union
// of chunk symbols/headings. Falls back to content tokens when symbol
// data is empty.
func CoverageScore(query string, chunks []contracts.Chunk) float64 {
	tokens := tokenize(query)
	if len(tokens) == 0 {
		return 0
	}
	syms := make(map[string]bool)
	for _, c := range chunks {
		for _, s := range c.Chunk.Symbols {
			syms[strings.ToLower(s)] = true
		}
		for _, h := range c.Chunk.Headings {
			for _, t := range tokenize(h) {
				syms[t] = true
			}
		}
	}
	if len(syms) == 0 {
		for _, c := range chunks {
			for _, t := range tokenize(c.Content) {
				syms[t] = true
			}
		}
	}
	if len(syms) == 0 {
		return 0
	}
	hits := 0
	for _, t := range tokens {
		if syms[t] {
			hits++
		}
	}
	return float64(hits) / float64(len(tokens))
}

// FreshnessScore returns the mean recency score across hits.
func FreshnessScore(hits []contracts.Hit, now time.Time) float64 {
	if len(hits) == 0 {
		return 0
	}
	sum := 0.0
	for _, h := range hits {
		sum += RecencyScore(h.CreatedAt, now)
	}
	return sum / float64(len(hits))
}

// DiversityScore returns 1 - mean pairwise cosine similarity on a per-
// chunk term-frequency vector, clamped to [0, 1].
func DiversityScore(chunks []contracts.Chunk) float64 {
	if len(chunks) <= 1 {
		return 1
	}
	vecs := make([]map[string]float64, 0, len(chunks))
	for _, c := range chunks {
		vecs = append(vecs, termVector(c))
	}
	pairSum := 0.0
	pairs := 0
	for i := 0; i < len(vecs); i++ {
		for j := i + 1; j < len(vecs); j++ {
			pairSum += cosineSim(vecs[i], vecs[j])
			pairs++
		}
	}
	if pairs == 0 {
		return 1
	}
	d := 1 - pairSum/float64(pairs)
	if d < 0 {
		d = 0
	}
	if d > 1 {
		d = 1
	}
	return d
}

func termVector(c contracts.Chunk) map[string]float64 {
	v := make(map[string]float64)
	for _, s := range c.Chunk.Symbols {
		v[strings.ToLower(s)]++
	}
	for _, h := range c.Chunk.Headings {
		for _, t := range tokenize(h) {
			v[t]++
		}
	}
	body := c.Content
	if len(body) > 1024 {
		body = body[:1024]
	}
	for _, t := range tokenize(body) {
		v[t]++
	}
	return v
}

func cosineSim(a, b map[string]float64) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	dot := 0.0
	for k, av := range a {
		if bv, ok := b[k]; ok {
			dot += av * bv
		}
	}
	na := 0.0
	for _, v := range a {
		na += v * v
	}
	nb := 0.0
	for _, v := range b {
		nb += v * v
	}
	if na == 0 || nb == 0 {
		return 0
	}
	return dot / (math.Sqrt(na) * math.Sqrt(nb))
}

func nextQueryFor(query string, chunks []contracts.Chunk) string {
	tokens := tokenize(query)
	if len(tokens) == 0 {
		return ""
	}
	syms := make(map[string]bool)
	for _, c := range chunks {
		for _, s := range c.Chunk.Symbols {
			syms[strings.ToLower(s)] = true
		}
	}
	var gaps []string
	for _, t := range tokens {
		if !syms[t] {
			gaps = append(gaps, t)
		}
	}
	if len(gaps) == 0 {
		return ""
	}
	sort.Strings(gaps)
	return strings.Join(gaps, " ")
}

// tokenize lowercases and splits on any non-letter/digit rune, dropping
// short tokens and common English stopwords.
func tokenize(s string) []string {
	s = strings.ToLower(s)
	f := func(c rune) bool {
		return !unicode.IsLetter(c) && !unicode.IsDigit(c)
	}
	parts := strings.FieldsFunc(s, f)
	out := parts[:0]
	for _, p := range parts {
		if len(p) < 2 {
			continue
		}
		if _, ok := stopwords[p]; ok {
			continue
		}
		out = append(out, p)
	}
	return out
}

var stopwords = map[string]bool{
	"a": true, "an": true, "and": true, "are": true, "as": true,
	"at": true, "be": true, "by": true, "do": true, "for": true,
	"from": true, "has": true, "have": true, "how": true, "in": true,
	"is": true, "it": true, "of": true, "on": true, "or": true,
	"the": true, "to": true, "we": true, "what": true, "when": true,
	"where": true, "which": true, "who": true, "why": true, "with": true,
	"you": true, "your": true, "this": true, "that": true, "these": true,
}
