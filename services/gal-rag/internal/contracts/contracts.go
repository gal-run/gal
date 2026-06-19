// Package contracts holds the wire DTOs that the gal-rag HTTP layer
// exchanges with clients (and the MCP tool wrappers in Task #5). All
// DTOs match the JSON shape documented in TECH.md §7 and the Qdrant
// payload schema in TECH.md §5.1.2.
//
// File layout:
//
//	contracts.go (this file) — wire DTOs + ingest webhook DTOs
//	search.go                 — graph / timeline / evaluate DTOs plus
//	                            pipeline-internal SearchParams / Chunk
package contracts

// ─── Source taxonomy ────────────────────────────────────────────────────────

// SourceType enumerates the asset kinds that can land in the index.
// Matches the `sourceType` payload field in TECH.md §5.1.2.
type SourceType string

const (
	SourceTypeGo     SourceType = "go"
	SourceTypeRust   SourceType = "rust"
	SourceTypeTS     SourceType = "ts"
	SourceTypePy     SourceType = "py"
	SourceTypeMD     SourceType = "md"
	SourceTypeIssue  SourceType = "issue"
	SourceTypePR     SourceType = "pr"
	SourceTypeADR    SourceType = "adr"
	SourceTypeMemory SourceType = "memory"
)

// SourceRefKind enumerates the kind of pointer carried by a chunk's
// source ref.
type SourceRefKind string

const (
	SourceRefGitHubFile  SourceRefKind = "github_file"
	SourceRefGitHubIssue SourceRefKind = "github_issue"
	SourceRefGitHubPR    SourceRefKind = "github_pr"
	SourceRefMemory      SourceRefKind = "memory_entry"
	SourceRefADR         SourceRefKind = "adr"
)

// SourceRef mirrors the payload field `sourceRef` from TECH.md §5.1.2.
// The `url` subfield is indexed by Qdrant for canonical-URL lookup.
type SourceRef struct {
	Kind  SourceRefKind `json:"kind"`
	Owner string        `json:"owner,omitempty"`
	Repo  string        `json:"repo,omitempty"`
	Path  string        `json:"path,omitempty"`
	Ref   string        `json:"ref,omitempty"`
	URL   string        `json:"url,omitempty"`
	// InstallationID is the GitHub App installation id for the repo. It is
	// plumbed from the repo-svc push webhook so the gal-rag worker can mint
	// an installation token and fetch file content for jobs that arrive
	// with empty Content. Zero means "unknown" → the worker skips the fetch.
	InstallationID int64 `json:"installationId,omitempty"`
}

// ChunkMeta mirrors the payload field `chunk` from TECH.md §5.1.2.
type ChunkMeta struct {
	Index     int
	Total     int
	ByteStart int
	ByteEnd   int
	Language  string
	Symbols   []string
	Headings  []string
	Imports   []string
}

// ─── /rag/search ───────────────────────────────────────────────────────────

// Filter narrows a search to a subset of the collection. All fields are
// optional; nil/empty means "no constraint". OrgID is forced server-side
// from the JWT and any override attempt returns 403 RAG_FILTER_FORBIDDEN.
type Filter struct {
	OrgID         string   `json:"orgId"`
	RepoScopes    []string `json:"repoScopes,omitempty"`
	SourceTypes   []string `json:"sourceTypes,omitempty"`
	Tags          []string `json:"tags,omitempty"`
	CreatedAfter  int64    `json:"createdAfter,omitempty"`
	CreatedBefore int64    `json:"createdBefore,omitempty"`
}

// Ranking holds the weight coefficients for the hybrid score formula
// in TECH.md §7.3. Defaults: α=0.7, β=0.3, γ=0.1.
type Ranking struct {
	VectorWeight           float64 `json:"vectorWeight,omitempty"`
	KeywordWeight          float64 `json:"keywordWeight,omitempty"`
	RecencyBoost           float64 `json:"recencyBoost,omitempty"`
	RecencyHalfLifeSeconds int64   `json:"recencyHalfLifeSeconds,omitempty"`
}

// SearchRequest is the body of POST /rag/search.
type SearchRequest struct {
	Query           string   `json:"query"`
	EmbeddingConfig string   `json:"embeddingConfig"`
	TopK            int      `json:"topK,omitempty"`
	Filter          *Filter  `json:"filter,omitempty"`
	Ranking         *Ranking `json:"ranking,omitempty"`
	IncludeContent  bool     `json:"includeContent,omitempty"`
}

// Hit is a single compact search result.
type Hit struct {
	ID              string    `json:"id"`
	Score           float64   `json:"score"`
	VectorScore     float64   `json:"vectorScore"`
	KeywordScore    float64   `json:"keywordScore"`
	SourceRef       SourceRef `json:"sourceRef"`
	Title           string    `json:"title"`
	Snippet         string    `json:"snippet"`
	Content         string    `json:"content,omitempty"`
	Tags            []string  `json:"tags,omitempty"`
	CreatedAt       int64     `json:"createdAt"`
	EmbeddingConfig string    `json:"embeddingConfig"`
}

// CompactHit is the wire-minimal form of a Hit (no full content).
// Used internally by the search pipeline and the /rag/evaluate scorer.
type CompactHit struct {
	ID        string
	Score     float64
	CreatedAt int64
}

// Coverage is the self-critique payload returned with each result set.
type Coverage struct {
	EstimatedRecall float64  `json:"estimatedRecall"`
	Gaps            []string `json:"gaps,omitempty"`
	NextQuery       []string `json:"nextQuery,omitempty"`
}

// SearchResponse is the body of POST /rag/search responses.
type SearchResponse struct {
	Results   []Hit     `json:"results"`
	NextQuery []string  `json:"nextQuery,omitempty"`
	Coverage  Coverage  `json:"coverage"`
}

// ─── /rag/get ──────────────────────────────────────────────────────────────

// GetRequest is the body of POST /rag/get.
type GetRequest struct {
	IDs []string `json:"ids"`
}

// GetResponse is the body of POST /rag/get responses.
type GetResponse struct {
	Chunks []Chunk `json:"chunks"`
}

// ─── Ingest webhook ────────────────────────────────────────────────────────

// IngestWebhook is the body POSTed by repo-svc when a GitHub push
// event lands. Matches the `repo_svc.events.ingest` event from
// TECH.md §6.5.
type IngestWebhook struct {
	EventID string `json:"eventId"`
	OrgID   string `json:"orgId"`
	Owner   string `json:"owner"`
	Repo    string `json:"repo"`
	Ref     string `json:"ref"`
	// InstallationID is the GitHub App installation id for this repo. The
	// gal-rag worker uses it to mint a token and fetch file content. Zero
	// (omitted) means the worker cannot fetch and will no-op the job.
	InstallationID int64    `json:"installationId,omitempty"`
	PathsChanged   []string `json:"pathsChanged"`
}

// IngestAck is the response body for the ingest webhook.
type IngestAck struct {
	Received bool     `json:"received"`
	JobIDs   []string `json:"jobIds"`
}
