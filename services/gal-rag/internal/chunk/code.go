// Package chunk splits source code and markdown documents into chunks
// suitable for embedding and vector upsert.
package chunk

import (
	"regexp"
	"strings"

	"github.com/alecthomas/chroma/v2"
	"github.com/alecthomas/chroma/v2/lexers"
)

// CodeChunk is the chunker's output for code sources.
type CodeChunk struct {
	ByteStart  int
	ByteEnd    int
	LineStart  int
	LineEnd    int
	Language   string
	Symbols    []string
	Content    string
	TokenCount int
}

// lineInfo is the per-line metadata we keep while chunking.
type lineInfo struct {
	start  int    // byte offset of first char on this line
	end    int    // byte offset just past last char (i.e. start of next line)
	text   string // joined token text for this line
	tokenN int
}

// CodeOpts controls code-chunking behaviour.
type CodeOpts struct {
	// MaxTokens is the per-chunk budget. If a single function exceeds
	// this, the chunker falls back to a sliding window of MaxTokens with
	// Overlap tokens.
	MaxTokens int
	// Overlap is the token overlap between windows.
	Overlap int
}

// DefaultCodeOpts matches TECH.md 6.2.1 (1200 tokens / 200 overlap).
func DefaultCodeOpts() CodeOpts {
	return CodeOpts{MaxTokens: 1200, Overlap: 200}
}

// ChunkCode splits a source file into chunks using a chroma tokenizer.
//
// Strategy:
//  1. Tokenize the source and identify line boundaries for `func NAME(`
//     and `type NAME {` definitions.
//  2. Build one chunk per definition, spanning from the def start to the
//     end of its body. The body extent is approximated by tracking
//     brace depth starting at the def's first `{`.
//  3. If a chunk exceeds the token budget, split it into a sliding window
//     of the original line ranges.
//  4. Anything outside a definition (top-level constants, package decl,
//     imports) is captured as a leading preamble chunk.
func ChunkCode(language, source string, opts CodeOpts) []CodeChunk {
	if opts.MaxTokens == 0 {
		opts = DefaultCodeOpts()
	}

	// Resolve language → chroma lexer name.
	lexerName := mapLanguage(language)
	lexer := lexers.Get(lexerName)
	if lexer == nil {
		lexer = lexers.Fallback
	}
	lexer = chroma.Coalesce(lexer)

	it, err := lexer.Tokenise(nil, source)
	if err != nil {
		return fallbackWindow(source, opts)
	}
	tokens := it.Tokens()
	lines := chroma.SplitTokensIntoLines(tokens)

	// Build a per-line token text representation so we can count tokens
	// per line. We also need line→byte-offset and byte→line-offset maps.
	_ = "lineInfo is now at package scope"
	lis := make([]lineInfo, len(lines))
	pos := 0
	for i, lt := range lines {
		var sb strings.Builder
		for _, t := range lt {
			sb.WriteString(t.Value)
		}
		text := sb.String()
		lis[i] = lineInfo{
			start:  pos,
			end:    pos + len(text),
			text:   text,
			tokenN: len(lt),
		}
		pos += len(text)
		// Trim the trailing newline into the line so the next line starts
		// on the next byte.
		if pos < len(source) && source[pos] == '\n' {
			pos++
		}
	}

	// Locate def starts by scanning lines for `func` / `type` patterns.
	// We use a regex over the joined-line text — fast and language-friendly.
	defs := scanDefs(language, lis)

	// Build chunks.
	var chunks []CodeChunk
	if len(defs) == 0 {
		// No structured defs — emit a single full-file chunk (or a
		// windowed split if too large).
		full := windowize(0, len(lis)-1, lis, source, opts)
		chunks = append(chunks, full...)
	} else {
		// Preamble: lines before the first def.
		if defs[0].lineStart > 0 {
			pre := windowize(0, defs[0].lineStart-1, lis, source, opts)
			chunks = append(chunks, pre...)
		}
		for i, d := range defs {
			endLine := d.lineEnd
			if i+1 < len(defs) {
				// Stop at the line before the next def, since there's
				// usually a blank line separator.
				endLine = defs[i+1].lineStart - 1
			}
			if endLine < d.lineStart {
				endLine = d.lineStart
			}
			wins := windowize(d.lineStart, endLine, lis, source, opts)
			// Tag each window with the def's symbols.
			for k := range wins {
				if wins[k].Symbols == nil {
					wins[k].Symbols = []string{}
				}
				wins[k].Symbols = append(wins[k].Symbols, d.symbols...)
				wins[k].Language = d.language
			}
			chunks = append(chunks, wins...)
		}
	}

	// If everything was empty (e.g. file with no newlines), fall back.
	if len(chunks) == 0 {
		return fallbackWindow(source, opts)
	}
	return chunks
}

// def is a located top-level definition: function, method, or type.
type def struct {
	kind       string
	symbols    []string
	language   string
	lineStart  int // 0-indexed inclusive
	lineEnd    int // 0-indexed inclusive
}

// Language-agnostic def scanner. Recognises the common forms:
//
//	func Name( ...
//	func (recv) Name( ...
//	type Name struct/interface/...
//
// for Go, and the equivalent C-family / Python forms. We keep the
// patterns narrow so we don't accidentally match a comment.
var (
	goFuncRe   = regexp.MustCompile(`^\s*func\s*(?:\([^)]*\)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(?`)
	goTypeRe   = regexp.MustCompile(`^\s*type\s+([A-Za-z_][A-Za-z0-9_]*)\s+`)
	cLikeFunc  = regexp.MustCompile(`^\s*(?:[A-Za-z_][A-Za-z0-9_:*&<>\s]+?\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\([^;]*\)\s*(?:\{|throws|;)`)
	cLikeClass = regexp.MustCompile(`^\s*(?:class|struct|interface|enum|trait)\s+([A-Za-z_][A-Za-z0-9_]*)`)
	pyDef      = regexp.MustCompile(`^\s*def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(`)
	pyClass    = regexp.MustCompile(`^\s*class\s+([A-Za-z_][A-Za-z0-9_]*)`)
)

func scanDefs(language string, lis []lineInfo) []def {
	var out []def
	lang := strings.ToLower(language)
	braceDepth := 0
	for i, li := range lis {
		text := li.text
		var m []string
		var kind, name string
		switch {
		case lang == "go":
			if m = goFuncRe.FindStringSubmatch(text); m != nil {
				kind, name = "func", m[1]
			} else if m = goTypeRe.FindStringSubmatch(text); m != nil {
				kind, name = "type", m[1]
			}
		case lang == "python" || lang == "py":
			if m = pyDef.FindStringSubmatch(text); m != nil {
				kind, name = "func", m[1]
			} else if m = pyClass.FindStringSubmatch(text); m != nil {
				kind, name = "type", m[1]
			}
		default:
			// C-family (rust, ts, js, c, cpp, java, kotlin, swift).
			if m = cLikeClass.FindStringSubmatch(text); m != nil {
				kind, name = "type", m[1]
			} else if m = cLikeFunc.FindStringSubmatch(text); m != nil {
				kind, name = "func", m[1]
			}
		}
		if kind == "" {
			// Track braces so we don't try to def-match inside a body.
			braceDepth += strings.Count(text, "{") - strings.Count(text, "}")
			if braceDepth < 0 {
				braceDepth = 0
			}
			continue
		}
		// Found a def. Determine body extent by tracking braces from here.
		openCount := strings.Count(text, "{")
		closeCount := strings.Count(text, "}")
		bodyDepth := openCount - closeCount
		end := i
		if bodyDepth > 0 || (openCount > 0 && (lang == "rust" || lang == "ts" || lang == "typescript" || lang == "javascript" || lang == "js")) {
			j := i + 1
			for j < len(lis) && bodyDepth > 0 {
				bodyDepth += strings.Count(lis[j].text, "{") - strings.Count(lis[j].text, "}")
				j++
			}
			// For languages that use indentation (Python), if no braces
			// found, use a heuristic: next blank line followed by
			// non-indented content.
			if j == i+1 && (lang == "python" || lang == "py") {
				indent := leadingWhitespace(lis[i].text)
				j = i + 1
				for j < len(lis) {
					if lis[j].text == "" || strings.HasPrefix(lis[j].text, indent) || strings.HasPrefix(lis[j].text, "\t") {
						j++
						continue
					}
					break
				}
				j--
			}
			end = j - 1
			if end < i {
				end = i
			}
		}
		// If we didn't open a brace at all (e.g. function declaration
		// with body in next line), extend to the next blank line.
		if openCount == 0 && !(lang == "python" || lang == "py") {
			j := i + 1
			for j < len(lis) {
				if strings.TrimSpace(lis[j].text) == "" {
					break
				}
				j++
			}
			end = j - 1
			if end < i {
				end = i
			}
		}

		out = append(out, def{
			kind:      kind,
			symbols:   []string{name},
			language:  language,
			lineStart: i,
			lineEnd:   end,
		})
	}
	return out
}

// windowize splits a line range into ≤ MaxTokens-token windows.
func windowize(lineStart, lineEnd int, lis []lineInfo, source string, opts CodeOpts) []CodeChunk {
	if lineStart < 0 {
		lineStart = 0
	}
	if lineEnd >= len(lis) {
		lineEnd = len(lis) - 1
	}
	if lineEnd < lineStart {
		return nil
	}

	// Collect the line range as a single blob first.
	var sb strings.Builder
	for i := lineStart; i <= lineEnd; i++ {
		sb.WriteString(lis[i].text)
		sb.WriteByte('\n')
	}
	blob := sb.String()
	tokens := approxTokens(blob)

	if tokens <= opts.MaxTokens {
		return []CodeChunk{{
			ByteStart:  lis[lineStart].start,
			ByteEnd:    lis[lineEnd].end,
			LineStart:  lineStart,
			LineEnd:    lineEnd,
			Content:    blob,
			TokenCount: tokens,
			Symbols:    []string{},
			Language:   "",
		}}
	}

	// Sliding window over lines.
	var chunks []CodeChunk
	i := lineStart
	for i <= lineEnd {
		j := i
		count := 0
		for j <= lineEnd && count+lis[j].tokenN <= opts.MaxTokens {
			count += lis[j].tokenN
			j++
		}
		if j == i {
			j = i + 1 // guarantee progress on a single oversized line
		}
		var sb2 strings.Builder
		for k := i; k < j; k++ {
			sb2.WriteString(lis[k].text)
			sb2.WriteByte('\n')
		}
		chunks = append(chunks, CodeChunk{
			ByteStart:  lis[i].start,
			ByteEnd:    lis[minInt(j-1, lineEnd)].end,
			LineStart:  i,
			LineEnd:     minInt(j-1, lineEnd),
			Content:    sb2.String(),
			TokenCount: count,
			Symbols:    []string{},
			Language:   "",
		})
		if j > lineEnd {
			break
		}
		// Step forward by (window - overlap).
		step := j - i - opts.Overlap
		if step < 1 {
			step = 1
		}
		i += step
	}
	return chunks
}

func fallbackWindow(source string, opts CodeOpts) []CodeChunk {
	lines := strings.Split(source, "\n")
	// Build trivial lineInfo from raw bytes.
	pos := 0
	lis := make([]lineInfo, len(lines))
	for i, l := range lines {
		lis[i] = lineInfo{start: pos, end: pos + len(l), text: l, tokenN: approxTokens(l)}
		pos += len(l) + 1
	}
	return windowize(0, len(lis)-1, lis, source, opts)
}

func leadingWhitespace(s string) string {
	for i, r := range s {
		if r != ' ' && r != '\t' {
			return s[:i]
		}
	}
	return s
}

// approxTokens is a fast, model-agnostic token count: 1 token per ~4
// characters, rounded up. It's used only for budget enforcement, not for
// the stored tokenCount in payloads — the embedding service is the
// source of truth there.
func approxTokens(s string) int {
	if len(s) == 0 {
		return 0
	}
	return (len(s) + 3) / 4
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func mapLanguage(language string) string {
	switch strings.ToLower(language) {
	case "go", "golang":
		return "go"
	case "rust", "rs":
		return "rust"
	case "ts", "typescript":
		return "typescript"
	case "js", "javascript":
		return "javascript"
	case "py", "python":
		return "python"
	case "java":
		return "java"
	case "kt", "kotlin":
		return "kotlin"
	case "swift":
		return "swift"
	case "c", "h":
		return "c"
	case "cpp", "c++", "cc", "cxx", "hpp":
		return "cpp"
	default:
		return strings.ToLower(language)
	}
}

// _ ensures chroma types is referenced (avoids unused-import errors when
// trimming; we keep it for future symbol-by-token analysis).
var _ = chroma.NameFunction
