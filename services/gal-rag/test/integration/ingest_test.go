//go:build integration

// Run with: go test -tags=integration -timeout 3m ./gal-rag/test/integration/...
package integration_test

import (
	"context"
	"fmt"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/gal-run/gal/services/gal-rag/internal/ingest"
	"github.com/gal-run/gal/services/gal-rag/internal/store"
)

// startPostgres spins up a postgres:16-alpine container and returns a
// connected pool. The test is skipped (not failed) if Docker is unavailable.
func startPostgres(t *testing.T) (*pgxpool.Pool, func()) {
	t.Helper()
	ctx := context.Background()
	c, err := testcontainers.GenericContainer(ctx, testcontainers.GenericContainerRequest{
		ContainerRequest: testcontainers.ContainerRequest{
			Image:        "postgres:16-alpine",
			ExposedPorts: []string{"5432/tcp"},
			Env: map[string]string{
				"POSTGRES_DB":       "gal_rag",
				"POSTGRES_USER":     "gal",
				"POSTGRES_PASSWORD": "gal",
			},
			WaitingFor: wait.ForListeningPort("5432/tcp").WithStartupTimeout(60 * time.Second),
		},
		Started: true,
	})
	if err != nil {
		t.Skipf("docker unavailable, skipping integration test: %v", err)
	}

	host, _ := c.Host(ctx)
	port, _ := c.MappedPort(ctx, "5432")
	dsn := fmt.Sprintf("postgres://gal:gal@%s:%s/gal_rag?sslmode=disable", host, port.Port())

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		_ = c.Terminate(ctx)
		t.Fatalf("pg pool: %v", err)
	}

	// Retry ping — container may not accept connections immediately.
	for i := 0; i < 10; i++ {
		if pool.Ping(ctx) == nil {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}

	if _, err := pool.Exec(ctx, integrationSchemaSQL); err != nil {
		pool.Close()
		_ = c.Terminate(ctx)
		t.Fatalf("apply schema: %v", err)
	}

	return pool, func() {
		pool.Close()
		_ = c.Terminate(ctx)
	}
}

func TestJobLifecycle(t *testing.T) {
	pool, cleanup := startPostgres(t)
	defer cleanup()

	ctx := context.Background()
	st := store.NewWithPool(pool)

	// Enqueue.
	jobID, err := ingest.Enqueue(ctx, st, ingest.EnqueueRequest{
		OrgID:      "test-org",
		RepoScope:  "example-org/example-repo",
		SourceKind: "memory_entry",
		SourceType: "memory",
		Content:    "hello world integration test",
	})
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	if jobID == "" {
		t.Fatal("expected non-empty jobUuid")
	}

	// Claim.
	job, err := st.Claim(ctx, "worker-1")
	if err != nil {
		t.Fatalf("Claim: %v", err)
	}
	if job == nil {
		t.Fatal("expected job, got nil")
	}
	if job.OrgID != "test-org" {
		t.Errorf("OrgID = %q, want %q", job.OrgID, "test-org")
	}
	if job.Status != "running" {
		t.Errorf("Status = %q after claim, want %q", job.Status, "running")
	}

	// Second claim returns nothing — job is already claimed.
	job2, err := st.Claim(ctx, "worker-2")
	if err != nil {
		t.Fatalf("second Claim: %v", err)
	}
	if job2 != nil {
		t.Errorf("expected no job for second claim, got %+v", job2)
	}

	// Complete.
	if err := st.MarkComplete(ctx, job.ID); err != nil {
		t.Fatalf("MarkComplete: %v", err)
	}
}

func TestDLQPromotion(t *testing.T) {
	pool, cleanup := startPostgres(t)
	defer cleanup()

	ctx := context.Background()
	st := store.NewWithPool(pool)

	jobID, err := ingest.Enqueue(ctx, st, ingest.EnqueueRequest{
		OrgID:      "test-org",
		RepoScope:  "example-org/example-repo",
		SourceKind: "github_file",
		SourceType: "go",
		Content:    "package main",
	})
	if err != nil || jobID == "" {
		t.Fatalf("Enqueue: %v (id=%q)", err, jobID)
	}

	// Fail the job store.MaxAttempts times — it should land in the DLQ.
	for i := 0; i < store.MaxAttempts; i++ {
		job, err := st.Claim(ctx, fmt.Sprintf("worker-%d", i))
		if err != nil || job == nil {
			t.Fatalf("Claim attempt %d: err=%v job=%v", i, err, job)
		}
		if err := st.MarkFailed(ctx, job.ID, "simulated error"); err != nil {
			t.Fatalf("MarkFailed attempt %d: %v", i, err)
		}
	}

	depth, err := st.DLQDepth(ctx, "test-org")
	if err != nil {
		t.Fatalf("DLQDepth: %v", err)
	}
	if depth < 1 {
		t.Errorf("DLQDepth = %d, want >= 1 after %d failures", depth, store.MaxAttempts)
	}

	// Job no longer claimable after DLQ promotion.
	job, err := st.Claim(ctx, "worker-final")
	if err != nil {
		t.Fatalf("post-DLQ Claim: %v", err)
	}
	if job != nil {
		t.Errorf("expected no claimable job after DLQ promotion, got %+v", job)
	}
}

func TestDeduplication(t *testing.T) {
	pool, cleanup := startPostgres(t)
	defer cleanup()

	ctx := context.Background()
	st := store.NewWithPool(pool)

	req := ingest.EnqueueRequest{
		OrgID:      "test-org",
		RepoScope:  "example-org/example-repo",
		SourceKind: "github_file",
		SourceType: "go",
		Content:    "package dedup",
	}

	id1, err := ingest.Enqueue(ctx, st, req)
	if err != nil || id1 == "" {
		t.Fatalf("first Enqueue: %v (id=%q)", err, id1)
	}

	// Same content without Force → same job_uuid (dedup).
	id2, err := ingest.Enqueue(ctx, st, req)
	if err != nil {
		t.Fatalf("second Enqueue: %v", err)
	}
	if id1 != id2 {
		t.Errorf("expected same jobUuid on dedup, got %q vs %q", id1, id2)
	}

	// Same content with Force → new job.
	req.Force = true
	id3, err := ingest.Enqueue(ctx, st, req)
	if err != nil {
		t.Fatalf("forced Enqueue: %v", err)
	}
	if id3 == id1 {
		t.Errorf("Force=true should produce a new job, got same id %q", id3)
	}
}

// integrationSchemaSQL is the canonical schema from migrations/0001_init.sql,
// inlined so the test is hermetic (no filesystem dependency).
const integrationSchemaSQL = `
CREATE TABLE IF NOT EXISTS gal_rag_jobs (
    id              BIGSERIAL PRIMARY KEY,
    job_uuid        TEXT NOT NULL UNIQUE,
    org_id          TEXT NOT NULL,
    repo_scope      TEXT NOT NULL DEFAULT '',
    source_kind     TEXT NOT NULL,
    source_type     TEXT NOT NULL,
    source_ref      JSONB NOT NULL,
    content         TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    embedding_config TEXT NOT NULL DEFAULT 'VOYAGE_CODE_3_512',
    force           BOOLEAN NOT NULL DEFAULT FALSE,
    status          TEXT NOT NULL DEFAULT 'pending',
    attempts        INT  NOT NULL DEFAULT 0,
    last_error      TEXT,
    claimed_by      TEXT,
    claimed_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS gal_rag_dlq (
    id              BIGSERIAL PRIMARY KEY,
    job_uuid        TEXT NOT NULL,
    org_id          TEXT NOT NULL,
    repo_scope      TEXT NOT NULL DEFAULT '',
    payload         JSONB NOT NULL,
    last_error      TEXT NOT NULL,
    attempts        INT  NOT NULL,
    first_seen_at   TIMESTAMPTZ NOT NULL,
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    quarantined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    replayed_at     TIMESTAMPTZ,
    discarded_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gal_rag_jobs_status ON gal_rag_jobs (status, created_at)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_gal_rag_dlq_active ON gal_rag_dlq (org_id, quarantined_at)
    WHERE discarded_at IS NULL AND replayed_at IS NULL;
`
