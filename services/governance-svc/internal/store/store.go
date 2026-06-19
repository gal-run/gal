// Package store defines the governance persistence boundary.
//
// Store is the storage-agnostic interface the PDP and HTTP handlers depend on.
// It exists to cut the self-hosted/cloud seam: the open-source build selects a
// zero-dependency single-tenant adapter (Postgres), while the managed cloud build
// selects the Firestore adapter. Callers depend on this interface, never on a
// concrete backend.
//
// Backend selection is by the GOV_STORE environment variable
// ("postgres" for OSS self-host, "firestore" for cloud). The Firestore adapter
// (and the Google Cloud SDK it links) lives behind a build tag so the OSS
// binary does not compile or ship it.
package store

import (
	"context"

	"github.com/gal-run/gal/services/governance-svc/internal/domain"
)

// Store is the full governance persistence surface. Any backend (Firestore,
// Postgres, ...) implements it identically; only operations and scale differ.
type Store interface {
	// Proposals
	ListProposals(ctx context.Context, orgID, status, scope string) ([]domain.ConfigProposal, error)
	CreateProposal(ctx context.Context, p *domain.ConfigProposal) (string, error)
	GetProposal(ctx context.Context, id string) (*domain.ConfigProposal, error)
	UpdateProposalStatus(ctx context.Context, id, status, approvedBy, comment string) error
	UpdateProposalContent(ctx context.Context, id string, updates map[string]any) error

	// Approved config
	GetApprovedConfig(ctx context.Context, orgID, platform string) (*domain.ApprovedConfig, error)
	SetApprovedConfig(ctx context.Context, ac *domain.ApprovedConfig) (string, error)

	// Auto-approval settings
	GetAutoApprovalSettings(ctx context.Context, orgID string) (*domain.AutoApprovalSettings, error)
	SetAutoApprovalSettings(ctx context.Context, orgID string, s *domain.AutoApprovalSettings) error

	// Policies
	ListPolicies(ctx context.Context, orgID string) ([]domain.Policy, error)
	CreatePolicy(ctx context.Context, p *domain.Policy) (string, error)
	GetPolicy(ctx context.Context, id string) (*domain.Policy, error)
	UpdatePolicy(ctx context.Context, id string, updates map[string]any) error
	DeletePolicy(ctx context.Context, id string) error
	ActivatePolicy(ctx context.Context, orgID, id string) error

	// Compliance status
	GetComplianceStatus(ctx context.Context, orgID string) ([]domain.ComplianceStatus, error)
	GetComplianceStatusForRepo(ctx context.Context, orgID, repoID string) (*domain.ComplianceStatus, error)

	// Drift reports
	GetDriftReports(ctx context.Context, orgID string) ([]domain.DriftReport, error)
	GetDriftReportForApp(ctx context.Context, orgID, appID string) (*domain.DriftReport, error)

	// Developer compliance
	ListDeveloperCompliance(ctx context.Context, orgID string) ([]domain.DeveloperCompliance, error)
	ReportDeveloperCompliance(ctx context.Context, orgID string, dc *domain.DeveloperCompliance) error

	// Tool policies
	ListToolPolicies(ctx context.Context, orgID string) ([]domain.ToolPolicy, error)
	CreateToolPolicy(ctx context.Context, tp *domain.ToolPolicy) (string, error)
	DeleteToolPolicy(ctx context.Context, id string) error

	// Domain audit
	ListDomainAudit(ctx context.Context, orgID string, limit int) ([]domain.DomainAuditEntry, error)
	QueryDomainAudit(ctx context.Context, orgID, queryDomain, tool, action string, limit int) ([]domain.DomainAuditEntry, error)

	// Enforcement webhooks
	ListEnforcementWebhooks(ctx context.Context, orgID string) ([]domain.EnforcementWebhook, error)
}
