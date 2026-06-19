package contracts

import "time"

// This file adds the search-specific DTOs that the /rag/* endpoints
// (Task #4) need. The core request/response types (SearchRequest,
// SearchResponse, Hit, etc.) live in contracts.go, owned by Task #3.
// We deliberately avoid redefining them; the new types here are
// additive (Evaluate, Graph, Timeline) plus the pipeline-internal
// SearchParams / ScoredHit used by the search.Searcher interface.

// EdgeKind enumerates the graph edges BFS will follow.
type EdgeKind string

const (
	EdgeImports    EdgeKind = "imports"
	EdgeCalls      EdgeKind = "calls"
	EdgeReferences EdgeKind = "references"
	EdgeImplements EdgeKind = "implements"
)

// GraphRequest is the body of POST /rag/graph.
type GraphRequest struct {
	SeedIDs   []string   `json:"seedIds"`
	Hops      int        `json:"hops"`
	EdgeKinds []EdgeKind `json:"edgeKinds"`
}

// GraphNode is a single node in the expansion.
type GraphNode struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Depth int    `json:"depth"`
}

// GraphEdge is a single edge in the expansion.
type GraphEdge struct {
	From string   `json:"from"`
	To   string   `json:"to"`
	Kind EdgeKind `json:"kind"`
}

// GraphResponse is the body returned by POST /rag/graph.
type GraphResponse struct {
	Nodes []GraphNode `json:"nodes"`
	Edges []GraphEdge `json:"edges"`
}

// TimelineWindow is the [from, to] range and bucket size.
type TimelineWindow struct {
	From   int64  `json:"from"`
	To     int64  `json:"to"`
	Bucket string `json:"bucket"` // "day" | "week"
}

// TimelineRequest is the body of POST /rag/timeline.
type TimelineRequest struct {
	Query  string         `json:"query"`
	Filter *Filter        `json:"filter,omitempty"`
	Window TimelineWindow `json:"window"`
}

// TimelineBucket is one time slice in the response.
type TimelineBucket struct {
	From    int64  `json:"from"`
	To      int64  `json:"to"`
	Count   int    `json:"count"`
	TopHits []Hit  `json:"topHits,omitempty"`
}

// TimelineResponse is the body returned by POST /rag/timeline.
type TimelineResponse struct {
	Buckets []TimelineBucket `json:"buckets"`
}

// EvaluateRequest is the body of POST /rag/evaluate.
type EvaluateRequest struct {
	Query     string   `json:"query"`
	ResultIDs []string `json:"resultIds"`
	Criteria  []string `json:"criteria,omitempty"`
}

// EvaluateScores is the per-criterion scoring block.
type EvaluateScores struct {
	Coverage  float64 `json:"coverage"`
	Freshness float64 `json:"freshness"`
	Diversity float64 `json:"diversity"`
}

// EvaluateResponse is the body returned by POST /rag/evaluate.
type EvaluateResponse struct {
	Scores             EvaluateScores `json:"scores"`
	Verdict            string         `json:"verdict"`
	SuggestedNextQuery string         `json:"suggestedNextQuery"`
}

// ─── Pipeline-internal types (not on the wire) ──────────────────────────────

// ScoredHit is a single candidate with per-signal scores that the ranker
// combines. Searchers emit this; the ranker consumes it. The Chunk field
// is a denormalized copy of a Hit (with full content) so the ranker can
// build a snippet and run coverage / diversity scoring without a second
// round-trip to Qdrant.
type ScoredHit struct {
	Chunk        Chunk
	VectorScore  float64 // cosine, [0,1]
	KeywordScore float64 // bm25 normalized, [0,1]
}

// Chunk is the small denormalized view of a Hit that the search
// algorithms need locally (full content for snippet/diversity, plus the
// metadata block).
type Chunk struct {
	ID         string
	OrgID      string
	RepoScope  string
	SourceType string
	SourceRef  SourceRef
	Chunk      ChunkMeta
	Content    string
	Tags       []string
	CreatedAt  int64
	UpdatedAt  int64
}

// ChunkMeta mirrors the payload field `chunk` from TECH.md 5.1.2.
// (Defined in contracts.go to keep all canonical DTOs in one place.)

// SearchParams carries the per-query knobs from the API request down to
// the Searcher. Filter is a *Filter (matches contracts.go) so a nil
// filter means "no scoping beyond orgId". QueryTokens is left nil to
// let the search layer tokenize once and reuse the slice.
type SearchParams struct {
	Query           string
	QueryTokens     []string
	EmbeddingConfig string
	TopK            int
	Filter          *Filter
	Now             time.Time
}

// DefaultRanking returns the spec's default weights from TECH.md 7.3.
func DefaultRanking() Ranking {
	return Ranking{VectorWeight: 0.7, KeywordWeight: 0.3, RecencyBoost: 0.1}
}
