// Package domain defines governance domain types for config proposals,
// approved configs, policies, compliance, drift detection, tool policies,
// and domain audit events.
package domain

import "time"

// ConfigProposal represents a proposed config change.
type ConfigProposal struct {
	ID            string    `json:"id" firestore:"id"`
	OrgID         string    `json:"orgId" firestore:"orgId"`
	Scope         string    `json:"scope" firestore:"scope"`                   // org, project
	ScopeID       string    `json:"scopeId" firestore:"scopeId"`              // org name or "org/repo"
	Content       string    `json:"content" firestore:"content"`              // proposed config JSON
	BasedOnVersion string   `json:"basedOnVersion,omitempty" firestore:"basedOnVersion,omitempty"`
	ProposedBy    string    `json:"proposedBy" firestore:"proposedBy"`
	Status        string    `json:"status" firestore:"status"`               // pending, approved, rejected
	ApprovedBy    string    `json:"approvedBy,omitempty" firestore:"approvedBy,omitempty"`
	ReviewComment string    `json:"reviewComment,omitempty" firestore:"reviewComment,omitempty"`
	ReviewedAt    time.Time `json:"reviewedAt,omitempty" firestore:"reviewedAt,omitempty"`
	CreatedAt     time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// ApprovedConfig represents an org-wide approved configuration.
type ApprovedConfig struct {
	ID          string    `json:"id" firestore:"id"`
	OrgID       string    `json:"orgId" firestore:"orgId"`
	Platform    string    `json:"platform" firestore:"platform"`       // claude, cursor, copilot, etc.
	Version     string    `json:"version" firestore:"version"`
	Config      string    `json:"config" firestore:"config"`          // JSON string of full config bundle
	Hash        string    `json:"hash" firestore:"hash"`
	PublishedBy string    `json:"publishedBy" firestore:"publishedBy"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// AutoApprovalSettings configures the AI auto-approval engine.
type AutoApprovalSettings struct {
	OrgID                string    `json:"orgId" firestore:"orgId"`
	Enabled              bool      `json:"enabled" firestore:"enabled"`
	ConfidenceThreshold  float64   `json:"confidenceThreshold" firestore:"confidenceThreshold"`
	SystemPrompt         string    `json:"systemPrompt" firestore:"systemPrompt"`
	DryRun               bool      `json:"dryRun" firestore:"dryRun"`
	UpdatedAt            time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// Policy represents a governance policy with JSON-encoded rules.
type Policy struct {
	ID          string    `json:"id" firestore:"id"`
	OrgID       string    `json:"orgId" firestore:"orgId"`
	Name        string    `json:"name" firestore:"name"`
	Description string    `json:"description" firestore:"description"`
	Rules       string    `json:"rules" firestore:"rules"`                  // JSON-encoded rule set
	Enforcement string    `json:"enforcement" firestore:"enforcement"`      // strict, advisory, disabled
	IsActive    bool      `json:"isActive" firestore:"isActive"`
	CreatedBy   string    `json:"createdBy" firestore:"createdBy"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// ComplianceStatus tracks repo-level policy compliance.
type ComplianceStatus struct {
	ID           string    `json:"id" firestore:"id"`
	OrgID        string    `json:"orgId" firestore:"orgId"`
	RepoID       string    `json:"repoId" firestore:"repoId"`
	Status       string    `json:"status" firestore:"status"`               // compliant, non_compliant, unknown
	Drifted      bool      `json:"drifted" firestore:"drifted"`
	MissingRules []string  `json:"missingRules" firestore:"missingRules"`
	LastSyncHash string    `json:"lastSyncHash,omitempty" firestore:"lastSyncHash,omitempty"`
	LastChecked  time.Time `json:"lastChecked" firestore:"lastChecked"`
	UpdatedAt    time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// ComplianceSummary is an aggregated view for an org.
type ComplianceSummary struct {
	Total        int `json:"total"`
	Compliant    int `json:"compliant"`
	NonCompliant int `json:"nonCompliant"`
	Unknown      int `json:"unknown"`
}

// DriftReport represents a config drift detection report.
type DriftReport struct {
	ID           string        `json:"id" firestore:"id"`
	OrgID        string        `json:"orgId" firestore:"orgId"`
	AppID        string        `json:"appId" firestore:"appId"`
	Status       string        `json:"status" firestore:"status"`           // in-sync, drifted, unknown
	DriftedFiles []DriftedFile `json:"driftedFiles" firestore:"driftedFiles"`
	LastChecked  string        `json:"lastChecked" firestore:"lastChecked"`
	CreatedAt    time.Time     `json:"createdAt" firestore:"createdAt"`
	UpdatedAt    time.Time     `json:"updatedAt" firestore:"updatedAt"`
}

// DriftedFile describes a single drifted file.
type DriftedFile struct {
	Path       string `json:"path" firestore:"path"`
	Type       string `json:"type" firestore:"type"`
	ChangeType string `json:"changeType" firestore:"changeType"` // modified, missing, extra
}

// DriftSummary is an aggregated drift view.
type DriftSummary struct {
	Total       int `json:"total"`
	InSync      int `json:"inSync"`
	Drifted     int `json:"drifted"`
	Unknown     int `json:"unknown"`
}

// DeveloperCompliance tracks per-developer config compliance.
type DeveloperCompliance struct {
	DeveloperID   string    `json:"developerId" firestore:"developerId"`
	OrgID         string    `json:"orgId" firestore:"orgId"`
	SettingsHash  string    `json:"settingsHash" firestore:"settingsHash"`
	OrgHash       string    `json:"orgHash" firestore:"orgHash"`
	DriftDetected bool      `json:"driftDetected" firestore:"driftDetected"`
	LastSyncTime  string    `json:"lastSyncTime" firestore:"lastSyncTime"`
	CliVersion    string    `json:"cliVersion" firestore:"cliVersion"`
	Hostname      string    `json:"hostname" firestore:"hostname"`
	ReportCount   int       `json:"reportCount" firestore:"reportCount"`
	LastReported  time.Time `json:"lastReported" firestore:"lastReported"`
}

// ToolPolicy defines a restriction on a specific tool.
type ToolPolicy struct {
	ID         string    `json:"id" firestore:"id"`
	OrgID      string    `json:"orgId" firestore:"orgId"`
	Tool       string    `json:"tool" firestore:"tool"`
	Action     string    `json:"action" firestore:"action"`         // allow, deny, audit
	Conditions string    `json:"conditions,omitempty" firestore:"conditions,omitempty"` // JSON conditions
	CreatedBy  string    `json:"createdBy" firestore:"createdBy"`
	CreatedAt  time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// DomainAuditEntry records a domain access event.
type DomainAuditEntry struct {
	ID        string    `json:"id" firestore:"id"`
	OrgID     string    `json:"orgId" firestore:"orgId"`
	Domain    string    `json:"domain" firestore:"domain"`
	Tool      string    `json:"tool" firestore:"tool"`
	Action    string    `json:"action" firestore:"action"`         // allowed, blocked
	URL       string    `json:"url" firestore:"url"`
	SessionID string    `json:"sessionId" firestore:"sessionId"`
	UserID    string    `json:"userId" firestore:"userId"`
	CreatedAt time.Time `json:"createdAt" firestore:"createdAt"`
}

// EnforcementCheckRequest is the payload for checking enforcement decisions.
type EnforcementCheckRequest struct {
	Action  string `json:"action"`
	Repo    string `json:"repo"`
	Context string `json:"context,omitempty"`
}

// EnforcementCheckResult is the response for enforcement checks.
type EnforcementCheckResult struct {
	Allowed    bool   `json:"allowed"`
	Action     string `json:"action"`     // allowed, denied, audit
	PolicyID   string `json:"policyId,omitempty"`
	PolicyName string `json:"policyName,omitempty"`
	Reason     string `json:"reason,omitempty"`
}

// EnforcementWebhook represents a configured webhook for enforcement events.
type EnforcementWebhook struct {
	ID      string    `json:"id" firestore:"id"`
	OrgID   string    `json:"orgId" firestore:"orgId"`
	URL     string    `json:"url" firestore:"url"`
	Secret  string    `json:"secret" firestore:"secret"`
	Events  []string  `json:"events" firestore:"events"`
	Enabled bool      `json:"enabled" firestore:"enabled"`
	CreatedAt time.Time `json:"createdAt" firestore:"createdAt"`
}
