// Package domain defines MCP-specific domain types for the MCP Gateway.
package domain

import "time"

// MCP JSON-RPC error codes (standard JSON-RPC 2.0).
const (
	MCPParseError     = -32700
	MCPInvalidRequest = -32600
	MCPMethodNotFound = -32601
	MCPInvalidParams  = -32602
	MCPInternalError  = -32603
)

// Known MCP tool names exposed by this gateway.
var MCPToolNames = []string{
	"compliance",
	"config",
	"discovery",
	"governance",
	"memory",
	"org",
	"policy",
	"session",
	"swarm",
	"team",
}

// MCPRequest represents a JSON-RPC 2.0 request.
type MCPRequest struct {
	JSONRPC string `json:"jsonrpc"`
	ID      any    `json:"id"`
	Method  string `json:"method"`
	Params  any    `json:"params,omitempty"`
}

// MCPResponse represents a JSON-RPC 2.0 response.
type MCPResponse struct {
	JSONRPC string       `json:"jsonrpc"`
	ID      any          `json:"id"`
	Result  any          `json:"result,omitempty"`
	Error   *MCPErrorObj `json:"error,omitempty"`
}

// MCPErrorObj represents a JSON-RPC 2.0 error object.
type MCPErrorObj struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Data    any    `json:"data,omitempty"`
}

// MCPToolDefinition describes a tool available via MCP.
type MCPToolDefinition struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	InputSchema any    `json:"inputSchema"`
}

// MCPResourceDefinition describes a resource available via MCP.
type MCPResourceDefinition struct {
	URI         string `json:"uri"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
}

// MCPPromptDefinition describes a prompt available via MCP.
type MCPPromptDefinition struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

// McpToken represents an MCP OAuth 2.0 token document in Firestore.
type McpToken struct {
	ID           string    `json:"id" firestore:"id"`
	Token        string    `json:"token" firestore:"token"`
	RefreshToken string    `json:"refreshToken" firestore:"refreshToken"`
	ClientID     string    `json:"clientId" firestore:"clientId"`
	UserID       string    `json:"userId" firestore:"userId"`
	OrgID        string    `json:"orgId" firestore:"orgId"`
	Scope        string    `json:"scope" firestore:"scope"`
	TokenType    string    `json:"tokenType" firestore:"tokenType"`
	ExpiresAt    time.Time `json:"expiresAt" firestore:"expiresAt"`
	Revoked      bool      `json:"revoked" firestore:"revoked"`
	CreatedAt    time.Time `json:"createdAt" firestore:"createdAt"`
}

// McpClient represents a registered MCP client application in Firestore.
type McpClient struct {
	ID            string    `json:"id" firestore:"id"`
	Name          string    `json:"name" firestore:"name"`
	RedirectURIs  []string  `json:"redirectUris" firestore:"redirectUris"`
	GrantTypes    []string  `json:"grantTypes" firestore:"grantTypes"`
	ResponseTypes []string  `json:"responseTypes" firestore:"responseTypes"`
	Scopes        string    `json:"scopes" firestore:"scopes"`
	IsDynamic     bool      `json:"isDynamic" firestore:"isDynamic"`
	ExpiresAt     time.Time `json:"expiresAt" firestore:"expiresAt"`
	CreatedAt     time.Time `json:"createdAt" firestore:"createdAt"`
}

// FeatureFlag represents a feature flag configuration in Firestore.
type FeatureFlag struct {
	ID          string    `json:"id" firestore:"id"`
	Key         string    `json:"key" firestore:"key"`
	Enabled     bool      `json:"enabled" firestore:"enabled"`
	Description string    `json:"description" firestore:"description"`
	Audience    string    `json:"audience" firestore:"audience"`
	UpdatedAt   time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// TokenResponse is the OAuth 2.0 token endpoint response.
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	Scope        string `json:"scope"`
}

// TokenClaims are extracted from a validated MCP bearer token.
type TokenClaims struct {
	UserID   string
	OrgID    string
	ClientID string
	Scope    string
}

// HealthStatus describes gateway health.
type HealthStatus struct {
	Status    string `json:"status"`
	Service   string `json:"service"`
	Timestamp string `json:"timestamp"`
}

// ReadinessCheck describes readiness of a downstream dependency.
type ReadinessCheck struct {
	Status    string            `json:"status"`
	Service   string            `json:"service"`
	Timestamp string            `json:"timestamp"`
	Checks    map[string]string `json:"checks"`
}

// GatewayStatusResponse is the full gateway health summary.
type GatewayStatusResponse struct {
	Status    string                 `json:"status"`
	Service   string                 `json:"service"`
	Timestamp string                 `json:"timestamp"`
	Version   string                 `json:"version"`
	Uptime    int64                  `json:"uptime"`
	Checks    map[string]any         `json:"checks"`
}

// BuildInfoResponse contains build version metadata.
type BuildInfoResponse struct {
	Commit     string `json:"commit"`
	DeployedAt string `json:"deployedAt"`
}

// WellKnownOAuthResponse is the RFC 8414 OAuth authorization server metadata.
type WellKnownOAuthResponse struct {
	Issuer                           string   `json:"issuer"`
	AuthorizationEndpoint            string   `json:"authorization_endpoint"`
	TokenEndpoint                    string   `json:"token_endpoint"`
	RevocationEndpoint               string   `json:"revocation_endpoint"`
	ResponseTypesSupported           []string `json:"response_types_supported"`
	GrantTypesSupported              []string `json:"grant_types_supported"`
	CodeChallengeMethodsSupported    []string `json:"code_challenge_methods_supported"`
	TokenEndpointAuthMethodsSupported []string `json:"token_endpoint_auth_methods_supported"`
	ScopesSupported                  []string `json:"scopes_supported"`
	ServiceDocumentation             string   `json:"service_documentation"`
}

// WellKnownProtectedResourceResponse is the RFC 9728 protected resource metadata.
type WellKnownProtectedResourceResponse struct {
	Resource              string   `json:"resource"`
	AuthorizationServers  []string `json:"authorization_servers"`
	ScopesSupported       []string `json:"scopes_supported"`
	BearerMethodsSupported []string `json:"bearer_methods_supported"`
	ResourceDocumentation string   `json:"resource_documentation"`
}
