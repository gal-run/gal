//go:build cloud

package handler

import (
	"testing"

	"github.com/gal-run/gal/services/mcp-gateway/internal/domain"
)

// TestDevelopmentToolsHiddenByDefault asserts the development gate: with
// GAL_DEVELOPMENT unset, the stub tools are neither advertised by tools/list
// nor callable via tools/call (they return as if they do not exist). This is
// the honest default — the gateway must not advertise features that aren't real.
func TestDevelopmentToolsHiddenByDefault(t *testing.T) {
	t.Setenv("GAL_DEVELOPMENT", "")
	g := &GatewayService{}

	resp := g.handleToolsList(&domain.MCPRequest{ID: 1})
	result, ok := resp.Result.(map[string]any)
	if !ok {
		t.Fatalf("tools/list result is not a map: %#v", resp.Result)
	}
	tools, ok := result["tools"].([]domain.MCPToolDefinition)
	if !ok {
		t.Fatalf("tools field is not []MCPToolDefinition: %#v", result["tools"])
	}
	if len(tools) != 0 {
		t.Fatalf("expected 0 tools advertised by default (all 10 are development stubs), got %d", len(tools))
	}

	content, _ := g.executeTool("compliance", map[string]any{"action": "check"}, &domain.TokenClaims{OrgID: "org-1"})
	if content != nil {
		t.Fatalf("development tool 'compliance' should be uncallable when GAL_DEVELOPMENT is unset")
	}
}

// TestDevelopmentToolsVisibleWhenEnabled asserts the gate opens with the flag:
// GAL_DEVELOPMENT=1 surfaces and runs the development-tier tools.
func TestDevelopmentToolsVisibleWhenEnabled(t *testing.T) {
	t.Setenv("GAL_DEVELOPMENT", "1")
	g := &GatewayService{}

	resp := g.handleToolsList(&domain.MCPRequest{ID: 1})
	tools := resp.Result.(map[string]any)["tools"].([]domain.MCPToolDefinition)
	if len(tools) != len(mcpToolDefinitions) {
		t.Fatalf("expected all %d tools advertised with GAL_DEVELOPMENT=1, got %d", len(mcpToolDefinitions), len(tools))
	}

	content, _ := g.executeTool("compliance", map[string]any{"action": "check"}, &domain.TokenClaims{OrgID: "org-1"})
	if content == nil {
		t.Fatalf("development tool 'compliance' should be callable with GAL_DEVELOPMENT=1")
	}
}
