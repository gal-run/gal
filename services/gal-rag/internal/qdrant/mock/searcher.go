// Package mock is an in-memory Searcher for unit tests.
package mock

import (
	"context"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
	"github.com/gal-run/gal/services/gal-rag/internal/search"
)

// Searcher implements search.Searcher against an in-memory chunk set.
type Searcher struct {
	mu     sync.RWMutex
	chunks map[string]contracts.Chunk
	delay  time.Duration
	dim    int
	vec    map[string][]float32
}

// New returns a Searcher seeded with `chunks`; each chunk gets a
// deterministic dense vector of the requested dimension.
func New(chunks []contracts.Chunk, dim int) *Searcher {
	if dim <= 0 {
		dim = 16
	}
	s := &Searcher{
		chunks: make(map[string]contracts.Chunk, len(chunks)),
		dim:    dim,
		vec:    make(map[string][]float32, len(chunks)),
	}
	for i, c := range chunks {
		s.chunks[c.ID] = c
		s.vec[c.ID] = deterministicVector(c.ID, dim, i)
	}
	return s
}

// WithDelay sets a per-call sleep so tests can simulate slow paths.
func (s *Searcher) WithDelay(d time.Duration) *Searcher {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.delay = d
	return s
}

// Add inserts or replaces a chunk.
func (s *Searcher) Add(c contracts.Chunk) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.vec[c.ID]; !ok {
		s.vec[c.ID] = deterministicVector(c.ID, s.dim, len(s.chunks))
	}
	s.chunks[c.ID] = c
}

// Delay implements search.Searcher.
func (s *Searcher) Delay() time.Duration { return s.delay }

func (s *Searcher) sleep(ctx context.Context) {
	d := s.Delay()
	if d <= 0 {
		return
	}
	select {
	case <-time.After(d):
	case <-ctx.Done():
	}
}

// Dense returns cosine similarity (mapped to [0,1]) between the query's
// bag-of-words vector and each chunk's pre-seeded vector.
func (s *Searcher) Dense(ctx context.Context, p contracts.SearchParams) ([]contracts.ScoredHit, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	s.sleep(ctx)
	qv := termVec(p.QueryTokens, s.dim)
	out := make([]contracts.ScoredHit, 0, len(s.chunks))
	for id, c := range s.chunks {
		if !matchFilter(c, p.Filter) {
			continue
		}
		vec := s.vec[id]
		out = append(out, contracts.ScoredHit{Chunk: c, VectorScore: cosine(qv, vec)})
	}
	sortByScore(out)
	return capHits(out, p.TopK), nil
}

// Sparse returns a toy BM25 score over chunk symbols + content.
func (s *Searcher) Sparse(ctx context.Context, p contracts.SearchParams) ([]contracts.ScoredHit, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	s.sleep(ctx)
	if len(p.QueryTokens) == 0 {
		return nil, nil
	}
	df := map[string]int{}
	for _, c := range s.chunks {
		if !matchFilter(c, p.Filter) {
			continue
		}
		seen := map[string]bool{}
		for _, t := range chunkTokens(c) {
			if !seen[t] {
				seen[t] = true
				df[t]++
			}
		}
	}
	N := float64(len(s.chunks))
	out := make([]contracts.ScoredHit, 0, len(s.chunks))
	for id, c := range s.chunks {
		if !matchFilter(c, p.Filter) {
			continue
		}
		toks := chunkTokens(c)
		dl := float64(len(toks))
		if dl == 0 {
			continue
		}
		avg := 200.0
		score := 0.0
		for _, q := range p.QueryTokens {
			tf := 0.0
			for _, t := range toks {
				if t == q {
					tf++
				}
			}
			if tf == 0 {
				continue
			}
			idf := math.Log((N-float64(df[q])+0.5)/(float64(df[q])+0.5) + 1)
			denom := tf + 1.5*(1-0.75+0.75*dl/avg)
			score += idf * (tf * (1.5 + 1) / denom)
		}
		norm := score / (score + 1)
		_ = id
		out = append(out, contracts.ScoredHit{Chunk: c, KeywordScore: norm})
	}
	sortByScore(out)
	return capHits(out, p.TopK), nil
}

// GetByIDs returns full chunks for the given IDs, scoped to orgID.
func (s *Searcher) GetByIDs(ctx context.Context, orgID string, ids []string) ([]contracts.Chunk, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	s.sleep(ctx)
	out := make([]contracts.Chunk, 0, len(ids))
	for _, id := range ids {
		c, ok := s.chunks[id]
		if !ok || c.OrgID != orgID {
			continue
		}
		out = append(out, c)
	}
	return out, nil
}

// FindNeighbors returns chunks that share a symbol or import with the
// supplied symbol set, excluding the seed IDs themselves.
func (s *Searcher) FindNeighbors(ctx context.Context, orgID string, ids, symbols []string, limit int) ([]contracts.Chunk, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	s.sleep(ctx)
	sym := make(map[string]bool, len(symbols))
	for _, s := range symbols {
		sym[strings.ToLower(s)] = true
	}
	seed := make(map[string]bool, len(ids))
	for _, id := range ids {
		seed[id] = true
	}
	out := make([]contracts.Chunk, 0, limit)
	for _, c := range s.chunks {
		if c.OrgID != orgID || seed[c.ID] {
			continue
		}
		if sharesSymbol(c, sym) {
			out = append(out, c)
			if len(out) >= limit {
				break
			}
		}
	}
	return out, nil
}

// ── helpers ────────────────────────────────────────────────────────────────

func matchFilter(c contracts.Chunk, f *contracts.Filter) bool {
	if f == nil {
		return true
	}
	if f.OrgID != "" && c.OrgID != f.OrgID {
		return false
	}
	if len(f.RepoScopes) > 0 && !containsString(f.RepoScopes, c.RepoScope) {
		return false
	}
	if len(f.SourceTypes) > 0 && !containsString(f.SourceTypes, c.SourceType) {
		return false
	}
	if len(f.Tags) > 0 {
		for _, t := range f.Tags {
			if !containsString(c.Tags, t) {
				return false
			}
		}
	}
	if f.CreatedAfter > 0 && c.CreatedAt < f.CreatedAfter {
		return false
	}
	if f.CreatedBefore > 0 && c.CreatedAt > f.CreatedBefore {
		return false
	}
	return true
}

func containsString(xs []string, x string) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func sharesSymbol(c contracts.Chunk, syms map[string]bool) bool {
	for _, s := range c.Chunk.Symbols {
		if syms[strings.ToLower(s)] {
			return true
		}
	}
	for _, i := range c.Chunk.Imports {
		if syms[strings.ToLower(i)] {
			return true
		}
	}
	return false
}

func sortByScore(hits []contracts.ScoredHit) {
	sort.SliceStable(hits, func(i, j int) bool {
		ai := hits[i].VectorScore + hits[i].KeywordScore
		aj := hits[j].VectorScore + hits[j].KeywordScore
		if ai != aj {
			return ai > aj
		}
		return hits[i].Chunk.CreatedAt > hits[j].Chunk.CreatedAt
	})
}

func capHits(hits []contracts.ScoredHit, topK int) []contracts.ScoredHit {
	if topK > 0 && len(hits) > topK {
		return hits[:topK]
	}
	return hits
}

func chunkTokens(c contracts.Chunk) []string {
	var out []string
	for _, s := range c.Chunk.Symbols {
		out = append(out, strings.ToLower(s))
	}
	for _, h := range c.Chunk.Headings {
		out = append(out, strings.FieldsFunc(strings.ToLower(h), isNonWord)...)
	}
	out = append(out, strings.FieldsFunc(strings.ToLower(c.Content), isNonWord)...)
	return out
}

func isNonWord(r rune) bool {
	return !(r >= 'a' && r <= 'z') && !(r >= '0' && r <= '9')
}

func termVec(tokens []string, dim int) []float32 {
	if dim <= 0 {
		dim = 64
	}
	v := make([]float32, dim)
	for _, t := range tokens {
		v[hashString(t)%dim]++
	}
	normalizeVec(v)
	return v
}

func hashString(s string) int {
	h := 0
	for i := 0; i < len(s); i++ {
		h = (h*31 + int(s[i])) & 0x7fffffff
	}
	return h
}

func normalizeVec(v []float32) {
	var n float64
	for _, x := range v {
		n += float64(x) * float64(x)
	}
	if n == 0 {
		return
	}
	norm := float32(math.Sqrt(n))
	for i := range v {
		v[i] /= norm
	}
}

func cosine(a, b []float32) float64 {
	if len(a) == 0 || len(b) == 0 {
		return 0
	}
	n := len(a)
	if len(b) < n {
		n = len(b)
	}
	dot := 0.0
	na := 0.0
	nb := 0.0
	for i := 0; i < n; i++ {
		dot += float64(a[i]) * float64(b[i])
		na += float64(a[i]) * float64(a[i])
		nb += float64(b[i]) * float64(b[i])
	}
	if na == 0 || nb == 0 {
		return 0
	}
	sim := dot / (math.Sqrt(na) * math.Sqrt(nb))
	return (sim + 1) / 2
}

func deterministicVector(id string, dim, salt int) []float32 {
	v := make([]float32, dim)
	for i := 0; i < dim; i++ {
		h := hashString(id + string(rune(i+salt)))
		v[i] = float32(h%2000-1000) / 1000.0
	}
	normalizeVec(v)
	return v
}

var _ search.Searcher = (*Searcher)(nil)
