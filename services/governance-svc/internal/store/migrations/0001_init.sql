-- governance-svc OSS store schema (Postgres) — SEAM 1c.
--
-- Document-model port of the Firestore collections: each entity is one row with
-- the filter/order columns the handlers actually query on (derived from the
-- Firestore Where/OrderBy clauses in internal/store/governance.go) plus a `data`
-- jsonb column holding the full domain struct. This keeps the 27 Store methods
-- uniform (marshal/unmarshal whole structs; simple WHERE) and faithful to the
-- existing document semantics. Selected when GOV_STORE=postgres (OSS self-host).
--
-- Applied on boot by the Postgres adapter (mirrors gal-rag/migrations).

CREATE TABLE IF NOT EXISTS config_proposals (
    id         text PRIMARY KEY,
    org_id     text NOT NULL,
    status     text,
    scope      text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_config_proposals_org_created
    ON config_proposals (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS approved_configs (
    id         text PRIMARY KEY,
    org_id     text NOT NULL,
    platform   text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_approved_configs_org_platform_created
    ON approved_configs (org_id, platform, created_at DESC);

-- Auto-approval settings are one-per-org (in Firestore they were a special
-- settings_<org> doc inside approved_configs; here they get a clean own table).
CREATE TABLE IF NOT EXISTS auto_approval_settings (
    org_id     text PRIMARY KEY,
    updated_at timestamptz NOT NULL DEFAULT now(),
    data       jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS policies (
    id         text PRIMARY KEY,
    org_id     text NOT NULL,
    is_active  boolean NOT NULL DEFAULT false,
    type       text,            -- 'webhook' rows are surfaced by ListEnforcementWebhooks
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_policies_org_created
    ON policies (org_id, created_at DESC);
-- At most one active policy per org (ActivatePolicy deactivates the rest).
CREATE UNIQUE INDEX IF NOT EXISTS uq_policies_one_active_per_org
    ON policies (org_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS compliance_status (
    id         text PRIMARY KEY,
    org_id     text NOT NULL,
    repo_id    text,
    type       text,            -- 'developer' rows are surfaced by ListDeveloperCompliance
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_status_org
    ON compliance_status (org_id);

CREATE TABLE IF NOT EXISTS drift_reports (
    id         text PRIMARY KEY,
    org_id     text NOT NULL,
    app_id     text,
    created_at timestamptz NOT NULL DEFAULT now(),
    data       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drift_reports_org_created
    ON drift_reports (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tool_policies (
    id         text PRIMARY KEY,
    org_id     text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    data       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tool_policies_org
    ON tool_policies (org_id);

CREATE TABLE IF NOT EXISTS domain_audit (
    id         text PRIMARY KEY,
    org_id     text NOT NULL,
    domain     text,
    tool       text,
    action     text,
    created_at timestamptz NOT NULL DEFAULT now(),
    data       jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_domain_audit_org_created
    ON domain_audit (org_id, created_at DESC);
