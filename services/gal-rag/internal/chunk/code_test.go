package chunk

import (
	"strings"
	"testing"
)

func TestChunkCodeSplitsOnFunctionBoundaries(t *testing.T) {
	src := `package sample

func NewCounter() *Counter { return &Counter{n: 0} }

func (c *Counter) Inc() { c.n++ }

type Counter struct{ n int }

func (c *Counter) Value() int { return c.n }
`
	chunks := ChunkCode("go", src, DefaultCodeOpts())
	if len(chunks) < 3 {
		t.Fatalf("expected at least 3 chunks (one per func/type), got %d", len(chunks))
	}
	var sawNewCounter, sawInc, sawValue, sawType bool
	for _, c := range chunks {
		joined := strings.Join(c.Symbols, ",")
		switch {
		case strings.Contains(joined, "NewCounter"):
			sawNewCounter = true
		case strings.Contains(joined, "Inc"):
			sawInc = true
		case strings.Contains(joined, "Value"):
			sawValue = true
		case strings.Contains(joined, "Counter"):
			sawType = true
		}
	}
	if !sawNewCounter {
		t.Errorf("missing NewCounter chunk")
	}
	if !sawInc {
		t.Errorf("missing Inc chunk")
	}
	if !sawValue {
		t.Errorf("missing Value chunk")
	}
	if !sawType {
		t.Errorf("missing Counter type chunk")
	}
}

func TestChunkCodeEmptySourceReturnsNothing(t *testing.T) {
	chunks := ChunkCode("go", "", DefaultCodeOpts())
	// The fallback windower may produce a single chunk that contains
	// only whitespace; both empty and whitespace-only are acceptable.
	for _, c := range chunks {
		if strings.TrimSpace(c.Content) != "" {
			t.Errorf("expected empty/whitespace content, got %q", c.Content)
		}
	}
}

func TestChunkCodeSlidingWindowWhenOverBudget(t *testing.T) {
	// Build a file with many small defs.
	var sb strings.Builder
	sb.WriteString("package big\n\n")
	for i := 0; i < 200; i++ {
		sb.WriteString("func F")
		sb.WriteString(string(rune('a' + (i % 26))))
		sb.WriteString("(x int) int { return x + ")
		sb.WriteString("1")
		sb.WriteString(" }\n\n")
	}
	chunks := ChunkCode("go", sb.String(), CodeOpts{MaxTokens: 100, Overlap: 20})
	if len(chunks) < 2 {
		t.Errorf("expected windowed output to produce >1 chunk, got %d", len(chunks))
	}
	for i, c := range chunks {
		if c.TokenCount == 0 {
			t.Errorf("chunk %d has TokenCount=0", i)
		}
	}
}

func TestApproxTokens(t *testing.T) {
	cases := map[string]int{
		"":      0,
		"abcd":  1,
		"abcde": 2,
	}
	for in, want := range cases {
		got := approxTokens(in)
		if got != want {
			t.Errorf("approxTokens(%q) = %d, want %d", in, got, want)
		}
	}
}
