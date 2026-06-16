package chunk

import (
	"regexp"
	"strings"
)

// MarkdownChunk is the chunker's output for markdown sources.
type MarkdownChunk struct {
	ByteStart int
	ByteEnd   int
	Headings  []string
	Content   string
	TokenEst  int
	// ADRNumber is populated for files matching docs/adr/NNNN-*.md per
	// the chunker contract in TECH.md §6.2.2.
	ADRNumber string
}

// MarkdownOpts controls markdown chunking.
type MarkdownOpts struct {
	// MaxTokens target window size (default 800).
	MaxTokens int
	// OverlapTokens between windows (default 100).
	OverlapTokens int
	// MinChunkTokens below which a chunk is merged into its neighbour.
	MinChunkTokens int
}

// DefaultMarkdownOpts matches TECH.md §6.2.2.
func DefaultMarkdownOpts() MarkdownOpts {
	return MarkdownOpts{MaxTokens: 800, OverlapTokens: 100, MinChunkTokens: 50}
}

// headingRe matches ATX-style headings (#, ##, …) and captures the
// heading text. Setext-style (===, ---) headings are detected below
// as a fallback.
var headingRe = regexp.MustCompile(`(?m)^(#{1,6})\s+(.+?)\s*#*\s*$`)

// fenceRe matches fenced code blocks ``` and ~~~ so we don't split
// inside them.
var fenceRe = regexp.MustCompile("(?s)(```[\\s\\S]*?```|~~~[\\s\\S]*?~~~)")

// adrPathRe extracts the ADR number from a path like
// "docs/adr/0007-tooling.md".
var adrPathRe = regexp.MustCompile(`(?:^|/)adr/(\d{4})[-_]`)

// ChunkMarkdown splits a markdown document into chunks based on heading
// boundaries, keeping heading text in the chunk preamble. If a section
// is too large, it is further windowed with OverlapTokens overlap.
func ChunkMarkdown(path, source string, opts MarkdownOpts) []MarkdownChunk {
	if opts.MaxTokens == 0 {
		opts = DefaultMarkdownOpts()
	}

	// Strip fenced code blocks; their byte ranges must still be tracked
	// for the final output. We mark them out, split on headings, then
	// re-insert.
	masked := fenceRe.ReplaceAllStringFunc(source, func(m string) string {
		var b strings.Builder
		for _, r := range m {
			if r == '\n' {
				b.WriteByte('\n')
			} else {
				b.WriteByte(' ')
			}
		}
		return b.String()
	})

	// Find heading positions in the masked source.
	type headingHit struct {
		level     int
		text      string
		byteStart int
	}
	var hits []headingHit
	for _, m := range headingRe.FindAllStringSubmatchIndex(masked, -1) {
		level := m[3] - m[2] // length of the "###" run
		text := masked[m[4]:m[5]]
		bs := m[0]
		hits = append(hits, headingHit{level: level, text: text, byteStart: bs})
	}

	// Slice source into heading-bounded sections.
	adr := ""
	if m := adrPathRe.FindStringSubmatch(path); m != nil {
		adr = m[1]
	}

	emit := func(headings []string, byteStart, byteEnd int) MarkdownChunk {
		if byteEnd > len(source) {
			byteEnd = len(source)
		}
		if byteStart > byteEnd {
			byteStart = byteEnd
		}
		var preamble strings.Builder
		for _, h := range headings {
			preamble.WriteString("# ")
			preamble.WriteString(h)
			preamble.WriteString("\n\n")
		}
		body := source[byteStart:byteEnd]
		content := preamble.String() + body
		return MarkdownChunk{
			ByteStart: byteStart,
			ByteEnd:   byteEnd,
			Headings:  headings,
			Content:   content,
			TokenEst:  approxTokens(content),
			ADRNumber: adr,
		}
	}

	var out []MarkdownChunk
	if len(hits) == 0 {
		out = append(out, emit([]string{}, 0, len(source)))
	} else {
		stack := make([]string, 0, 6)
		for i, h := range hits {
			for len(stack) >= h.level {
				stack = stack[:len(stack)-1]
			}
			stack = append(stack, h.text)
			end := len(source)
			if i+1 < len(hits) {
				end = hits[i+1].byteStart
			}
			out = append(out, emit(append([]string(nil), stack...), h.byteStart, end))
		}
	}

	// Windowed pass: any chunk over MaxTokens is split by approximate
	// line windows. The windowing is best-effort — we just split on
	// blank lines until the chunk fits.
	var windowed []MarkdownChunk
	for _, c := range out {
		if c.TokenEst <= opts.MaxTokens {
			windowed = append(windowed, c)
			continue
		}
		// Split on blank lines (two newlines).
		parts := strings.Split(c.Content, "\n\n")
		var rebuilt strings.Builder
		var startOffset int
		var headings = c.Headings
		var chunkText strings.Builder
		for _, p := range parts {
			if approxTokens(chunkText.String()+p+"\n\n") > opts.MaxTokens && chunkText.Len() > 0 {
				windowed = append(windowed, MarkdownChunk{
					ByteStart: c.ByteStart + startOffset,
					ByteEnd:   c.ByteStart + startOffset + len(chunkText.String()),
					Headings:  headings,
					Content:   chunkText.String(),
					TokenEst:  approxTokens(chunkText.String()),
					ADRNumber: c.ADRNumber,
				})
				startOffset += len(chunkText.String())
				_ = rebuilt
				chunkText.Reset()
			}
			chunkText.WriteString(p)
			chunkText.WriteString("\n\n")
		}
		if chunkText.Len() > 0 {
			windowed = append(windowed, MarkdownChunk{
				ByteStart: c.ByteStart + startOffset,
				ByteEnd:   c.ByteEnd,
				Headings:  headings,
				Content:   chunkText.String(),
				TokenEst:  approxTokens(chunkText.String()),
				ADRNumber: c.ADRNumber,
			})
		}
	}

	// Merge tiny trailing chunks into the previous one.
	if opts.MinChunkTokens > 0 {
		windowed = mergeTinyMarkdown(windowed, opts.MinChunkTokens)
	}
	return windowed
}

func mergeTinyMarkdown(chunks []MarkdownChunk, minTokens int) []MarkdownChunk {
	if len(chunks) <= 1 {
		return chunks
	}
	out := []MarkdownChunk{chunks[0]}
	for i := 1; i < len(chunks); i++ {
		c := chunks[i]
		if c.TokenEst < minTokens {
			prev := &out[len(out)-1]
			prev.Content = prev.Content + "\n\n" + c.Content
			prev.ByteEnd = c.ByteEnd
			prev.TokenEst = approxTokens(prev.Content)
			continue
		}
		out = append(out, c)
	}
	return out
}
