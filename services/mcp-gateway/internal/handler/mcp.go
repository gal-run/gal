//go:build cloud
// +build cloud

package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gal-run/gal/services/lib/handler"
	"github.com/gal-run/gal/services/mcp-gateway/internal/domain"
)

// MCP protocol constants.
const (
	mcpServerName    = "gal-mcp-gateway"
	mcpServerVersion = "0.1.0"
)

// developmentEnabled reports whether development-tier (work-in-progress) features
// are exposed. Off by default: the gateway must not advertise or run features that
// aren't real yet. Set GAL_DEVELOPMENT=1 (or true) to surface them.
func developmentEnabled() bool {
	v := os.Getenv("GAL_DEVELOPMENT")
	return v == "1" || v == "true"
}

// developmentTools are advertised and callable ONLY when developmentEnabled().
// Their implementations are stubs (see "Tool implementations (stubs)" below) that
// return hardcoded success, so by default they are hidden from tools/list and
// rejected by tools/call as if they did not exist.
var developmentTools = map[string]bool{
	"compliance": true,
	"config":     true,
	"discovery":  true,
	"governance": true,
	"memory":     true,
	"org":        true,
	"policy":     true,
	"session":    true,
	"swarm":      true,
	"team":       true,
}

// mcpToolDefinitions are the GAL MCP tools exposed via Streamable HTTP.
var mcpToolDefinitions = []domain.MCPToolDefinition{
	{
		Name:        "compliance",
		Description: "Check agent compliance with organizational policies and rules",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action": map[string]any{"type": "string", "description": "Action to perform: check, report, status"},
			},
			"required": []string{"action"},
		},
	},
	{
		Name:        "config",
		Description: "Manage agent configuration including approved configs and sync",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action": map[string]any{"type": "string", "description": "Action: get, set, sync, list"},
				"key":    map[string]any{"type": "string", "description": "Configuration key"},
				"value":  map[string]any{"type": "string", "description": "Configuration value"},
			},
			"required": []string{"action"},
		},
	},
	{
		Name:        "discovery",
		Description: "Discover organizations, repos, and agent configurations across the GAL ecosystem",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"scope": map[string]any{"type": "string", "description": "Discovery scope: orgs, repos, agents, all"},
				"org":   map[string]any{"type": "string", "description": "Organization name filter"},
			},
			"required": []string{"scope"},
		},
	},
	{
		Name:        "governance",
		Description: "Apply governance policies, approve proposals, and manage audit trails",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action":   map[string]any{"type": "string", "description": "Action: apply, approve, reject, audit"},
				"policyId": map[string]any{"type": "string", "description": "Policy identifier"},
			},
			"required": []string{"action"},
		},
	},
	{
		Name:        "memory",
		Description: "Access and manage the GAL memory system for persistent agent context",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action": map[string]any{"type": "string", "description": "Action: read, write, search, delete"},
				"key":    map[string]any{"type": "string", "description": "Memory key"},
				"value":  map[string]any{"type": "string", "description": "Memory value to store"},
			},
			"required": []string{"action"},
		},
	},
	{
		Name:        "org",
		Description: "Manage organization settings, members, and billing configuration",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action": map[string]any{"type": "string", "description": "Action: info, members, settings, update"},
				"org":    map[string]any{"type": "string", "description": "Organization name or ID"},
			},
			"required": []string{"action"},
		},
	},
	{
		Name:        "policy",
		Description: "Create, read, update, and delete governance policies",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action":   map[string]any{"type": "string", "description": "Action: create, read, update, delete, list"},
				"policyId": map[string]any{"type": "string", "description": "Policy identifier"},
				"rules":    map[string]any{"type": "object", "description": "Policy rules"},
			},
			"required": []string{"action"},
		},
	},
	{
		Name:        "session",
		Description: "Manage background agent sessions: create, monitor, stop, and inspect",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action":    map[string]any{"type": "string", "description": "Action: create, status, list, stop, logs"},
				"sessionId": map[string]any{"type": "string", "description": "Session identifier"},
				"agent":     map[string]any{"type": "string", "description": "Agent type: claude, codex, gemini"},
			},
			"required": []string{"action"},
		},
	},
	{
		Name:        "swarm",
		Description: "Coordinate multi-agent swarms: dispatch, monitor, and aggregate results",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action":   map[string]any{"type": "string", "description": "Action: dispatch, status, results, scale, stop"},
				"strategy": map[string]any{"type": "string", "description": "Swarm strategy: parallel, sequential, leader"},
				"agents":   map[string]any{"type": "array", "description": "Agent specifications", "items": map[string]any{"type": "object"}},
			},
			"required": []string{"action"},
		},
	},
	{
		Name:        "team",
		Description: "Manage agent teams, roles, and coordination patterns",
		InputSchema: map[string]any{
			"type": "object",
			"properties": map[string]any{
				"action": map[string]any{"type": "string", "description": "Action: create, list, assign, remove, status"},
				"teamId": map[string]any{"type": "string", "description": "Team identifier"},
				"member": map[string]any{"type": "string", "description": "Team member identifier"},
			},
			"required": []string{"action"},
		},
	},
}

// mcpResourceDefinitions are the MCP resources exposed by this gateway.
var mcpResourceDefinitions = []domain.MCPResourceDefinition{
	{URI: "gal://tools", Name: "GAL Tools", Description: "Available GAL MCP tools", MimeType: "application/json"},
	{URI: "gal://agents", Name: "Active Agents", Description: "Currently active agent sessions", MimeType: "application/json"},
	{URI: "gal://orgs", Name: "Organizations", Description: "GAL organization list", MimeType: "application/json"},
	{URI: "gal://config", Name: "Configuration", Description: "Approved GAL configurations", MimeType: "application/json"},
}

// mcpPromptDefinitions are the MCP prompts exposed by this gateway.
var mcpPromptDefinitions = []domain.MCPPromptDefinition{
	{Name: "agent-setup", Description: "Guide for setting up a new GAL agent"},
	{Name: "compliance-check", Description: "Run a compliance check on agent configuration"},
	{Name: "policy-review", Description: "Review and approve governance policies"},
}

// HandleMCP is the Streamable HTTP entry point for MCP JSON-RPC.
// POST  -> JSON-RPC method call
// GET   -> session info / SSE stream setup
// DELETE -> session termination
func (g *GatewayService) HandleMCP(w http.ResponseWriter, r *http.Request) {
	method := strings.ToUpper(r.Method)

	// Extract Bearer token
	bearerToken := extractBearerToken(r)
	if bearerToken == "" {
		g.respondMcpUnauthorized(w, "Authentication required. Provide a valid MCP OAuth bearer token.")
		return
	}

	// Validate the MCP bearer token
	claims, err := g.validateMcpToken(r.Context(), bearerToken)
	if err != nil {
		g.Log.Warn("MCP token validation failed", "error", err)
		g.respondMcpUnauthorized(w, "Invalid or expired token: "+err.Error())
		return
	}
	g.Log.Debug("MCP request", "method", method, "user", claims.UserID, "org", claims.OrgID)

	switch method {
	case "POST":
		g.handleMcpPost(w, r, claims)
	case "GET":
		g.handleMcpGet(w, claims)
	case "DELETE":
		g.handleMcpDelete(w, claims)
	default:
		handler.RespondJSON(w, http.StatusMethodNotAllowed, domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      nil,
			Error:   &domain.MCPErrorObj{Code: -32600, Message: fmt.Sprintf("Method %s not allowed. Use POST, GET, or DELETE.", method)},
		})
	}
}

// handleMcpPost processes a JSON-RPC 2.0 request body.
func (g *GatewayService) handleMcpPost(w http.ResponseWriter, r *http.Request, claims *domain.TokenClaims) {
	body, err := io.ReadAll(r.Body)
	r.Body.Close()
	if err != nil {
		handler.RespondJSON(w, http.StatusBadRequest, domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      nil,
			Error:   &domain.MCPErrorObj{Code: -32700, Message: "Parse error: unable to read request body"},
		})
		return
	}

	body = bytes.TrimSpace(body)
	if len(body) == 0 {
		handler.RespondJSON(w, http.StatusBadRequest, domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      nil,
			Error:   &domain.MCPErrorObj{Code: -32700, Message: "Parse error: request body is empty"},
		})
		return
	}

	// Batch arrays are not supported in this implementation
	if body[0] == '[' {
		handler.RespondJSON(w, http.StatusBadRequest, domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      nil,
			Error:   &domain.MCPErrorObj{Code: -32600, Message: "Batch requests are not supported"},
		})
		return
	}

	var req domain.MCPRequest
	if err := json.Unmarshal(body, &req); err != nil {
		handler.RespondJSON(w, http.StatusBadRequest, domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      nil,
			Error:   &domain.MCPErrorObj{Code: -32700, Message: "Parse error: invalid JSON"},
		})
		return
	}

	if req.JSONRPC != "2.0" {
		handler.RespondJSON(w, http.StatusBadRequest, domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &domain.MCPErrorObj{Code: -32600, Message: `Invalid request: "jsonrpc" must be "2.0"`},
		})
		return
	}

	resp := g.processMCPRequest(r.Context(), &req, claims)
	handler.RespondJSON(w, http.StatusOK, resp)
}

// handleMcpGet returns session info for SSE stream setup.
func (g *GatewayService) handleMcpGet(w http.ResponseWriter, claims *domain.TokenClaims) {
	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"protocol": "streamable-http",
		"session": map[string]string{
			"user":   claims.UserID,
			"org":    claims.OrgID,
			"client": claims.ClientID,
		},
		"server":  mcpServerName,
		"version": mcpServerVersion,
	})
}

// handleMcpDelete acknowledges session termination.
func (g *GatewayService) handleMcpDelete(w http.ResponseWriter, claims *domain.TokenClaims) {
	handler.RespondJSON(w, http.StatusOK, map[string]string{
		"status": "session_terminated",
		"user":   claims.UserID,
	})
}

// processMCPRequest routes a JSON-RPC 2.0 request to the appropriate handler.
func (g *GatewayService) processMCPRequest(ctx context.Context, req *domain.MCPRequest, claims *domain.TokenClaims) domain.MCPResponse {
	switch req.Method {
	case "tools/list":
		return g.handleToolsList(req)
	case "tools/call":
		return g.handleToolsCall(req, claims)
	case "resources/list":
		return g.handleResourcesList(req)
	case "resources/read":
		return g.handleResourcesRead(req)
	case "prompts/list":
		return g.handlePromptsList(req)
	case "prompts/get":
		return g.handlePromptsGet(req)
	default:
		return domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &domain.MCPErrorObj{Code: -32601, Message: fmt.Sprintf("Method not found: %s", req.Method)},
		}
	}
}

// --- tool/list handler ---

func (g *GatewayService) handleToolsList(req *domain.MCPRequest) domain.MCPResponse {
	dev := developmentEnabled()
	tools := make([]domain.MCPToolDefinition, 0, len(mcpToolDefinitions))
	for _, t := range mcpToolDefinitions {
		if developmentTools[t.Name] && !dev {
			continue // hide work-in-progress tools unless GAL_DEVELOPMENT is set
		}
		tools = append(tools, t)
	}
	return domain.MCPResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result: map[string]any{
			"tools": tools,
		},
	}
}

// --- tool/call handler ---

func (g *GatewayService) handleToolsCall(req *domain.MCPRequest, claims *domain.TokenClaims) domain.MCPResponse {
	params, ok := req.Params.(map[string]any)
	if !ok {
		return domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &domain.MCPErrorObj{Code: -32602, Message: "Invalid params: expected object with 'name' and 'arguments'"},
		}
	}

	toolName, _ := params["name"].(string)
	arguments, _ := params["arguments"].(map[string]any)

	if toolName == "" {
		return domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &domain.MCPErrorObj{Code: -32602, Message: "Invalid params: 'name' is required"},
		}
	}

	content, meta := g.executeTool(toolName, arguments, claims)
	if content == nil {
		return domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &domain.MCPErrorObj{Code: -32601, Message: fmt.Sprintf("Unknown tool: %s", toolName)},
		}
	}

	return domain.MCPResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result: map[string]any{
			"content":  content,
			"metadata": meta,
		},
	}
}

// --- resources handlers ---

func (g *GatewayService) handleResourcesList(req *domain.MCPRequest) domain.MCPResponse {
	return domain.MCPResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result: map[string]any{
			"resources": mcpResourceDefinitions,
		},
	}
}

func (g *GatewayService) handleResourcesRead(req *domain.MCPRequest) domain.MCPResponse {
	params, ok := req.Params.(map[string]any)
	if !ok {
		return domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &domain.MCPErrorObj{Code: -32602, Message: "Invalid params: expected object with 'uri'"},
		}
	}

	uri, _ := params["uri"].(string)
	if uri == "" {
		return domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &domain.MCPErrorObj{Code: -32602, Message: "Invalid params: 'uri' is required"},
		}
	}

	return domain.MCPResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result: map[string]any{
			"contents": []map[string]any{
				{
					"uri":  uri,
					"text": fmt.Sprintf("Resource content for %s (placeholder)", uri),
				},
			},
		},
	}
}

// --- prompts handlers ---

func (g *GatewayService) handlePromptsList(req *domain.MCPRequest) domain.MCPResponse {
	return domain.MCPResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result: map[string]any{
			"prompts": mcpPromptDefinitions,
		},
	}
}

func (g *GatewayService) handlePromptsGet(req *domain.MCPRequest) domain.MCPResponse {
	params, ok := req.Params.(map[string]any)
	if !ok {
		return domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &domain.MCPErrorObj{Code: -32602, Message: "Invalid params: expected object with 'name'"},
		}
	}

	name, _ := params["name"].(string)
	if name == "" {
		return domain.MCPResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &domain.MCPErrorObj{Code: -32602, Message: "Invalid params: 'name' is required"},
		}
	}

	return domain.MCPResponse{
		JSONRPC: "2.0",
		ID:      req.ID,
		Result: map[string]any{
			"description": fmt.Sprintf("Prompt: %s", name),
			"messages": []map[string]any{
				{
					"role": "user",
					"content": map[string]any{
						"type": "text",
						"text": fmt.Sprintf("Execute the %s prompt", name),
					},
				},
			},
		},
	}
}

// --- Tool dispatch ---

func (g *GatewayService) executeTool(name string, args map[string]any, claims *domain.TokenClaims) ([]map[string]any, map[string]any) {
	// Development-tier tools are unavailable unless GAL_DEVELOPMENT is set; treat them
	// as non-existent so tools/call returns "Unknown tool" rather than fake success.
	if developmentTools[name] && !developmentEnabled() {
		return nil, nil
	}
	switch name {
	case "compliance":
		return g.toolCompliance(args, claims)
	case "config":
		return g.toolConfig(args, claims)
	case "discovery":
		return g.toolDiscovery(args, claims)
	case "governance":
		return g.toolGovernance(args, claims)
	case "memory":
		return g.toolMemory(args, claims)
	case "org":
		return g.toolOrg(args, claims)
	case "policy":
		return g.toolPolicy(args, claims)
	case "session":
		return g.toolSession(args, claims)
	case "swarm":
		return g.toolSwarm(args, claims)
	case "team":
		return g.toolTeam(args, claims)
	default:
		return nil, nil
	}
}

// --- Tool implementations (stubs) ---

func (g *GatewayService) toolCompliance(args map[string]any, claims *domain.TokenClaims) ([]map[string]any, map[string]any) {
	action, _ := args["action"].(string)
	content := []map[string]any{
		{"type": "text", "text": fmt.Sprintf("Compliance check '%s' completed for org %s", action, claims.OrgID)},
	}
	meta := map[string]any{
		"tool":      "compliance",
		"action":    action,
		"orgId":     claims.OrgID,
		"status":    "compliant",
		"checkedAt": time.Now().UTC().Format(time.RFC3339),
	}
	return content, meta
}

func (g *GatewayService) toolConfig(args map[string]any, claims *domain.TokenClaims) ([]map[string]any, map[string]any) {
	action, _ := args["action"].(string)
	content := []map[string]any{
		{"type": "text", "text": fmt.Sprintf("Config '%s' executed for org %s", action, claims.OrgID)},
	}
	meta := map[string]any{
		"tool":   "config",
		"action": action,
		"orgId":  claims.OrgID,
		"synced": true,
	}
	return content, meta
}

func (g *GatewayService) toolDiscovery(args map[string]any, claims *domain.TokenClaims) ([]map[string]any, map[string]any) {
	content := []map[string]any{
		{"type": "text", "text": fmt.Sprintf("Discovery completed for org %s", claims.OrgID)},
	}
	meta := map[string]any{
		"tool":  "discovery",
		"orgId": claims.OrgID,
		"orgs":  []string{claims.OrgID},
		"repos": []string{},
	}
	return content, meta
}

func (g *GatewayService) toolGovernance(args map[string]any, claims *domain.TokenClaims) ([]map[string]any, map[string]any) {
	action, _ := args["action"].(string)
	content := []map[string]any{
		{"type": "text", "text": fmt.Sprintf("Governance action '%s' completed for org %s", action, claims.OrgID)},
	}
	meta := map[string]any{
		"tool":     "governance",
		"action":   action,
		"orgId":    claims.OrgID,
		"approved": true,
	}
	return content, meta
}

func (g *GatewayService) toolMemory(args map[string]any, claims *domain.TokenClaims) ([]map[string]any, map[string]any) {
	action, _ := args["action"].(string)
	content := []map[string]any{
		{"type": "text", "text": fmt.Sprintf("Memory '%s' executed for org %s", action, claims.OrgID)},
	}
	meta := map[string]any{
		"tool":   "memory",
		"action": action,
		"orgId":  claims.OrgID,
	}
	return content, meta
}

func (g *GatewayService) toolOrg(args map[string]any, claims *domain.TokenClaims) ([]map[string]any, map[string]any) {
	action, _ := args["action"].(string)
	content := []map[string]any{
		{"type": "text", "text": fmt.Sprintf("Org '%s' completed for org %s", action, claims.OrgID)},
	}
	meta := map[string]any{
		"tool":   "org",
		"action": action,
		"orgId":  claims.OrgID,
	}
	return content, meta
}

func (g *GatewayService) toolPolicy(args map[string]any, claims *domain.TokenClaims) ([]map[string]any, map[string]any) {
	action, _ := args["action"].(string)
	content := []map[string]any{
		{"type": "text", "text": fmt.Sprintf("Policy '%s' completed for org %s", action, claims.OrgID)},
	}
	meta := map[string]any{
		"tool":   "policy",
		"action": action,
		"orgId":  claims.OrgID,
	}
	return content, meta
}

func (g *GatewayService) toolSession(args map[string]any, claims *domain.TokenClaims) ([]map[string]any, map[string]any) {
	action, _ := args["action"].(string)
	content := []map[string]any{
		{"type": "text", "text": fmt.Sprintf("Session '%s' completed for org %s", action, claims.OrgID)},
	}
	meta := map[string]any{
		"tool":     "session",
		"action":   action,
		"orgId":    claims.OrgID,
		"sessions": []string{},
	}
	return content, meta
}

func (g *GatewayService) toolSwarm(args map[string]any, claims *domain.TokenClaims) ([]map[string]any, map[string]any) {
	action, _ := args["action"].(string)
	content := []map[string]any{
		{"type": "text", "text": fmt.Sprintf("Swarm '%s' completed for org %s", action, claims.OrgID)},
	}
	meta := map[string]any{
		"tool":   "swarm",
		"action": action,
		"orgId":  claims.OrgID,
		"status": "available",
	}
	return content, meta
}

func (g *GatewayService) toolTeam(args map[string]any, claims *domain.TokenClaims) ([]map[string]any, map[string]any) {
	action, _ := args["action"].(string)
	content := []map[string]any{
		{"type": "text", "text": fmt.Sprintf("Team '%s' completed for org %s", action, claims.OrgID)},
	}
	meta := map[string]any{
		"tool":   "team",
		"action": action,
		"orgId":  claims.OrgID,
	}
	return content, meta
}

// --- Token validation ---

func (g *GatewayService) validateMcpToken(ctx context.Context, bearerToken string) (*domain.TokenClaims, error) {
	mcpToken, err := g.Store.GetTokenByValue(ctx, bearerToken)
	if err != nil {
		return nil, fmt.Errorf("token not found: %w", err)
	}

	if mcpToken.Revoked {
		return nil, fmt.Errorf("token has been revoked")
	}

	if time.Now().After(mcpToken.ExpiresAt) {
		return nil, fmt.Errorf("token has expired")
	}

	return &domain.TokenClaims{
		UserID:   mcpToken.UserID,
		OrgID:    mcpToken.OrgID,
		ClientID: mcpToken.ClientID,
		Scope:    mcpToken.Scope,
	}, nil
}

// --- Helpers ---

func extractBearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return ""
}

func (g *GatewayService) respondMcpUnauthorized(w http.ResponseWriter, message string) {
	w.Header().Set("WWW-Authenticate", `Bearer realm="GAL MCP", resource_metadata="/.well-known/oauth-protected-resource/mcp"`)
	handler.RespondJSON(w, http.StatusUnauthorized, domain.MCPResponse{
		JSONRPC: "2.0",
		ID:      nil,
		Error:   &domain.MCPErrorObj{Code: -32001, Message: message},
	})
}
