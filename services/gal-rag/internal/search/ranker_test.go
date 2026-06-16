package search

import (
	"math"
	"testing"
	"time"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
)

func TestRecencyScore(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	cases := []struct {
		name      string
		createdAt int64
		want      float64
	}{
		{"now", now.Unix(), 1.0},
		{"future clamps to 1", now.Add(24 * time.Hour).Unix(), 1.0},
		{"zero clamps to 0", 0, 0.0},
		{"one half-life ago", now.Add(-RecencyHalfLife).Unix(), math.Exp(-1)},
		{"two half-lives ago", now.Add(-2 * RecencyHalfLife).Unix(), math.Exp(-2)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := RecencyScore(tc.createdAt, now)
			if math.Abs(got-tc.want) > 0.01 {
				t.Errorf("RecencyScore(%d) = %v, want %v", tc.createdAt, got, tc.want)
			}
		})
	}
}

func TestCombineHybridScore(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	dense := []contracts.ScoredHit{
		{Chunk: contracts.Chunk{ID: "a", CreatedAt: now.Unix()}, VectorScore: 0.9, KeywordScore: 0.1},
		{Chunk: contracts.Chunk{ID: "b", CreatedAt: now.Add(-30 * 24 * time.Hour).Unix()}, VectorScore: 0.6, KeywordScore: 0.2},
	}
	sparse := []contracts.ScoredHit{
		{Chunk: contracts.Chunk{ID: "a", CreatedAt: now.Unix()}, KeywordScore: 0.8},
		{Chunk: contracts.Chunk{ID: "c", CreatedAt: now.Add(-10 * 24 * time.Hour).Unix()}, KeywordScore: 0.7},
	}
	r := contracts.Ranking{VectorWeight: 0.7, KeywordWeight: 0.3, RecencyBoost: 0.1}
	got := Combine(dense, sparse, r, 10, now)
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	// Order: a (0.7*0.9 + 0.3*0.8 + 0.1*1 ≈ 0.96) > b (0.7*0.6 + 0.3*0.2 + 0.1*~0.72 ≈ 0.55) > c (0.7*0 + 0.3*0.7 + 0.1*~0.90 ≈ 0.30)
	wantOrder := []string{"a", "b", "c"}
	for i, id := range wantOrder {
		if got[i].ID != id {
			t.Errorf("position %d: id = %s, want %s", i, got[i].ID, id)
		}
	}
	scoreA := 0.7*0.9 + 0.3*0.8 + 0.1*1.0
	if math.Abs(got[0].Score-scoreA) > 0.01 {
		t.Errorf("score[a] = %v, want ~%v", got[0].Score, scoreA)
	}
}

func TestCombineDefaultWeights(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	hits := []contracts.ScoredHit{
		{Chunk: contracts.Chunk{ID: "a", CreatedAt: now.Unix()}, VectorScore: 0.5, KeywordScore: 0.5},
	}
	got := Combine(hits, nil, contracts.Ranking{}, 0, now)
	want := 0.7*0.5 + 0.3*0.5 + 0.1*1.0
	if math.Abs(got[0].Score-want) > 0.01 {
		t.Errorf("default-weight score = %v, want %v", got[0].Score, want)
	}
}

func TestCombineRespectsTopK(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	hits := make([]contracts.ScoredHit, 50)
	for i := range hits {
		hits[i] = contracts.ScoredHit{
			Chunk:       contracts.Chunk{ID: idForIndex(i), CreatedAt: now.Unix()},
			VectorScore: float64(i) / 100.0,
		}
	}
	got := Combine(hits, nil, contracts.DefaultRanking(), 5, now)
	if len(got) != 5 {
		t.Fatalf("len = %d, want 5", len(got))
	}
	for i := 0; i < 5; i++ {
		wantIdx := 49 - i
		if got[i].ID != idForIndex(wantIdx) {
			t.Errorf("position %d: id = %s, want %s", i, got[i].ID, idForIndex(wantIdx))
		}
	}
}

func idForIndex(i int) string {
	const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
	if i < 26 {
		return "id-" + string(letters[i])
	}
	return "id-" + string(letters[i/26-1]) + string(letters[i%26])
}
