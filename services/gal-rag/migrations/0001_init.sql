-- gal-rag initial schema
-- Run with: psql -d gal_rag -f migrations/0001_init.sql
--
-- Two tables:
--   gal_rag_jobs   — ingestion job queue (consumed by the worker pool)
--   gal_rag_dlq    — dead-letter queue for jobs that failed >= 3 times
--
-- Both tables are multi-tenant via org_id and indexed for the worker's
-- SELECT ... FOR UPDATE SKIP LOCKED claim pattern.

CREATE TABLE IF NOT EXISTS gal_rag_jobs (
    id              BIGSERIAL PRIMARY KEY,
    job_uuid        TEXT NOT NULL UNIQUE,
    org_id          TEXT NOT NULL,
    repo_scope      TEXT NOT NULL DEFAULT '',
    source_kind     TEXT NOT NULL,                    -- github_file | github_issue | github_pr | memory_entry | adr
    source_type     TEXT NOT NULL,                    -- go | rust | ts | py | md | issue | pr | adr | memory
    source_ref      JSONB NOT NULL,                   -- full SourceRef payload from TECH.md 5.1.2
    content         TEXT NOT NULL,                    -- raw text to chunk + embed
    content_hash    TEXT NOT NULL,                    -- sha256 of (org|repo|path|byteStart|byteEnd|content)
    embedding_config TEXT NOT NULL DEFAULT 'VOYAGE_CODE_3_512',
    force           BOOLEAN NOT NULL DEFAULT FALSE,   -- bypass dedup
    status          TEXT NOT NULL DEFAULT 'pending',  -- pending | running | complete | failed
    attempts        INT  NOT NULL DEFAULT 0,
    last_error      TEXT,
    claimed_by      TEXT,
    claimed_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gal_rag_jobs_pending
    ON gal_rag_jobs (status, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_gal_rag_jobs_org
    ON gal_rag_jobs (org_id, status);

CREATE INDEX IF NOT EXISTS idx_gal_rag_jobs_content_hash
    ON gal_rag_jobs (org_id, content_hash);

CREATE TABLE IF NOT EXISTS gal_rag_dlq (
    id              BIGSERIAL PRIMARY KEY,
    job_uuid        TEXT NOT NULL,
    org_id          TEXT NOT NULL,
    repo_scope      TEXT NOT NULL DEFAULT '',
    payload         JSONB NOT NULL,                   -- the full job record that failed
    last_error      TEXT NOT NULL,
    attempts        INT  NOT NULL,
    first_seen_at   TIMESTAMPTZ NOT NULL,
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    quarantined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    replayed_at     TIMESTAMPTZ,
    discarded_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_gal_rag_dlq_org
    ON gal_rag_dlq (org_id, quarantined_at);

CREATE INDEX IF NOT EXISTS idx_gal_rag_dlq_active
    ON gal_rag_dlq (org_id)
    WHERE replayed_at IS NULL AND discarded_at IS NULL;
