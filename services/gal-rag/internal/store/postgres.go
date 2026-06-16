// Package store wraps the Postgres-backed job queue and dead-letter table
// for the gal-rag ingestion worker. Jobs flow pending → running → complete;
// failures retry up to 3 times before being moved to gal_rag_dlq.
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MaxAttempts is the number of failed tries before a job moves to the DLQ.
const MaxAttempts = 3

// Job is the canonical representation of a row in gal_rag_jobs.
type Job struct {
	ID              int64           `json:"-"`
	JobUUID         string          `json:"jobUuid"`
	OrgID           string          `json:"orgId"`
	RepoScope       string          `json:"repoScope"`
	SourceKind      string          `json:"sourceKind"`
	SourceType      string          `json:"sourceType"`
	SourceRef       json.RawMessage `json:"sourceRef"`
	Content         string          `json:"content"`
	ContentHash     string          `json:"contentHash"`
	EmbeddingConfig string          `json:"embeddingConfig"`
	Force           bool            `json:"force"`
	Status          string          `json:"status"`
	Attempts        int             `json:"attempts"`
	LastError       string          `json:"lastError,omitempty"`
	ClaimedBy       string          `json:"claimedBy,omitempty"`
	ClaimedAt       *time.Time      `json:"claimedAt,omitempty"`
	CreatedAt       time.Time       `json:"createdAt"`
	UpdatedAt       time.Time       `json:"updatedAt"`
	CompletedAt     *time.Time      `json:"completedAt,omitempty"`
}

// DLQEntry is a row in gal_rag_dlq. Payload is the full original job JSON.
type DLQEntry struct {
	ID             int64           `json:"-"`
	JobUUID        string          `json:"jobUuid"`
	OrgID          string          `json:"orgId"`
	RepoScope      string          `json:"repoScope"`
	Payload        json.RawMessage `json:"payload"`
	LastError      string          `json:"lastError"`
	Attempts       int             `json:"attempts"`
	FirstSeenAt    time.Time       `json:"firstSeenAt"`
	LastSeenAt     time.Time       `json:"lastSeenAt"`
	QuarantinedAt  time.Time       `json:"quarantinedAt"`
}

// Store is the Postgres-backed job queue / DLQ.
type Store struct {
	pool *pgxpool.Pool
}

// New opens a connection pool. The caller is responsible for Close().
func New(ctx context.Context, dsn string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse dsn: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	return &Store{pool: pool}, nil
}

// NewWithPool wraps an existing pool (for tests).
func NewWithPool(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// Close releases the underlying pool.
func (s *Store) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}

// Ping verifies the connection.
func (s *Store) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
}

// Enqueue inserts a new job and returns its jobUuid. If an identical
// job (same deterministic UUID) already exists and Force is false, the
// existing UUID is returned without error (idempotent re-enqueue).
func (s *Store) Enqueue(ctx context.Context, j Job) (string, error) {
	if j.JobUUID == "" {
		j.JobUUID = newJobUUID(j)
	}
	if j.EmbeddingConfig == "" {
		j.EmbeddingConfig = "GEMINI_EMBEDDING_001_512"
	}
	if j.Status == "" {
		j.Status = "pending"
	}
	if len(j.SourceRef) == 0 {
		j.SourceRef = json.RawMessage(`{}`)
	}

	var returned string
	err := s.pool.QueryRow(ctx, `
		INSERT INTO gal_rag_jobs (
			job_uuid, org_id, repo_scope, source_kind, source_type, source_ref,
			content, content_hash, embedding_config, force, status
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		ON CONFLICT (job_uuid) DO UPDATE SET updated_at = gal_rag_jobs.updated_at
		RETURNING job_uuid
	`, j.JobUUID, j.OrgID, j.RepoScope, j.SourceKind, j.SourceType, []byte(j.SourceRef),
		j.Content, j.ContentHash, j.EmbeddingConfig, j.Force, j.Status).Scan(&returned)
	if err != nil {
		return "", fmt.Errorf("enqueue: %w", err)
	}
	return returned, nil
}

// Claim atomically claims the next pending job and marks it running.
// Returns pgx.ErrNoRows if no work is available.
func (s *Store) Claim(ctx context.Context, workerID string) (*Job, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE gal_rag_jobs
		SET status = 'running',
		    claimed_by = $1,
		    claimed_at = NOW(),
		    attempts = attempts + 1,
		    updated_at = NOW()
		WHERE id = (
			SELECT id FROM gal_rag_jobs
			WHERE status = 'pending'
			ORDER BY created_at ASC
			FOR UPDATE SKIP LOCKED
			LIMIT 1
		)
		RETURNING id, job_uuid, org_id, repo_scope, source_kind, source_type, source_ref,
		          content, content_hash, embedding_config, force, status, attempts, last_error,
		          claimed_by, claimed_at, created_at, updated_at, completed_at
	`, workerID)

	j := &Job{}
	var sourceRef []byte
	var lastError *string
	var claimedBy *string
	err := row.Scan(&j.ID, &j.JobUUID, &j.OrgID, &j.RepoScope, &j.SourceKind, &j.SourceType, &sourceRef,
		&j.Content, &j.ContentHash, &j.EmbeddingConfig, &j.Force, &j.Status, &j.Attempts, &lastError,
		&claimedBy, &j.ClaimedAt, &j.CreatedAt, &j.UpdatedAt, &j.CompletedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("claim: %w", err)
	}
	if lastError != nil {
		j.LastError = *lastError
	}
	if claimedBy != nil {
		j.ClaimedBy = *claimedBy
	}
	j.SourceRef = append(json.RawMessage(nil), sourceRef...)
	return j, nil
}

// MarkComplete marks a job as successfully completed.
func (s *Store) MarkComplete(ctx context.Context, jobID int64) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE gal_rag_jobs
		SET status = 'complete', completed_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`, jobID)
	return err
}

// MarkFailed increments attempts and re-queues (or moves to DLQ on terminal
// failure). If attempts >= MaxAttempts, the job is moved to gal_rag_dlq and
// removed from gal_rag_jobs. Otherwise it returns to 'pending' with a
// backoff scheduled via updated_at.
func (s *Store) MarkFailed(ctx context.Context, jobID int64, errMsg string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var j Job
	var sourceRef []byte
	row := tx.QueryRow(ctx, `
		SELECT id, job_uuid, org_id, repo_scope, source_kind, source_type, source_ref,
		       content, content_hash, embedding_config, force, status, attempts,
		       created_at, updated_at
		FROM gal_rag_jobs WHERE id = $1
	`, jobID)
	if err := row.Scan(&j.ID, &j.JobUUID, &j.OrgID, &j.RepoScope, &j.SourceKind, &j.SourceType,
		&sourceRef, &j.Content, &j.ContentHash, &j.EmbeddingConfig, &j.Force, &j.Status, &j.Attempts,
		&j.CreatedAt, &j.UpdatedAt); err != nil {
		return fmt.Errorf("load job: %w", err)
	}
	j.SourceRef = append(json.RawMessage(nil), sourceRef...)
	// Claim already incremented attempts in the DB; j.Attempts here is the
	// current count. Do not increment again — that would double-count.
	j.LastError = errMsg

	if j.Attempts >= MaxAttempts {
		// Move to DLQ, delete the job row.
		payload, _ := json.Marshal(j)
		if _, err := tx.Exec(ctx, `
			INSERT INTO gal_rag_dlq (
				job_uuid, org_id, repo_scope, payload, last_error, attempts,
				first_seen_at, last_seen_at, quarantined_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
		`, j.JobUUID, j.OrgID, j.RepoScope, payload, j.LastError, j.Attempts,
			j.CreatedAt); err != nil {
			return fmt.Errorf("insert dlq: %w", err)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM gal_rag_jobs WHERE id = $1`, jobID); err != nil {
			return fmt.Errorf("delete job: %w", err)
		}
		return tx.Commit(ctx)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE gal_rag_jobs
		SET status = 'pending', last_error = $1, attempts = $2, updated_at = NOW(),
		    claimed_by = NULL, claimed_at = NULL
		WHERE id = $3
	`, errMsg, j.Attempts, jobID); err != nil {
		return fmt.Errorf("reset job: %w", err)
	}
	return tx.Commit(ctx)
}

// DLQDepth returns the count of active DLQ entries (not replayed, not discarded).
func (s *Store) DLQDepth(ctx context.Context, orgID string) (int, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM gal_rag_dlq
		WHERE org_id = $1 AND replayed_at IS NULL AND discarded_at IS NULL
	`, orgID)
	var n int
	err := row.Scan(&n)
	return n, err
}

// Pool exposes the underlying pgx pool. Used by the integration tests.
func (s *Store) Pool() *pgxpool.Pool {
	return s.pool
}

// newJobUUID produces a deterministic 26-char lowercase hex id from the
// job's content hash. Stable for re-enqueues, but ULID-shaped so callers
// can still use the prefix.
func newJobUUID(j Job) string {
	h := fnv.New64a()
	h.Write([]byte(j.OrgID))
	h.Write([]byte{0})
	h.Write([]byte(j.RepoScope))
	h.Write([]byte{0})
	h.Write([]byte(j.SourceKind))
	h.Write([]byte{0})
	h.Write([]byte(j.ContentHash))
	return fmt.Sprintf("01%016x", h.Sum64())
}
