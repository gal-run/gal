// Package client provides the GAL REST API client for the CLI.
//
// Ported from TypeScript GalApiClient (api-client.ts).
// Auth token is read from ~/.gal/config.json and passed as Bearer token
// via the shared lib/httpclient with context-based JWT propagation.
package client

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/httpclient"
)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// Config represents ~/.gal/config.json.
type Config struct {
	Token      string `json:"token"`
	APIKey     string `json:"apiKey"`
	APIUrl     string `json:"apiUrl"`
	DefaultOrg string `json:"defaultOrg"`
}

// LoadConfig reads the CLI config from ~/.gal/config.json.
// Falls back to GAL_API_URL env var and a default of https://api.gal.run.
func LoadConfig() (*Config, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, fmt.Errorf("home dir: %w", err)
	}
	path := filepath.Join(home, ".gal", "config.json")
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &Config{APIUrl: defaultAPIURL()}, nil
		}
		return nil, fmt.Errorf("read config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}
	if cfg.APIUrl == "" {
		cfg.APIUrl = defaultAPIURL()
	}
	return &cfg, nil
}

func defaultAPIURL() string {
	if u := os.Getenv("GAL_API_URL"); u != "" {
		return u
	}
	return "https://api.gal.run"
}

// AuthToken returns the first available auth credential.
func (c *Config) AuthToken() string {
	if c.Token != "" {
		return c.Token
	}
	return c.APIKey
}

// IsAuthenticated returns true if a token or API key is present.
func (c *Config) IsAuthenticated() bool {
	return c.AuthToken() != ""
}

// ---------------------------------------------------------------------------
// API types (ported from TypeScript api-client.ts)
// ---------------------------------------------------------------------------

type UserResponse struct {
	Login         string   `json:"login"`
	Name          string   `json:"name,omitempty"`
	Email         string   `json:"email,omitempty"`
	AvatarURL     string   `json:"avatarUrl,omitempty"`
	Organizations []string `json:"organizations,omitempty"`
}

type CredentialSyncResponse struct {
	Success      bool   `json:"success"`
	Error        string `json:"error,omitempty"`
	TokenPrefix  string `json:"tokenPrefix,omitempty"`
}

type CredentialStatus struct {
	Provider    string `json:"provider"`
	Exists      bool   `json:"exists"`
	Status      string `json:"status"`
	TokenPrefix string `json:"tokenPrefix,omitempty"`
	UpdatedAt   string `json:"updatedAt,omitempty"`
}

type CredentialsListResponse struct {
	Credentials []CredentialStatus `json:"credentials"`
}

type ValidateCredentialResponse struct {
	Valid  bool   `json:"valid"`
	Status string `json:"status,omitempty"`
	Error  string `json:"error,omitempty"`
}

type CreateSessionRequest struct {
	Name             string `json:"name,omitempty"`
	Org              string `json:"org,omitempty"`
	ProjectContext   string `json:"projectContext,omitempty"`
	Branch           string `json:"branch,omitempty"`
	RunnerLabel      string `json:"runnerLabel,omitempty"`
	Agent            string `json:"agent,omitempty"`
	InitialPrompt    string `json:"initialPrompt,omitempty"`
	DispatchBackend  string `json:"dispatchBackend,omitempty"`
	Model            string `json:"model,omitempty"`
}

type Session struct {
	ID              string `json:"id"`
	Status          string `json:"status"`
	Name            string `json:"name,omitempty"`
	ProjectContext  string `json:"projectContext,omitempty"`
	Branch          string `json:"branch,omitempty"`
	Agent           string `json:"agent,omitempty"`
	RunnerLabel     string `json:"runnerLabel,omitempty"`
	WorkflowRunID   int    `json:"workflowRunId,omitempty"`
	AgentSessionID  string `json:"agentSessionId,omitempty"`
	ErrorMessage    string `json:"errorMessage,omitempty"`
	CreatedAt       string `json:"createdAt,omitempty"`
	StartedAt       string `json:"startedAt,omitempty"`
	TerminatedAt    string `json:"terminatedAt,omitempty"`
}

type ListSessionsResponse struct {
	Sessions    []Session `json:"sessions"`
	NextCursor  string    `json:"nextCursor,omitempty"`
}

type ResumeSessionResponse struct {
	SessionID      string `json:"sessionId"`
	WorkflowRunID  int    `json:"workflowRunId"`
	AgentSessionID string `json:"agentSessionId"`
}

type SendDirectiveRequest struct {
	TargetSessionID string                 `json:"targetSessionId"`
	Type            string                 `json:"type"`
	Payload         map[string]interface{} `json:"payload"`
}

type WorkItem struct {
	ID            string                 `json:"id"`
	Command       string                 `json:"command"`
	Status        string                 `json:"status"`
	Priority      int                    `json:"priority"`
	SDLcPhase     int                    `json:"sdlcPhase,omitempty"`
	ParentIssueID string                 `json:"parentIssueId,omitempty"`
	ClaimedBy     string                 `json:"claimedBy,omitempty"`
	Source        map[string]interface{} `json:"source,omitempty"`
	Context       string                 `json:"context,omitempty"`
	Result        map[string]interface{} `json:"result,omitempty"`
	Metadata      map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt     string                 `json:"createdAt"`
}

type CreateWorkItemRequest struct {
	Type           string                 `json:"type"`
	Command        string                 `json:"command"`
	Priority       int                    `json:"priority"`
	SDLcPhase      int                    `json:"sdlcPhase,omitempty"`
	ParentIssueID  string                 `json:"parentIssueId,omitempty"`
	Source         map[string]interface{} `json:"source,omitempty"`
	Context        string                 `json:"context,omitempty"`
	PreferredAgent string                 `json:"preferredAgent,omitempty"`
}

type AddToQueueRequest struct {
	Command        string                 `json:"command"`
	Priority       int                    `json:"priority"`
	Source         map[string]interface{} `json:"source,omitempty"`
	Context        string                 `json:"context,omitempty"`
	PreferredAgent string                 `json:"preferredAgent,omitempty"`
}

type AddToQueueResponse struct {
	WorkItem       WorkItem  `json:"workItem"`
	Duplicate      *struct {
		ID        string `json:"id"`
		Status    string `json:"status"`
		CreatedAt string `json:"createdAt"`
	} `json:"duplicate,omitempty"`
	QueuePosition  int `json:"queuePosition,omitempty"`
}

type QueueStats struct {
	Pending      int        `json:"pending"`
	Active       int        `json:"active"`
	Completed    int        `json:"completed"`
	Failed       int        `json:"failed"`
	MaxActive    int        `json:"maxActive,omitempty"`
	NextItem     *WorkItem  `json:"nextItem,omitempty"`
	ConsumerPaused bool     `json:"consumerPaused,omitempty"`
	LastPollAt   string     `json:"lastPollAt,omitempty"`
}

type GrantPlanResponse struct {
	Organization string `json:"organization"`
	PlanTier     string `json:"planTier"`
	SeatLimit    int    `json:"seatLimit"`
	GrantedBy    string `json:"grantedBy"`
}

type OrgSummary struct {
	Name         string `json:"name"`
	PlanTier     string `json:"planTier"`
	SeatLimit    int    `json:"seatLimit"`
	TotalConfigs int    `json:"totalConfigs"`
	ManualGrant  *struct {
		GrantedBy string `json:"grantedBy"`
		GrantedAt string `json:"grantedAt"`
		Reason    string `json:"reason"`
	} `json:"manualGrant,omitempty"`
}

type ListOrganizationsResponse struct {
	Organizations []OrgSummary `json:"organizations"`
	Total         int          `json:"total"`
}

type FeatureFlagsResponse struct {
	OrgAudienceTierMap map[string]*string `json:"orgAudienceTierMap,omitempty"`
	OrgPlanMap         map[string]string  `json:"orgPlanMap,omitempty"`
}

type RunnerCredentials struct {
	ClaudeAiOauth map[string]interface{} `json:"claudeAiOauth,omitempty"`
}

type WorkflowTestRequest struct {
	FileName      string   `json:"fileName"`
	Type          string   `json:"type"` // "command" or "hook"
	Platform      string   `json:"platform,omitempty"`
	Content       string   `json:"content"`
	TestCases     []string `json:"testCases,omitempty"`
	MaxIterations int      `json:"maxIterations,omitempty"`
}

type FleetRegistration struct {
	Email              string `json:"email"`
	MachineID          string `json:"machineId"`
	Hostname           string `json:"hostname"`
	EnforcementStatus  struct {
		Installed    bool     `json:"installed"`
		Version      string   `json:"version"`
		PolicyVersion string   `json:"policyVersion"`
		Platforms    []string `json:"platforms"`
	} `json:"enforcementStatus"`
}

type GitHubIssue struct {
	Number      int      `json:"number"`
	Title       string   `json:"title"`
	URL         string   `json:"url,omitempty"`
	Labels      []string `json:"labels"`
	Priority    int      `json:"priority"`
	SDLcProgress struct {
		Status           string `json:"status"`
		CurrentPhase     int    `json:"currentPhase,omitempty"`
		CompletedPhases  []int  `json:"completedPhases"`
		TotalJobs        int    `json:"totalJobs"`
	} `json:"sdlcProgress"`
}

type NextWorkItemResponse struct {
	WorkItem         WorkItem `json:"workItem"`
	SuggestedCommand string   `json:"suggestedCommand"`
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

// Client wraps lib/httpclient with CLI auth token management.
type Client struct {
	baseURL    string
	httpClient *httpclient.Client
	token      string
}

// New creates a new API client. If token is empty, API calls without
// authentication will still work for public endpoints (/health).
func New(baseURL, token string) *Client {
	return &Client{
		baseURL:    baseURL,
		httpClient: httpclient.New(baseURL),
		token:     token,
	}
}

// NewFromConfig creates a client from the CLI config file.
func NewFromConfig() (*Client, error) {
	cfg, err := LoadConfig()
	if err != nil {
		return nil, err
	}
	return New(cfg.APIUrl, cfg.AuthToken()), nil
}

// authContext returns a context with the JWT token set for propagation.
func (c *Client) authContext() context.Context {
	ctx := context.Background()
	if c.token != "" {
		ctx = context.WithValue(ctx, auth.RawTokenKey, c.token)
		ctx = context.WithValue(ctx, auth.UserIDKey, "gal-cli")
	}
	return ctx
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

// GetCurrentUser hits GET /auth/me.
func (c *Client) GetCurrentUser() (*UserResponse, error) {
	var result UserResponse
	err := c.httpClient.Get(c.authContext(), "/auth/me", &result)
	return &result, err
}

// GetFeatureFlags hits GET /feature-flags.
func (c *Client) GetFeatureFlags() (*FeatureFlagsResponse, error) {
	var result FeatureFlagsResponse
	err := c.httpClient.Get(c.authContext(), "/feature-flags", &result)
	return &result, err
}

// GetCredentials hits GET /api/credentials.
func (c *Client) GetCredentials() (*CredentialsListResponse, error) {
	var result CredentialsListResponse
	err := c.httpClient.Get(c.authContext(), "/api/credentials", &result)
	return &result, err
}

// SyncCredentials hits POST /api/credentials/{provider}.
func (c *Client) SyncCredentials(provider string, fields map[string]interface{}) (*CredentialSyncResponse, error) {
	var result CredentialSyncResponse
	err := c.httpClient.Post(c.authContext(), "/api/credentials/"+provider, fields, &result)
	return &result, err
}

// ValidateCredential hits POST /api/credentials/{provider}/validate.
func (c *Client) ValidateCredential(provider string) (*ValidateCredentialResponse, error) {
	var result ValidateCredentialResponse
	err := c.httpClient.Post(c.authContext(), "/api/credentials/"+provider+"/validate", nil, &result)
	return &result, err
}

// ReportDeveloperStatus hits POST /organizations/{org}/developer-status.
func (c *Client) ReportDeveloperStatus(org string, status map[string]interface{}) error {
	return c.httpClient.Post(c.authContext(), "/organizations/"+org+"/developer-status", status, nil)
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

// GetOrganizations hits GET /api/organizations.
func (c *Client) GetOrganizations() ([]map[string]interface{}, error) {
	var result []map[string]interface{}
	err := c.httpClient.Get(c.authContext(), "/api/organizations", &result)
	return result, err
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

// CreateSession hits POST /api/sessions.
func (c *Client) CreateSession(req CreateSessionRequest) (*Session, error) {
	var result Session
	err := c.httpClient.Post(c.authContext(), "/api/sessions", req, &result)
	return &result, err
}

// ListSessions hits GET /api/sessions with optional filters.
func (c *Client) ListSessions(filters map[string]string) (*ListSessionsResponse, error) {
	path := "/api/sessions"
	if len(filters) > 0 {
		path += "?"
		i := 0
		for k, v := range filters {
			if i > 0 {
				path += "&"
			}
			path += k + "=" + v
			i++
		}
	}
	var result ListSessionsResponse
	err := c.httpClient.Get(c.authContext(), path, &result)
	return &result, err
}

// GetSession hits GET /api/sessions/{id}.
func (c *Client) GetSession(id string) (*Session, error) {
	var result Session
	err := c.httpClient.Get(c.authContext(), "/api/sessions/"+id, &result)
	return &result, err
}

// TerminateSession hits POST /api/sessions/{id}/terminate.
func (c *Client) TerminateSession(id, reason string) (*Session, error) {
	var result Session
	err := c.httpClient.Post(c.authContext(), "/api/sessions/"+id+"/terminate",
		map[string]string{"reason": reason}, &result)
	return &result, err
}

// ResumeSession hits POST /api/sessions/{id}/resume.
func (c *Client) ResumeSession(id, prompt, dispatchBackend string) (*ResumeSessionResponse, error) {
	body := map[string]interface{}{"prompt": prompt}
	if dispatchBackend != "" {
		body["dispatchBackend"] = dispatchBackend
	}
	var result ResumeSessionResponse
	err := c.httpClient.Post(c.authContext(), "/api/sessions/"+id+"/resume", body, &result)
	return &result, err
}

// SendDirective hits POST /api/sessions/{fromId}/directive.
func (c *Client) SendDirective(fromID string, directive SendDirectiveRequest) (map[string]interface{}, error) {
	var result map[string]interface{}
	err := c.httpClient.Post(c.authContext(), "/api/sessions/"+fromID+"/directive", directive, &result)
	return result, err
}

// ---------------------------------------------------------------------------
// Work Items
// ---------------------------------------------------------------------------

// GetNextPriorityWorkItem hits GET /organizations/{orgId}/work-items/next.
func (c *Client) GetNextPriorityWorkItem(orgID string) (*NextWorkItemResponse, error) {
	var result NextWorkItemResponse
	err := c.httpClient.Get(c.authContext(), "/organizations/"+orgID+"/work-items/next", &result)
	return &result, err
}

// GetNextWorkItem hits GET /api/work-items/next.
func (c *Client) GetNextWorkItem() (*WorkItem, error) {
	var result WorkItem
	err := c.httpClient.Get(c.authContext(), "/api/work-items/next", &result)
	return &result, err
}

// ClaimWorkItem hits POST /api/work-items/{id}/claim.
func (c *Client) ClaimWorkItem(id, machineID string) error {
	return c.httpClient.Post(c.authContext(), "/api/work-items/"+id+"/claim",
		map[string]string{"machineId": machineID}, nil)
}

// StartWorkItem hits POST /api/work-items/{id}/start.
func (c *Client) StartWorkItem(id, machineID string) error {
	return c.httpClient.Post(c.authContext(), "/api/work-items/"+id+"/start",
		map[string]string{"machineId": machineID}, nil)
}

// CompleteWorkItem hits POST /api/work-items/{id}/complete.
func (c *Client) CompleteWorkItem(id, machineID, message string, metadata map[string]interface{}) error {
	body := map[string]interface{}{
		"machineId": machineID,
		"message":   message,
		"metadata":  metadata,
	}
	return c.httpClient.Post(c.authContext(), "/api/work-items/"+id+"/complete", body, nil)
}

// FailWorkItem hits POST /api/work-items/{id}/fail.
func (c *Client) FailWorkItem(id, machineID, errMsg string, requeue bool) error {
	body := map[string]interface{}{
		"machineId": machineID,
		"error":     errMsg,
		"requeue":   requeue,
	}
	return c.httpClient.Post(c.authContext(), "/api/work-items/"+id+"/fail", body, nil)
}

// ReleaseWorkItem hits POST /api/work-items/{id}/release.
func (c *Client) ReleaseWorkItem(id string) error {
	return c.httpClient.Post(c.authContext(), "/api/work-items/"+id+"/release", nil, nil)
}

// HeartbeatWorkItem hits POST /api/work-items/{id}/heartbeat.
func (c *Client) HeartbeatWorkItem(id, machineID string) error {
	return c.httpClient.Post(c.authContext(), "/api/work-items/"+id+"/heartbeat",
		map[string]string{"machineId": machineID}, nil)
}

// UpdateWorkItem hits PUT /api/work-items/{id}.
func (c *Client) UpdateWorkItem(id string, fields map[string]interface{}) error {
	return c.httpClient.Patch(c.authContext(), "/api/work-items/"+id, fields, nil)
}

// ListWorkItems hits GET /api/work-items.
func (c *Client) ListWorkItems(filters map[string]string) ([]WorkItem, error) {
	path := "/api/work-items"
	if len(filters) > 0 {
		path += "?"
		i := 0
		for k, v := range filters {
			if i > 0 {
				path += "&"
			}
			path += k + "=" + v
			i++
		}
	}
	var result []WorkItem
	err := c.httpClient.Get(c.authContext(), path, &result)
	return result, err
}

// CreateWorkItem hits POST /api/work-items.
func (c *Client) CreateWorkItem(req CreateWorkItemRequest) (*WorkItem, error) {
	var result WorkItem
	err := c.httpClient.Post(c.authContext(), "/api/work-items", req, &result)
	return &result, err
}

// ---------------------------------------------------------------------------
// Queue
// ---------------------------------------------------------------------------

// AddToQueue hits POST /api/queue.
func (c *Client) AddToQueue(req AddToQueueRequest) (*AddToQueueResponse, error) {
	var result AddToQueueResponse
	err := c.httpClient.Post(c.authContext(), "/api/queue", req, &result)
	return &result, err
}

// ListQueue hits GET /api/queue.
func (c *Client) ListQueue(filters map[string]string) ([]WorkItem, error) {
	path := "/api/queue"
	if len(filters) > 0 {
		path += "?"
		i := 0
		for k, v := range filters {
			if i > 0 {
				path += "&"
			}
			path += k + "=" + v
			i++
		}
	}
	var result []WorkItem
	err := c.httpClient.Get(c.authContext(), path, &result)
	return result, err
}

// GetQueueStats hits GET /api/queue/stats.
func (c *Client) GetQueueStats() (*QueueStats, error) {
	var result QueueStats
	err := c.httpClient.Get(c.authContext(), "/api/queue/stats", &result)
	return &result, err
}

// PauseQueue hits POST /api/queue/pause.
func (c *Client) PauseQueue() (map[string]interface{}, error) {
	var result map[string]interface{}
	err := c.httpClient.Post(c.authContext(), "/api/queue/pause", nil, &result)
	return result, err
}

// ResumeQueue hits POST /api/queue/resume.
func (c *Client) ResumeQueue() (map[string]interface{}, error) {
	var result map[string]interface{}
	err := c.httpClient.Post(c.authContext(), "/api/queue/resume", nil, &result)
	return result, err
}

// CancelQueueItem hits POST /api/queue/{id}/cancel.
func (c *Client) CancelQueueItem(id string) (map[string]interface{}, error) {
	var result map[string]interface{}
	err := c.httpClient.Post(c.authContext(), "/api/queue/"+id+"/cancel", nil, &result)
	return result, err
}

// EnqueueIssues hits POST /api/queue/enqueue.
func (c *Client) EnqueueIssues(owner, repo string, issueNumbers []int) (map[string]interface{}, error) {
	body := map[string]interface{}{
		"owner": owner,
		"repo":  repo,
		"issueNumbers": issueNumbers,
	}
	var result map[string]interface{}
	err := c.httpClient.Post(c.authContext(), "/api/queue/enqueue", body, &result)
	return result, err
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

// GrantPlan hits POST /admin/organizations/{org}/grant-plan.
func (c *Client) GrantPlan(org, plan, reason string) (*GrantPlanResponse, error) {
	var result GrantPlanResponse
	err := c.httpClient.Post(c.authContext(),
		"/admin/organizations/"+org+"/grant-plan",
		map[string]string{"plan": plan, "reason": reason},
		&result)
	return &result, err
}

// ListOrganizations hits GET /admin/organizations.
func (c *Client) ListOrganizations() (*ListOrganizationsResponse, error) {
	var result ListOrganizationsResponse
	err := c.httpClient.Get(c.authContext(), "/admin/organizations", &result)
	return &result, err
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

// GetRunnerCredentials hits GET /api/runners/credentials/{sessionId}.
func (c *Client) GetRunnerCredentials(sessionID string) (*RunnerCredentials, error) {
	var result RunnerCredentials
	err := c.httpClient.Get(c.authContext(), "/api/runners/credentials/"+sessionID, &result)
	return &result, err
}

// ---------------------------------------------------------------------------
// Workflow Test
// ---------------------------------------------------------------------------

// TestWorkflow hits POST /organizations/{org}/workflow-test.
func (c *Client) TestWorkflow(org string, req WorkflowTestRequest) (map[string]interface{}, error) {
	var result map[string]interface{}
	err := c.httpClient.Post(c.authContext(), "/organizations/"+org+"/workflow-test", req, &result)
	return result, err
}

// TestWorkflowBatch hits POST /organizations/{org}/workflow-test/batch.
func (c *Client) TestWorkflowBatch(org string, requests []WorkflowTestRequest) (map[string]interface{}, error) {
	body := map[string]interface{}{"requests": requests}
	var result map[string]interface{}
	err := c.httpClient.Post(c.authContext(), "/organizations/"+org+"/workflow-test/batch", body, &result)
	return result, err
}

// ---------------------------------------------------------------------------
// Fleet
// ---------------------------------------------------------------------------

// RegisterFleet hits POST /organizations/{orgId}/fleet.
func (c *Client) RegisterFleet(orgID string, details FleetRegistration) error {
	return c.httpClient.Post(c.authContext(), "/organizations/"+orgID+"/fleet", details, nil)
}

// UnregisterFleet hits DELETE /organizations/{orgId}/fleet/{machineId}.
func (c *Client) UnregisterFleet(orgID, machineID string) error {
	return c.httpClient.Delete(c.authContext(), "/organizations/"+orgID+"/fleet/"+machineID)
}

// ---------------------------------------------------------------------------
// GitHub Issues
// ---------------------------------------------------------------------------

// GetGitHubIssues hits GET /api/github/issues.
func (c *Client) GetGitHubIssues(owner, repo string) ([]GitHubIssue, error) {
	var result []GitHubIssue
	err := c.httpClient.Get(c.authContext(),
		"/api/github/issues?owner="+owner+"&repo="+repo, &result)
	return result, err
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

// TestConnection hits GET /health and returns true if reachable.
func (c *Client) TestConnection() bool {
	var result interface{}
	err := c.httpClient.Get(context.Background(), "/health", &result)
	return err == nil
}
