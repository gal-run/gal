// Package client provides HTTP client wrappers for all Go backend services.
// Each tool group maps to one or more backend service endpoints.
package client

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strconv"

	"github.com/gal-run/gal/services/lib/httpclient"
)

// APIClient wraps all backend service HTTP clients.
// Each field targets a different Go microservice.
//
// Routing strategy:
//   - Org-scoped paths (/organizations/{org}/...) go through the gateway,
//     which routes to the correct backend or falls back to the legacy API.
//   - Non-org paths call individual services directly for lower latency.
type APIClient struct {
	// Auth service (login, sessions, credentials, user profiles).
	authClient *httpclient.Client

	// Governance service (policies, proposals, compliance).
	governanceClient *httpclient.Client

	// Dispatch service (sessions, queue, swarm).
	dispatchClient *httpclient.Client

	// Team service (teams, org-memory).
	teamClient *httpclient.Client

	// Repo service (discovery, configs).
	repoClient *httpclient.Client

	// MAL service (memory, agent-cards).
	malClient *httpclient.Client

	// Swarm service (worker dispatch).
	swarmClient *httpclient.Client

	// Gateway routes org-scoped paths to the correct backend.
	gatewayClient *httpclient.Client
}

// New creates an APIClient from environment variable URLs.
func New() *APIClient {
	return &APIClient{
		authClient:       httpclient.New(envOrDefault("AUTH_SVC_URL", "http://auth-svc:8080")),
		governanceClient: httpclient.New(envOrDefault("GOVERNANCE_SVC_URL", "http://governance-svc:8080")),
		dispatchClient:   httpclient.New(envOrDefault("DISPATCH_SVC_URL", "http://dispatch-svc:8080")),
		teamClient:       httpclient.New(envOrDefault("TEAM_SVC_URL", "http://team-svc:8080")),
		repoClient:       httpclient.New(envOrDefault("REPO_SVC_URL", "http://repo-svc:8080")),
		malClient:        httpclient.New(envOrDefault("MAL_SVC_URL", "http://mal-svc:8080")),
		swarmClient:      httpclient.New(envOrDefault("SWARM_SVC_URL", "http://swarm-svc:8080")),
		gatewayClient:    httpclient.New(envOrDefault("GATEWAY_URL", "http://gateway:8080")),
	}
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// ---------- Auth ----------

// GetMe calls GET /auth/me on auth-svc.
func (c *APIClient) GetMe(ctx context.Context, result any) error {
	return c.authClient.Get(ctx, "/auth/me", result)
}

// ---------- Organizations / Workspaces ----------

// ListWorkspaces calls GET /organizations.
func (c *APIClient) ListWorkspaces(ctx context.Context, result any) error {
	return c.authClient.Get(ctx, "/organizations", result)
}

// SyncWorkspace calls POST /organizations/quick-sync.
func (c *APIClient) SyncWorkspace(ctx context.Context, result any) error {
	return c.authClient.Post(ctx, "/organizations/quick-sync", nil, result)
}

// ---------- Discovery ----------

// GetDiscoveredConfigs calls GET /organizations/{org}/discovered-configs via gateway.
func (c *APIClient) GetDiscoveredConfigs(ctx context.Context, orgName string, configType string, result any) error {
	path := fmt.Sprintf("/organizations/%s/discovered-configs", url.PathEscape(orgName))
	if configType != "" {
		path += "?type=" + url.QueryEscape(configType)
	}
	return c.gatewayClient.Get(ctx, path, result)
}

// GetConfigContent calls GET /organizations/{org}/config-content via gateway.
func (c *APIClient) GetConfigContent(ctx context.Context, orgName, repo, path string, result any) error {
	q := url.Values{}
	q.Set("repo", repo)
	q.Set("path", path)
	fullPath := fmt.Sprintf("/organizations/%s/config-content?%s", url.PathEscape(orgName), q.Encode())
	return c.gatewayClient.Get(ctx, fullPath, result)
}

// PickConfigByAI calls POST /organizations/{org}/discovery/pick-by-ai via gateway.
func (c *APIClient) PickConfigByAI(ctx context.Context, orgName string, body any, result any) error {
	path := fmt.Sprintf("/organizations/%s/discovery/pick-by-ai", url.PathEscape(orgName))
	return c.gatewayClient.Post(ctx, path, body, result)
}

// ---------- Approved Config ----------

// GetApprovedConfig calls GET /organizations/{org}/approved-config via gateway.
func (c *APIClient) GetApprovedConfig(ctx context.Context, orgName, platform string, result any) error {
	path := fmt.Sprintf("/organizations/%s/approved-config?platform=%s", url.PathEscape(orgName), url.QueryEscape(platform))
	return c.gatewayClient.Get(ctx, path, result)
}

// SetApprovedConfig calls PUT /organizations/{org}/approved-config via gateway.
func (c *APIClient) SetApprovedConfig(ctx context.Context, orgName string, body any, result any) error {
	path := fmt.Sprintf("/organizations/%s/approved-config", url.PathEscape(orgName))
	return c.gatewayClient.Put(ctx, path, body, result)
}

// ---------- Proposals ----------

// ListProposals calls GET /api/orgs/{org}/proposals.
func (c *APIClient) ListProposals(ctx context.Context, orgName string, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/proposals", url.PathEscape(orgName))
	return c.governanceClient.Get(ctx, path, result)
}

// CreateProposal calls POST /api/orgs/{org}/proposals.
func (c *APIClient) CreateProposal(ctx context.Context, orgName string, body any, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/proposals", url.PathEscape(orgName))
	return c.governanceClient.Post(ctx, path, body, result)
}

// ReviewProposal calls PATCH /api/proposals/{id}.
func (c *APIClient) ReviewProposal(ctx context.Context, proposalID string, body any, result any) error {
	path := fmt.Sprintf("/api/proposals/%s", url.PathEscape(proposalID))
	return c.governanceClient.Patch(ctx, path, body, result)
}

// ---------- Config Versions ----------

// ListConfigVersions calls GET /api/orgs/{org}/config/versions.
func (c *APIClient) ListConfigVersions(ctx context.Context, orgName string, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/config/versions", url.PathEscape(orgName))
	return c.governanceClient.Get(ctx, path, result)
}

// RollbackConfig calls POST /api/orgs/{org}/config/rollback.
func (c *APIClient) RollbackConfig(ctx context.Context, orgName string, body any, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/config/rollback", url.PathEscape(orgName))
	return c.governanceClient.Post(ctx, path, body, result)
}

// ---------- Tracked Repos ----------

// ListTrackedRepos calls GET /api/orgs/{org}/repos.
func (c *APIClient) ListTrackedRepos(ctx context.Context, orgName string, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/repos", url.PathEscape(orgName))
	return c.governanceClient.Get(ctx, path, result)
}

// AddTrackedRepo calls POST /api/orgs/{org}/repos.
func (c *APIClient) AddTrackedRepo(ctx context.Context, orgName string, body any, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/repos", url.PathEscape(orgName))
	return c.governanceClient.Post(ctx, path, body, result)
}

// RemoveTrackedRepo calls DELETE /api/orgs/{org}/repos/{repo}.
func (c *APIClient) RemoveTrackedRepo(ctx context.Context, orgName, repo string) error {
	path := fmt.Sprintf("/api/orgs/%s/repos/%s", url.PathEscape(orgName), url.PathEscape(repo))
	return c.governanceClient.Delete(ctx, path)
}

// ---------- Team ----------

// ListTeamMembers calls GET /organizations/{org}/team via gateway.
func (c *APIClient) ListTeamMembers(ctx context.Context, orgName string, result any) error {
	path := fmt.Sprintf("/organizations/%s/team", url.PathEscape(orgName))
	return c.gatewayClient.Get(ctx, path, result)
}

// SetTeamRole calls PUT /organizations/{org}/team/members/{githubId}/role via gateway.
func (c *APIClient) SetTeamRole(ctx context.Context, orgName, githubID, role string, result any) error {
	path := fmt.Sprintf("/organizations/%s/team/members/%s/role", url.PathEscape(orgName), url.PathEscape(githubID))
	return c.gatewayClient.Put(ctx, path, map[string]string{"role": role}, result)
}

// SyncTeam calls POST /organizations/{org}/team/sync via gateway.
func (c *APIClient) SyncTeam(ctx context.Context, orgName string, result any) error {
	path := fmt.Sprintf("/organizations/%s/team/sync", url.PathEscape(orgName))
	return c.gatewayClient.Post(ctx, path, nil, result)
}

// ---------- Compliance ----------

// ScanCompliance calls POST /organizations/{org}/compliance/scan via gateway.
func (c *APIClient) ScanCompliance(ctx context.Context, orgName string, result any) error {
	path := fmt.Sprintf("/organizations/%s/compliance/scan", url.PathEscape(orgName))
	return c.gatewayClient.Post(ctx, path, nil, result)
}

// GetComplianceResults calls GET /organizations/{org}/compliance via gateway.
func (c *APIClient) GetComplianceResults(ctx context.Context, orgName, scanID string, limit, offset int, result any) error {
	q := url.Values{}
	if scanID != "" {
		q.Set("scanId", scanID)
	}
	if limit > 0 {
		q.Set("limit", strconv.Itoa(limit))
	}
	if offset > 0 {
		q.Set("offset", strconv.Itoa(offset))
	}
	path := fmt.Sprintf("/organizations/%s/compliance", url.PathEscape(orgName))
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	return c.gatewayClient.Get(ctx, path, result)
}

// QueryAuditLogs calls GET /organizations/{org}/audit/logs via gateway.
func (c *APIClient) QueryAuditLogs(ctx context.Context, orgName string, params map[string]any, result any) error {
	q := url.Values{}
	for k, v := range params {
		switch val := v.(type) {
		case string:
			if val != "" {
				q.Set(k, val)
			}
		case int:
			if val > 0 {
				q.Set(k, strconv.Itoa(val))
			}
		}
	}
	path := fmt.Sprintf("/organizations/%s/audit/logs", url.PathEscape(orgName))
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	return c.governanceClient.Get(ctx, path, result)
}

// GetComplianceStatus calls GET /organizations/{org}/compliance via gateway.
func (c *APIClient) GetComplianceStatus(ctx context.Context, orgName string, result any) error {
	path := fmt.Sprintf("/organizations/%s/compliance", url.PathEscape(orgName))
	return c.gatewayClient.Get(ctx, path, result)
}

// GetAuditSummary calls GET /organizations/{org}/audit/summary via gateway.
func (c *APIClient) GetAuditSummary(ctx context.Context, orgName string, params map[string]string, result any) error {
	q := url.Values{}
	if v, ok := params["startDate"]; ok && v != "" {
		q.Set("startDate", v)
	}
	if v, ok := params["endDate"]; ok && v != "" {
		q.Set("endDate", v)
	}
	path := fmt.Sprintf("/organizations/%s/audit/summary", url.PathEscape(orgName))
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	return c.governanceClient.Get(ctx, path, result)
}

// GetSDLCStatus calls GET /api/sdlc/{issueNumber}/status.
func (c *APIClient) GetSDLCStatus(ctx context.Context, issueNumber int, result any) error {
	path := fmt.Sprintf("/api/sdlc/%d/status", issueNumber)
	return c.governanceClient.Get(ctx, path, result)
}

// ---------- Sessions ----------

// CreateSession calls POST /api/sessions.
func (c *APIClient) CreateSession(ctx context.Context, body any, result any) error {
	return c.dispatchClient.Post(ctx, "/api/sessions", body, result)
}

// ListSessions calls GET /api/sessions with optional org filter.
func (c *APIClient) ListSessions(ctx context.Context, orgID string, result any) error {
	path := "/api/sessions"
	if orgID != "" {
		path += "?org=" + url.QueryEscape(orgID)
	}
	return c.dispatchClient.Get(ctx, path, result)
}

// Heartbeat calls POST /api/sessions/{id}/heartbeat.
func (c *APIClient) Heartbeat(ctx context.Context, sessionID string, body any, result any) error {
	path := fmt.Sprintf("/api/sessions/%s/heartbeat", url.PathEscape(sessionID))
	return c.dispatchClient.Post(ctx, path, body, result)
}

// ClaimTask calls POST /api/tasks/{issueNumber}/claim.
func (c *APIClient) ClaimTask(ctx context.Context, body any, issueNumber int, result any) error {
	path := fmt.Sprintf("/api/tasks/%d/claim", issueNumber)
	return c.dispatchClient.Post(ctx, path, body, result)
}

// ReportProgress calls POST /api/sessions/{id}/progress.
func (c *APIClient) ReportProgress(ctx context.Context, sessionID string, body any, result any) error {
	path := fmt.Sprintf("/api/sessions/%s/progress", url.PathEscape(sessionID))
	return c.dispatchClient.Post(ctx, path, body, result)
}

// SendDirective calls POST /api/sessions/{id}/directive.
func (c *APIClient) SendDirective(ctx context.Context, sessionID string, body any, result any) error {
	path := fmt.Sprintf("/api/sessions/%s/directive", url.PathEscape(sessionID))
	return c.dispatchClient.Post(ctx, path, body, result)
}

// GetDirectives calls GET /api/sessions/{id}/directives.
func (c *APIClient) GetDirectives(ctx context.Context, sessionID string, result any) error {
	path := fmt.Sprintf("/api/sessions/%s/directives", url.PathEscape(sessionID))
	return c.dispatchClient.Get(ctx, path, result)
}

// ClaimBranch calls POST /api/sessions/branches/claim.
func (c *APIClient) ClaimBranch(ctx context.Context, body any, result any) error {
	return c.dispatchClient.Post(ctx, "/api/sessions/branches/claim", body, result)
}

// ReleaseBranch calls DELETE /api/sessions/branches/claim.
func (c *APIClient) ReleaseBranch(ctx context.Context, body any, result any) error {
	return c.dispatchClient.DeleteWithBody(ctx, "/api/sessions/branches/claim", body, result)
}

// DispatchAgent calls POST /api/sessions (wraps for background dispatch).
func (c *APIClient) DispatchAgent(ctx context.Context, body any, result any) error {
	return c.dispatchClient.Post(ctx, "/api/sessions", body, result)
}

// ResumeSession calls POST /api/sessions/{id}/resume.
func (c *APIClient) ResumeSession(ctx context.Context, sessionID string, body any, result any) error {
	path := fmt.Sprintf("/api/sessions/%s/resume", url.PathEscape(sessionID))
	return c.dispatchClient.Post(ctx, path, body, result)
}

// LogEvents calls POST /telemetry/events.
func (c *APIClient) LogEvents(ctx context.Context, body any, result any) error {
	return c.dispatchClient.Post(ctx, "/telemetry/events", body, result)
}

// ---------- Work Items ----------

// ListWorkItems calls GET /api/work-items with query params.
func (c *APIClient) ListWorkItems(ctx context.Context, q url.Values, result any) error {
	path := "/api/work-items"
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	return c.dispatchClient.Get(ctx, path, result)
}

// ClaimWorkItem calls POST /api/work-items/{id}/claim.
func (c *APIClient) ClaimWorkItem(ctx context.Context, workItemID string, body any, result any) error {
	path := fmt.Sprintf("/api/work-items/%s/claim", url.PathEscape(workItemID))
	return c.dispatchClient.Post(ctx, path, body, result)
}

// CompleteWorkItem calls POST /api/work-items/{id}/complete.
func (c *APIClient) CompleteWorkItem(ctx context.Context, workItemID string, body any, result any) error {
	path := fmt.Sprintf("/api/work-items/%s/complete", url.PathEscape(workItemID))
	return c.dispatchClient.Post(ctx, path, body, result)
}

// FailWorkItem calls POST /api/work-items/{id}/fail.
func (c *APIClient) FailWorkItem(ctx context.Context, workItemID string, body any, result any) error {
	path := fmt.Sprintf("/api/work-items/%s/fail", url.PathEscape(workItemID))
	return c.dispatchClient.Post(ctx, path, body, result)
}

// EnqueueWorkItems calls POST /api/work-prioritizer/enqueue.
func (c *APIClient) EnqueueWorkItems(ctx context.Context, body any, org string, result any) error {
	path := "/api/work-prioritizer/enqueue"
	if org != "" {
		path += "?org=" + url.QueryEscape(org)
	}
	return c.dispatchClient.Post(ctx, path, body, result)
}

// SetQueueOrder calls PUT /api/queue/order.
func (c *APIClient) SetQueueOrder(ctx context.Context, body any, orgName string, result any) error {
	path := fmt.Sprintf("/api/queue/order?org=%s", url.QueryEscape(orgName))
	return c.dispatchClient.Put(ctx, path, body, result)
}

// ---------- Dispatch Rules ----------

// GetDispatchRules calls GET /organizations/{org}/dispatch-rules via gateway.
func (c *APIClient) GetDispatchRules(ctx context.Context, orgName string, result any) error {
	path := fmt.Sprintf("/organizations/%s/dispatch-rules", url.PathEscape(orgName))
	return c.gatewayClient.Get(ctx, path, result)
}

// SetDispatchRules calls PUT /organizations/{org}/dispatch-rules via gateway.
func (c *APIClient) SetDispatchRules(ctx context.Context, orgName string, body any, result any) error {
	path := fmt.Sprintf("/organizations/%s/dispatch-rules", url.PathEscape(orgName))
	return c.gatewayClient.Put(ctx, path, body, result)
}

// ---------- Dispatch Health ----------

// GetDispatchHealth calls GET /api/dispatch/health.
func (c *APIClient) GetDispatchHealth(ctx context.Context, result any) error {
	return c.dispatchClient.Get(ctx, "/api/dispatch/health", result)
}

// ---------- Session Output ----------

// GetSessionOutput calls GET /api/sessions/{id}/output.
func (c *APIClient) GetSessionOutput(ctx context.Context, sessionID string, lastN int, result any) error {
	path := fmt.Sprintf("/api/sessions/%s/output?lastN=%d", url.PathEscape(sessionID), lastN)
	return c.dispatchClient.Get(ctx, path, result)
}

// GetSessionMetadata calls GET /api/sessions/{id}/rtdb-metadata.
func (c *APIClient) GetSessionMetadata(ctx context.Context, sessionID string, result any) error {
	path := fmt.Sprintf("/api/sessions/%s/rtdb-metadata", url.PathEscape(sessionID))
	return c.dispatchClient.Get(ctx, path, result)
}

// GetSessionStreamURL returns the SSE stream URL for a session.
func (c *APIClient) GetSessionStreamURL(sessionID string) string {
	baseURL := envOrDefault("DISPATCH_SVC_URL", "http://dispatch-svc:8080")
	return fmt.Sprintf("%s/api/sessions/%s/stream", baseURL, url.PathEscape(sessionID))
}

// ---------- Credential Validation ----------

// ValidateCredentialForDispatch calls POST /api/credentials/validate-for-dispatch.
func (c *APIClient) ValidateCredentialForDispatch(ctx context.Context, provider string, result any) error {
	return c.dispatchClient.Post(ctx, "/api/credentials/validate-for-dispatch", map[string]string{"provider": provider}, result)
}

// ---------- Governance Override ----------

// ReportGovernanceOverride calls POST /api/governance/overrides.
func (c *APIClient) ReportGovernanceOverride(ctx context.Context, body any, result any) error {
	return c.governanceClient.Post(ctx, "/api/governance/overrides", body, result)
}

// ---------- Memory ----------

// SearchMemory calls GET /api/orgs/{orgId}/memory/search.
func (c *APIClient) SearchMemory(ctx context.Context, orgID string, q url.Values, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/memory/search", url.PathEscape(orgID))
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	return c.malClient.Get(ctx, path, result)
}

// GetMemoryByID calls GET /api/orgs/{orgId}/memory/{entryId}.
func (c *APIClient) GetMemoryByID(ctx context.Context, orgID, entryID string, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/memory/%s", url.PathEscape(orgID), url.PathEscape(entryID))
	return c.malClient.Get(ctx, path, result)
}

// ReadMemory calls GET /api/orgs/{orgId}/memory.
func (c *APIClient) ReadMemory(ctx context.Context, orgID string, q url.Values, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/memory", url.PathEscape(orgID))
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	return c.malClient.Get(ctx, path, result)
}

// WriteMemory calls POST /api/orgs/{orgId}/memory.
func (c *APIClient) WriteMemory(ctx context.Context, orgID string, body any, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/memory", url.PathEscape(orgID))
	return c.malClient.Post(ctx, path, body, result)
}

// GetPeerActivity calls GET /api/orgs/{orgId}/peer-activity.
func (c *APIClient) GetPeerActivity(ctx context.Context, orgID string, q url.Values, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/peer-activity", url.PathEscape(orgID))
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	return c.malClient.Get(ctx, path, result)
}

// ---------- Policies ----------

// CreatePolicy calls POST /api/orgs/{orgName}/policies.
func (c *APIClient) CreatePolicy(ctx context.Context, orgName string, body any, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/policies", url.PathEscape(orgName))
	return c.governanceClient.Post(ctx, path, body, result)
}

// ListPolicies calls GET /api/orgs/{orgName}/policies.
func (c *APIClient) ListPolicies(ctx context.Context, orgName string, q url.Values, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/policies", url.PathEscape(orgName))
	if len(q) > 0 {
		path += "?" + q.Encode()
	}
	return c.governanceClient.Get(ctx, path, result)
}

// GetPolicy calls GET /api/policies/{id}.
func (c *APIClient) GetPolicy(ctx context.Context, orgName, policyID string, result any) error {
	path := fmt.Sprintf("/api/policies/%s?orgName=%s", url.PathEscape(policyID), url.QueryEscape(orgName))
	return c.governanceClient.Get(ctx, path, result)
}

// ReviewPolicy calls PATCH /api/policies/{id}/review.
func (c *APIClient) ReviewPolicy(ctx context.Context, orgName, policyID string, body any, result any) error {
	path := fmt.Sprintf("/api/policies/%s/review?orgName=%s", url.PathEscape(policyID), url.QueryEscape(orgName))
	return c.governanceClient.Patch(ctx, path, body, result)
}

// UpdatePolicyEnforcement calls PATCH /api/policies/{id}/enforcement.
func (c *APIClient) UpdatePolicyEnforcement(ctx context.Context, orgName, policyID string, body any, result any) error {
	path := fmt.Sprintf("/api/policies/%s/enforcement?orgName=%s", url.PathEscape(policyID), url.QueryEscape(orgName))
	return c.governanceClient.Patch(ctx, path, body, result)
}

// CheckOrgPolicy calls POST /api/orgs/{orgName}/policies/check.
func (c *APIClient) CheckOrgPolicy(ctx context.Context, orgName string, body any, result any) error {
	path := fmt.Sprintf("/api/orgs/%s/policies/check", url.PathEscape(orgName))
	return c.governanceClient.Post(ctx, path, body, result)
}

// CheckSpecificPolicy calls POST /api/policies/{id}/check.
func (c *APIClient) CheckSpecificPolicy(ctx context.Context, orgName, policyID string, body any, result any) error {
	path := fmt.Sprintf("/api/policies/%s/check?orgName=%s", url.PathEscape(policyID), url.QueryEscape(orgName))
	return c.governanceClient.Post(ctx, path, body, result)
}

// ---------- Swarm ----------

// CreateSwarmRun calls POST /api/swarm/{orgName}/runs.
func (c *APIClient) CreateSwarmRun(ctx context.Context, orgName string, body any, result any) error {
	path := fmt.Sprintf("/api/swarm/%s/runs", url.PathEscape(orgName))
	return c.swarmClient.Post(ctx, path, body, result)
}

// GetSwarmRun calls GET /api/swarm/{orgName}/runs/{runId}.
func (c *APIClient) GetSwarmRun(ctx context.Context, orgName, runID string, result any) error {
	path := fmt.Sprintf("/api/swarm/%s/runs/%s", url.PathEscape(orgName), url.PathEscape(runID))
	return c.swarmClient.Get(ctx, path, result)
}

// ListSwarmRuns calls GET /api/swarm/{orgName}/runs.
func (c *APIClient) ListSwarmRuns(ctx context.Context, orgName string, result any) error {
	path := fmt.Sprintf("/api/swarm/%s/runs", url.PathEscape(orgName))
	return c.swarmClient.Get(ctx, path, result)
}

// CalibrateSwarmRun calls PATCH /api/swarm/{orgName}/runs/{runId}/actuals.
func (c *APIClient) CalibrateSwarmRun(ctx context.Context, orgName, runID string, body any, result any) error {
	path := fmt.Sprintf("/api/swarm/%s/runs/%s/actuals", url.PathEscape(orgName), url.PathEscape(runID))
	return c.swarmClient.Patch(ctx, path, body, result)
}

// ObserveSwarmCapacity calls PATCH /api/swarm/{orgName}/runs/{runId}/capacity.
func (c *APIClient) ObserveSwarmCapacity(ctx context.Context, orgName, runID string, body any, result any) error {
	path := fmt.Sprintf("/api/swarm/%s/runs/%s/capacity", url.PathEscape(orgName), url.PathEscape(runID))
	return c.swarmClient.Patch(ctx, path, body, result)
}
