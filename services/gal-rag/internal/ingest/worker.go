// Package ingest owns the goroutine pool that drains gal_rag_jobs and
// pushes the resulting chunks into the vector store. Non-GitHub sources
// (memory entries, ADRs, agent learnings) call Enqueue to schedule
// work directly.
package ingest

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"

	"github.com/gal-run/gal/services/gal-rag/internal/chunk"
	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
	"github.com/gal-run/gal/services/gal-rag/internal/embeddings"
	"github.com/gal-run/gal/services/gal-rag/internal/store"
	"github.com/google/uuid"
)

// Upserter is the subset of the vector-store surface the worker needs.
// We keep it as a local interface so the worker has no hard dependency
// on the qdrant package — tests can pass an in-memory fake, and a
// future HTTP-based or REST-based client can satisfy it.
type Upserter interface {
	// Upsert writes a batch of points. Each point carries the named
	// dense vectors (256-d and 512-d) and a payload matching the
	// schema in TECH.md 5.1.2.
	Upsert(ctx context.Context, points []*Point) error
	// ExistsByContentHash returns true if any point already has the
	// (orgId, contentHash) pair — used as a dedup gate.
	ExistsByContentHash(ctx context.Context, orgID, contentHash string) (bool, error)
	// DeleteByContentHash removes any existing point with the same
	// (orgId, contentHash) pair — used when force=true.
	DeleteByContentHash(ctx context.Context, orgID, contentHash string) error
}

// Point is the worker's view of a single chunk ready to write to the
// vector store. It mirrors the payload schema in TECH.md 5.1.2.
type Point struct {
	ID              string
	OrgID           string
	RepoScope       string
	SourceType      string
	SourceRef       contracts.SourceRef
	Chunk           contracts.ChunkMeta
	Content         string
	ContentHash     string
	Tags            []string
	EmbeddingConfig string
	TokenCount      int
	OpenAI256       []float32
	Voyage512       []float32
	CreatedAt       int64
	UpdatedAt       int64
}

// Worker is a fixed-size pool of goroutines that drains gal_rag_jobs.
type Worker struct {
	store        *store.Store
	upserter     Upserter
	embedder     *embeddings.Client
	fetcher      FileFetcher // optional; nil disables GitHub content fetch
	log          *slog.Logger
	concurrency  int
	pollInterval time.Duration
	wg           sync.WaitGroup
	stopCh       chan struct{}
	stopOnce     sync.Once
}

// Config configures a Worker. Concurrency defaults to 4 (matches
// TECH.md 6.1). PollInterval defaults to 1s.
type Config struct {
	Concurrency  int
	PollInterval time.Duration
}

// DefaultConfig returns the spec's defaults.
func DefaultConfig() Config {
	return Config{Concurrency: 4, PollInterval: 1 * time.Second}
}

// New constructs a Worker. Call Start to begin consuming.
func New(s *store.Store, up Upserter, emb *embeddings.Client, log *slog.Logger, cfg Config) *Worker {
	if cfg.Concurrency <= 0 {
		cfg.Concurrency = 4
	}
	if cfg.PollInterval <= 0 {
		cfg.PollInterval = 1 * time.Second
	}
	return &Worker{
		store:        s,
		upserter:     up,
		embedder:     emb,
		log:          log,
		concurrency:  cfg.Concurrency,
		pollInterval: cfg.PollInterval,
		stopCh:       make(chan struct{}),
	}
}

// SetFetcher attaches a GitHub file fetcher. When set, github_file jobs
// that arrive with empty Content have their content fetched from GitHub
// before chunking. When nil (the default), such jobs are no-ops — matching
// the previous behaviour. Call before Start.
func (w *Worker) SetFetcher(f FileFetcher) { w.fetcher = f }

// Start spawns the worker pool. Returns immediately; the workers run
// until Stop is called.
func (w *Worker) Start(ctx context.Context) {
	for i := 0; i < w.concurrency; i++ {
		workerID := fmt.Sprintf("gal-rag-worker-%d", i)
		w.wg.Add(1)
		go w.runLoop(ctx, workerID)
	}
}

// Stop signals the workers to exit and waits for them to finish.
func (w *Worker) Stop() {
	w.stopOnce.Do(func() { close(w.stopCh) })
	w.wg.Wait()
}

func (w *Worker) runLoop(ctx context.Context, workerID string) {
	defer w.wg.Done()
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stopCh:
			return
		case <-ticker.C:
			w.drain(ctx, workerID)
		}
	}
}

func (w *Worker) drain(ctx context.Context, workerID string) {
	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stopCh:
			return
		default:
		}
		job, err := w.store.Claim(ctx, workerID)
		if err != nil {
			w.log.Error("worker claim failed", "worker", workerID, "error", err)
			time.Sleep(2 * time.Second)
			return
		}
		if job == nil {
			return // queue empty
		}
		if err := w.processJob(ctx, job); err != nil {
			w.log.Warn("job failed", "worker", workerID, "job", job.JobUUID, "attempts", job.Attempts, "error", err)
			if mferr := w.store.MarkFailed(ctx, job.ID, err.Error()); mferr != nil {
				w.log.Error("MarkFailed failed", "worker", workerID, "job", job.JobUUID, "error", mferr)
			}
			continue
		}
		if err := w.store.MarkComplete(ctx, job.ID); err != nil {
			w.log.Error("MarkComplete failed", "worker", workerID, "job", job.JobUUID, "error", err)
		}
	}
}

// processJob runs the full pipeline for one job: chunk → embed → dedup →
// upsert. Errors are returned to the caller for retry/DLQ handling.
func (w *Worker) processJob(ctx context.Context, job *store.Job) error {
	// 0. For GitHub file jobs that arrive with no inline content, fetch the
	//    file from GitHub before chunking. Skips (binary/oversized/deleted)
	//    complete the job as a no-op; auth/rate-limit/transient errors are
	//    returned so the job re-queues.
	if job.Content == "" && strings.EqualFold(job.SourceKind, string(contracts.SourceRefGitHubFile)) {
		if err := w.fetchJobContent(ctx, job); err != nil {
			if reason, skip := skipReason(err); skip {
				w.log.Info("github_file skipped; marking complete",
					"job", job.JobUUID, "reason", reason)
				return nil
			}
			// Retryable (auth/rate-limit/transient) — surface for re-queue.
			return fmt.Errorf("fetch content: %w", err)
		}
	}

	// 1. Determine language / chunker from source type and extension.
	chunks, err := chunkSource(job)
	if err != nil {
		return fmt.Errorf("chunk: %w", err)
	}
	if len(chunks) == 0 {
		// Nothing to ingest (e.g. binary file or empty content) — treat
		// as a success so the job leaves the queue.
		w.log.Info("job produced no chunks; marking complete", "job", job.JobUUID)
		return nil
	}

	// 2. Embed all chunks in one batch.
	model := embeddings.Model(job.EmbeddingConfig)
	texts := make([]string, len(chunks))
	for i, c := range chunks {
		texts[i] = c.text
	}
	results, err := w.embedder.Embed(ctx, texts, model)
	if err != nil {
		return fmt.Errorf("embed: %w", err)
	}

	// 3. Build points, applying dedup and force semantics.
	var ref contracts.SourceRef
	if len(job.SourceRef) > 0 {
		_ = json.Unmarshal(job.SourceRef, &ref)
	}
	now := time.Now().Unix()
	points := make([]*Point, 0, len(chunks))
	for i, c := range chunks {
		contentHash := ContentHash(job.OrgID, job.RepoScope, ref.Path, c.byteStart, c.byteEnd, c.text)
		if !job.Force {
			exists, err := w.upserter.ExistsByContentHash(ctx, job.OrgID, contentHash)
			if err != nil {
				return fmt.Errorf("dedup lookup: %w", err)
			}
			if exists {
				w.log.Debug("skipping duplicate chunk", "job", job.JobUUID, "hash", contentHash)
				continue
			}
		} else {
			if err := w.upserter.DeleteByContentHash(ctx, job.OrgID, contentHash); err != nil {
				w.log.Warn("force delete failed; continuing", "error", err, "hash", contentHash)
			}
		}
		pt := &Point{
			ID:              chunkUUID(job.OrgID, contentHash, i),
			OrgID:           job.OrgID,
			RepoScope:       job.RepoScope,
			SourceType:      job.SourceType,
			SourceRef:       ref,
			Chunk: contracts.ChunkMeta{
				Index:     i,
				Total:     len(chunks),
				ByteStart: c.byteStart,
				ByteEnd:   c.byteEnd,
				Language:  c.language,
				Symbols:   c.symbols,
				Headings:  c.headings,
			},
			Content:         c.text,
			ContentHash:     contentHash,
			Tags:            c.tags,
			EmbeddingConfig: string(model),
			TokenCount:      results[i].Tokens,
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		// Populate only the named-vector slot matching the embedding model.
		// Writing a vector into the wrong-sized slot makes Qdrant reject the
		// whole upsert (e.g. a 512-dim vector in the 256-dim openai slot).
		switch model.VectorName() {
		case embeddings.VectorOpenAI256:
			pt.OpenAI256 = results[i].Vector
		default: // VectorVoyage512 — shared 512-dim slot (Voyage, Gemini, …)
			pt.Voyage512 = results[i].Vector
		}
		points = append(points, pt)
	}

	if len(points) == 0 {
		w.log.Info("all chunks deduplicated; nothing to upsert", "job", job.JobUUID)
		return nil
	}

	// 4. Upsert in batches of 64.
	const batch = 64
	for i := 0; i < len(points); i += batch {
		end := i + batch
		if end > len(points) {
			end = len(points)
		}
		if err := w.upserter.Upsert(ctx, points[i:end]); err != nil {
			return fmt.Errorf("upserter upsert: %w", err)
		}
	}
	w.log.Info("job processed", "job", job.JobUUID, "chunks", len(chunks), "upserted", len(points))
	return nil
}

// fetchJobContent resolves a github_file job's SourceRef and fetches the
// file content from GitHub, mutating job.Content in place on success. A nil
// return means content was populated (or the job is genuinely empty); an
// *errSkip means the path should be skipped (complete-not-failed); any other
// error is retryable.
func (w *Worker) fetchJobContent(ctx context.Context, job *store.Job) error {
	if w.fetcher == nil {
		// No fetcher configured: preserve the legacy no-op behaviour. The
		// empty content flows on to chunkSource → 0 chunks → complete.
		return &errSkip{reason: "no github fetcher configured"}
	}
	var ref contracts.SourceRef
	if len(job.SourceRef) > 0 {
		if err := json.Unmarshal(job.SourceRef, &ref); err != nil {
			return &errSkip{reason: "unparseable sourceRef"}
		}
	}
	content, err := FetchContent(ctx, w.fetcher, ref.InstallationID, ref.Owner, ref.Repo, ref.Path, ref.Ref)
	if err != nil {
		return err
	}
	job.Content = content
	return nil
}

// rawChunk is the chunker's output normalised across code/markdown so
// the rest of the pipeline doesn't need to care which strategy produced
// the chunk.
type rawChunk struct {
	text      string
	byteStart int
	byteEnd   int
	symbols   []string
	headings  []string
	language  string
	tags      []string
}

// chunkSource dispatches to the right chunker based on sourceType.
// Code and markdown are the two paths the spec calls out.
func chunkSource(job *store.Job) ([]rawChunk, error) {
	st := strings.ToLower(job.SourceType)
	if isMarkdown(st) {
		path := sourceRefPath(job)
		mc := chunk.ChunkMarkdown(path, job.Content, chunk.DefaultMarkdownOpts())
		out := make([]rawChunk, len(mc))
		for i, c := range mc {
			out[i] = rawChunk{
				text:      c.Content,
				byteStart: c.ByteStart,
				byteEnd:   c.ByteEnd,
				headings:  c.Headings,
				language:  "",
			}
		}
		return out, nil
	}
	language := languageForSourceType(st)
	cc := chunk.ChunkCode(language, job.Content, chunk.DefaultCodeOpts())
	out := make([]rawChunk, len(cc))
	for i, c := range cc {
		out[i] = rawChunk{
			text:      c.Content,
			byteStart: c.ByteStart,
			byteEnd:   c.ByteEnd,
			symbols:   c.Symbols,
			language:  c.Language,
		}
	}
	return out, nil
}

func isMarkdown(st string) bool {
	return st == "md" || st == "markdown" || st == "issue" || st == "pr" || st == "adr" || st == "memory"
}

func languageForSourceType(st string) string {
	switch st {
	case "go":
		return "go"
	case "rust":
		return "rust"
	case "ts":
		return "typescript"
	case "py":
		return "python"
	default:
		return st
	}
}

func sourceRefPath(job *store.Job) string {
	var ref contracts.SourceRef
	if len(job.SourceRef) > 0 {
		_ = json.Unmarshal(job.SourceRef, &ref)
	}
	return ref.Path
}

// chunkUUID produces a deterministic UUID v5 for a Qdrant point ID.
// Qdrant requires point IDs to be either unsigned integers or UUIDs.
// Using UUID v5 from (orgID + contentHash + chunkIndex) gives stable,
// collision-free IDs that survive re-ingestion of identical content.
var qdrantNS = uuid.MustParse("6ba7b810-9dad-11d1-80b4-00c04fd430c8") // uuid.NameSpaceURL

func chunkUUID(orgID, contentHash string, chunkIndex int) string {
	name := fmt.Sprintf("%s\x00%s\x00%d", orgID, contentHash, chunkIndex)
	return uuid.NewSHA1(qdrantNS, []byte(name)).String()
}
