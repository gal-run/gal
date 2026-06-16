// Postgres-backed governance Store (OSS self-host default). Doc-model: each row
// is the full domain struct as jsonb `data` plus the filter/order columns the
// handlers query on (see migrations/0001_init.sql). Selected by GOV_STORE=postgres.
// Modeled on gal-rag/internal/store/postgres.go (pgx/pgxpool).
package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/gal-run/gal/services/governance-svc/internal/domain"
)

// PostgresStore implements Store over a pgx pool.
type PostgresStore struct {
	pool *pgxpool.Pool
}

// Compile-time check: the Postgres store satisfies the same Store interface.
var _ Store = (*PostgresStore)(nil)

// NewPostgresStore opens a pool and applies the embedded migration on boot.
func NewPostgresStore(ctx context.Context, dsn, migrationSQL string) (*PostgresStore, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse dsn: %w", err)
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("open pool: %w", err)
	}
	if migrationSQL != "" {
		if _, err := pool.Exec(ctx, migrationSQL); err != nil {
			pool.Close()
			return nil, fmt.Errorf("migrate: %w", err)
		}
	}
	return &PostgresStore{pool: pool}, nil
}

// Close releases the pool.
func (s *PostgresStore) Close() { s.pool.Close() }

func newID() string { return uuid.NewString() }

// -------------- Proposals --------------

func (s *PostgresStore) ListProposals(ctx context.Context, orgID, status, scope string) ([]domain.ConfigProposal, error) {
	q := `SELECT data FROM config_proposals WHERE org_id=$1
	      AND ($2='' OR status=$2) AND ($3='' OR scope=$3)
	      ORDER BY created_at DESC`
	rows, err := s.pool.Query(ctx, q, orgID, status, scope)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.ConfigProposal{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var p domain.ConfigProposal
		if err := json.Unmarshal(raw, &p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *PostgresStore) CreateProposal(ctx context.Context, p *domain.ConfigProposal) (string, error) {
	p.ID = newID()
	p.CreatedAt = time.Now()
	p.UpdatedAt = time.Now()
	raw, _ := json.Marshal(p)
	_, err := s.pool.Exec(ctx,
		`INSERT INTO config_proposals(id,org_id,status,scope,created_at,updated_at,data)
		 VALUES($1,$2,$3,$4,$5,$6,$7)`,
		p.ID, p.OrgID, p.Status, p.Scope, p.CreatedAt, p.UpdatedAt, raw)
	return p.ID, err
}

func (s *PostgresStore) GetProposal(ctx context.Context, id string) (*domain.ConfigProposal, error) {
	var raw []byte
	err := s.pool.QueryRow(ctx, `SELECT data FROM config_proposals WHERE id=$1`, id).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var p domain.ConfigProposal
	return &p, json.Unmarshal(raw, &p)
}

func (s *PostgresStore) UpdateProposalStatus(ctx context.Context, id, status, approvedBy, comment string) error {
	p, err := s.GetProposal(ctx, id)
	if err != nil || p == nil {
		return err
	}
	p.Status = status
	p.ApprovedBy = approvedBy
	p.ReviewComment = comment
	p.ReviewedAt = time.Now()
	p.UpdatedAt = time.Now()
	raw, _ := json.Marshal(p)
	_, err = s.pool.Exec(ctx,
		`UPDATE config_proposals SET status=$2,updated_at=$3,data=$4 WHERE id=$1`,
		id, p.Status, p.UpdatedAt, raw)
	return err
}

func (s *PostgresStore) UpdateProposalContent(ctx context.Context, id string, updates map[string]any) error {
	p, err := s.GetProposal(ctx, id)
	if err != nil || p == nil {
		return err
	}
	// Re-marshal the struct merged with updates via a generic map round-trip.
	merged := structToMap(p)
	for k, v := range updates {
		merged[k] = v
	}
	merged["updatedAt"] = time.Now()
	raw, _ := json.Marshal(merged)
	status, _ := merged["status"].(string)
	_, err = s.pool.Exec(ctx,
		`UPDATE config_proposals SET status=$2,updated_at=now(),data=$3 WHERE id=$1`,
		id, status, raw)
	return err
}

// -------------- Approved Config --------------

func (s *PostgresStore) GetApprovedConfig(ctx context.Context, orgID, platform string) (*domain.ApprovedConfig, error) {
	var raw []byte
	err := s.pool.QueryRow(ctx,
		`SELECT data FROM approved_configs WHERE org_id=$1 AND platform=$2
		 ORDER BY created_at DESC LIMIT 1`, orgID, platform).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var ac domain.ApprovedConfig
	return &ac, json.Unmarshal(raw, &ac)
}

func (s *PostgresStore) SetApprovedConfig(ctx context.Context, ac *domain.ApprovedConfig) (string, error) {
	ac.ID = newID()
	ac.CreatedAt = time.Now()
	ac.UpdatedAt = time.Now()
	raw, _ := json.Marshal(ac)
	_, err := s.pool.Exec(ctx,
		`INSERT INTO approved_configs(id,org_id,platform,created_at,updated_at,data)
		 VALUES($1,$2,$3,$4,$5,$6)`,
		ac.ID, ac.OrgID, ac.Platform, ac.CreatedAt, ac.UpdatedAt, raw)
	return ac.ID, err
}

// -------------- Auto-Approval Settings --------------

func (s *PostgresStore) GetAutoApprovalSettings(ctx context.Context, orgID string) (*domain.AutoApprovalSettings, error) {
	var raw []byte
	err := s.pool.QueryRow(ctx, `SELECT data FROM auto_approval_settings WHERE org_id=$1`, orgID).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return &domain.AutoApprovalSettings{OrgID: orgID, Enabled: false, ConfidenceThreshold: 0.8, DryRun: true}, nil
	}
	if err != nil {
		return nil, err
	}
	var a domain.AutoApprovalSettings
	return &a, json.Unmarshal(raw, &a)
}

func (s *PostgresStore) SetAutoApprovalSettings(ctx context.Context, orgID string, a *domain.AutoApprovalSettings) error {
	a.OrgID = orgID
	a.UpdatedAt = time.Now()
	raw, _ := json.Marshal(a)
	_, err := s.pool.Exec(ctx,
		`INSERT INTO auto_approval_settings(org_id,updated_at,data) VALUES($1,$2,$3)
		 ON CONFLICT(org_id) DO UPDATE SET updated_at=$2,data=$3`,
		orgID, a.UpdatedAt, raw)
	return err
}

// -------------- Policies --------------

func (s *PostgresStore) ListPolicies(ctx context.Context, orgID string) ([]domain.Policy, error) {
	rows, err := s.pool.Query(ctx, `SELECT data FROM policies WHERE org_id=$1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Policy{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var p domain.Policy
		if err := json.Unmarshal(raw, &p); err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *PostgresStore) CreatePolicy(ctx context.Context, p *domain.Policy) (string, error) {
	p.ID = newID()
	p.CreatedAt = time.Now()
	p.UpdatedAt = time.Now()
	raw, _ := json.Marshal(p)
	_, err := s.pool.Exec(ctx,
		`INSERT INTO policies(id,org_id,is_active,type,created_at,updated_at,data)
		 VALUES($1,$2,$3,$4,$5,$6,$7)`,
		p.ID, p.OrgID, p.IsActive, "", p.CreatedAt, p.UpdatedAt, raw)
	return p.ID, err
}

func (s *PostgresStore) GetPolicy(ctx context.Context, id string) (*domain.Policy, error) {
	var raw []byte
	err := s.pool.QueryRow(ctx, `SELECT data FROM policies WHERE id=$1`, id).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var p domain.Policy
	return &p, json.Unmarshal(raw, &p)
}

func (s *PostgresStore) UpdatePolicy(ctx context.Context, id string, updates map[string]any) error {
	p, err := s.GetPolicy(ctx, id)
	if err != nil || p == nil {
		return err
	}
	merged := structToMap(p)
	for k, v := range updates {
		merged[k] = v
	}
	merged["updatedAt"] = time.Now()
	raw, _ := json.Marshal(merged)
	active, _ := merged["isActive"].(bool)
	_, err = s.pool.Exec(ctx, `UPDATE policies SET is_active=$2,updated_at=now(),data=$3 WHERE id=$1`, id, active, raw)
	return err
}

func (s *PostgresStore) DeletePolicy(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM policies WHERE id=$1`, id)
	return err
}

func (s *PostgresStore) ActivatePolicy(ctx context.Context, orgID, id string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck
	if _, err := tx.Exec(ctx,
		`UPDATE policies SET is_active=false, data=jsonb_set(data,'{isActive}','false')
		 WHERE org_id=$1 AND is_active=true`, orgID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE policies SET is_active=true,
		 data=jsonb_set(jsonb_set(data,'{isActive}','true'),'{updatedAt}',to_jsonb(now()))
		 WHERE id=$1`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// -------------- Compliance Status --------------

func (s *PostgresStore) GetComplianceStatus(ctx context.Context, orgID string) ([]domain.ComplianceStatus, error) {
	rows, err := s.pool.Query(ctx, `SELECT data FROM compliance_status WHERE org_id=$1 AND (type IS NULL OR type<>'developer')`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.ComplianceStatus{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var cs domain.ComplianceStatus
		if err := json.Unmarshal(raw, &cs); err != nil {
			return nil, err
		}
		out = append(out, cs)
	}
	return out, rows.Err()
}

func (s *PostgresStore) GetComplianceStatusForRepo(ctx context.Context, orgID, repoID string) (*domain.ComplianceStatus, error) {
	var raw []byte
	err := s.pool.QueryRow(ctx,
		`SELECT data FROM compliance_status WHERE org_id=$1 AND repo_id=$2 LIMIT 1`, orgID, repoID).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var cs domain.ComplianceStatus
	return &cs, json.Unmarshal(raw, &cs)
}

// -------------- Drift Reports --------------

func (s *PostgresStore) GetDriftReports(ctx context.Context, orgID string) ([]domain.DriftReport, error) {
	rows, err := s.pool.Query(ctx, `SELECT data FROM drift_reports WHERE org_id=$1 ORDER BY created_at DESC`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.DriftReport{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var dr domain.DriftReport
		if err := json.Unmarshal(raw, &dr); err != nil {
			return nil, err
		}
		out = append(out, dr)
	}
	return out, rows.Err()
}

func (s *PostgresStore) GetDriftReportForApp(ctx context.Context, orgID, appID string) (*domain.DriftReport, error) {
	var raw []byte
	err := s.pool.QueryRow(ctx,
		`SELECT data FROM drift_reports WHERE org_id=$1 AND app_id=$2 LIMIT 1`, orgID, appID).Scan(&raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var dr domain.DriftReport
	return &dr, json.Unmarshal(raw, &dr)
}

// -------------- Developer Compliance --------------

func (s *PostgresStore) ListDeveloperCompliance(ctx context.Context, orgID string) ([]domain.DeveloperCompliance, error) {
	rows, err := s.pool.Query(ctx, `SELECT data FROM compliance_status WHERE org_id=$1 AND type='developer'`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.DeveloperCompliance{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var dc domain.DeveloperCompliance
		if err := json.Unmarshal(raw, &dc); err != nil {
			return nil, err
		}
		out = append(out, dc)
	}
	return out, rows.Err()
}

func (s *PostgresStore) ReportDeveloperCompliance(ctx context.Context, orgID string, dc *domain.DeveloperCompliance) error {
	dc.OrgID = orgID
	dc.LastReported = time.Now()
	raw, _ := json.Marshal(dc)
	id := "dev_" + dc.DeveloperID
	_, err := s.pool.Exec(ctx,
		`INSERT INTO compliance_status(id,org_id,repo_id,type,created_at,updated_at,data)
		 VALUES($1,$2,'','developer',now(),now(),$3)
		 ON CONFLICT(id) DO UPDATE SET updated_at=now(),data=$3`,
		id, orgID, raw)
	return err
}

// -------------- Tool Policies --------------

func (s *PostgresStore) ListToolPolicies(ctx context.Context, orgID string) ([]domain.ToolPolicy, error) {
	rows, err := s.pool.Query(ctx, `SELECT data FROM tool_policies WHERE org_id=$1`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.ToolPolicy{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var tp domain.ToolPolicy
		if err := json.Unmarshal(raw, &tp); err != nil {
			return nil, err
		}
		out = append(out, tp)
	}
	return out, rows.Err()
}

func (s *PostgresStore) CreateToolPolicy(ctx context.Context, tp *domain.ToolPolicy) (string, error) {
	tp.ID = newID()
	tp.CreatedAt = time.Now()
	tp.UpdatedAt = time.Now()
	raw, _ := json.Marshal(tp)
	_, err := s.pool.Exec(ctx,
		`INSERT INTO tool_policies(id,org_id,created_at,updated_at,data) VALUES($1,$2,$3,$4,$5)`,
		tp.ID, tp.OrgID, tp.CreatedAt, tp.UpdatedAt, raw)
	return tp.ID, err
}

func (s *PostgresStore) DeleteToolPolicy(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM tool_policies WHERE id=$1`, id)
	return err
}

// -------------- Domain Audit --------------

func (s *PostgresStore) ListDomainAudit(ctx context.Context, orgID string, limit int) ([]domain.DomainAuditEntry, error) {
	q := `SELECT data FROM domain_audit WHERE org_id=$1 ORDER BY created_at DESC`
	args := []any{orgID}
	if limit > 0 {
		q += ` LIMIT $2`
		args = append(args, limit)
	}
	return s.queryAudit(ctx, q, args)
}

func (s *PostgresStore) QueryDomainAudit(ctx context.Context, orgID, queryDomain, tool, action string, limit int) ([]domain.DomainAuditEntry, error) {
	q := `SELECT data FROM domain_audit WHERE org_id=$1
	      AND ($2='' OR domain=$2) AND ($3='' OR tool=$3) AND ($4='' OR action=$4)
	      ORDER BY created_at DESC`
	args := []any{orgID, queryDomain, tool, action}
	if limit > 0 {
		q += ` LIMIT $5`
		args = append(args, limit)
	}
	return s.queryAudit(ctx, q, args)
}

func (s *PostgresStore) queryAudit(ctx context.Context, q string, args []any) ([]domain.DomainAuditEntry, error) {
	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.DomainAuditEntry{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var da domain.DomainAuditEntry
		if err := json.Unmarshal(raw, &da); err != nil {
			return nil, err
		}
		out = append(out, da)
	}
	return out, rows.Err()
}

// -------------- Enforcement Webhooks --------------

func (s *PostgresStore) ListEnforcementWebhooks(ctx context.Context, orgID string) ([]domain.EnforcementWebhook, error) {
	rows, err := s.pool.Query(ctx, `SELECT data FROM policies WHERE org_id=$1 AND type='webhook'`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.EnforcementWebhook{}
	for rows.Next() {
		var raw []byte
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var ew domain.EnforcementWebhook
		if err := json.Unmarshal(raw, &ew); err != nil {
			return nil, err
		}
		out = append(out, ew)
	}
	return out, rows.Err()
}

// structToMap round-trips a struct through JSON into a generic map so partial
// updates can merge without per-field SQL.
func structToMap(v any) map[string]any {
	raw, _ := json.Marshal(v)
	m := map[string]any{}
	_ = json.Unmarshal(raw, &m)
	return m
}
