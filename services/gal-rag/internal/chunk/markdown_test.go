package chunk

import (
	"strings"
	"testing"
)

func TestChunkMarkdownSplitsOnHeadings(t *testing.T) {
	src := `# Title

` + strings.Repeat("intro paragraph with some content for the title chunk ", 30) + `

## Section A

` + strings.Repeat("content A with substantial body for the section A chunk ", 30) + `

## Section B

` + strings.Repeat("content B with substantial body for the section B chunk ", 30) + `

### Subsection B1

` + strings.Repeat("content B1 with substantial body for the subsection B1 chunk ", 30) + `
`
	// Disable MinChunkTokens merging so each heading produces its own chunk.
	chunks := ChunkMarkdown("docs/test.md", src, MarkdownOpts{MaxTokens: 800, OverlapTokens: 100, MinChunkTokens: 0})
	if len(chunks) < 3 {
		t.Fatalf("expected >=3 chunks (one per heading), got %d", len(chunks))
	}
	var sawA, sawB, sawB1 bool
	for _, c := range chunks {
		if contains(c.Headings, "Section A") {
			sawA = true
		}
		if contains(c.Headings, "Section B") {
			sawB = true
		}
		if contains(c.Headings, "Subsection B1") {
			sawB1 = true
		}
	}
	if !sawA || !sawB || !sawB1 {
		t.Errorf("missing chunks: sawA=%v sawB=%v sawB1=%v", sawA, sawB, sawB1)
	}
}

func TestChunkMarkdownDetectsADRNumber(t *testing.T) {
	src := "# ADR\n\ncontent"
	chunks := ChunkMarkdown("docs/adr/0007-tooling.md", src, DefaultMarkdownOpts())
	if len(chunks) == 0 {
		t.Fatalf("expected at least 1 chunk")
	}
	if chunks[0].ADRNumber != "0007" {
		t.Errorf("expected ADRNumber=0007, got %q", chunks[0].ADRNumber)
	}
}

func TestChunkMarkdownEmptySourceProducesOneChunk(t *testing.T) {
	chunks := ChunkMarkdown("empty.md", "", DefaultMarkdownOpts())
	if len(chunks) != 1 {
		t.Errorf("expected 1 chunk for empty source, got %d", len(chunks))
	}
}

func TestChunkMarkdownDoesNotSplitInsideFences(t *testing.T) {
	src := "# Top\n\n```\n## NotAHeading\n```\n\nbody\n"
	chunks := ChunkMarkdown("test.md", src, DefaultMarkdownOpts())
	// We expect 1 chunk (the top-level heading); the fence should not
	// produce a false-positive `## NotAHeading` section.
	if len(chunks) != 1 {
		t.Errorf("expected 1 chunk (fenced ## should be ignored), got %d", len(chunks))
	}
}

func contains(xs []string, target string) bool {
	for _, x := range xs {
		if x == target {
			return true
		}
	}
	return false
}

// Sanity: a markdown file that exceeds the per-chunk token budget is
// windowed into multiple chunks.
func TestChunkMarkdownWindowed(t *testing.T) {
	var sb strings.Builder
	sb.WriteString("# Big\n\n")
	for i := 0; i < 1000; i++ {
		sb.WriteString("more words more words more words more words more words\n\n")
	}
	chunks := ChunkMarkdown("big.md", sb.String(), MarkdownOpts{MaxTokens: 100, OverlapTokens: 10, MinChunkTokens: 0})
	if len(chunks) < 2 {
		t.Errorf("expected windowed split into multiple chunks, got %d", len(chunks))
	}
}
