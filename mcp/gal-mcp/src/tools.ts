/**
 * GAL MCP Tools — Composition Root
 *
 * Composes all MCP tool groups and registers them on the server.
 *
 * Tool groups:
 *   Always registered (governance):
 *     - Organization & Discovery (4 tools)
 *     - Approved Config (2 tools)
 *     - Config Governance (9 tools)
 *     - Team Management (3 tools)
 *     - Compliance & SDLC (3 tools)
 *     - Policy Agent (7 tools)
 *
 *   Gated by internalOnly / swarmOnly:
 *     - Session & Agent tools (19 tools, including dispatch rules)
 *     - Swarm tools (3 tools)
 *
 * Total: 49 tools (28 governance + 21 agent coordination)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GalApiClient } from "./api-client.js";

import { registerOrganizationTools } from "./tools/organization-tools.js";
import { registerDiscoveryTools } from "./tools/discovery-tools.js";
import { registerConfigTools } from "./tools/config-tools.js";
import { registerGovernanceTools } from "./tools/governance-tools.js";
import { registerTeamTools } from "./tools/team-tools.js";
import { registerComplianceTools } from "./tools/compliance-tools.js";
import { registerSessionTools } from "./tools/session-tools.js";
import { registerMemoryTools } from "./tools/memory-tools.js";
import { registerPolicyTools } from "./tools/policy-tools.js";
import { registerRagTools } from "./tools/rag-tools.js";
import { registerSwarmTools } from "./tools/swarm-tools.js";

interface RegisterToolsOptions {
  /**
   * When true, register all tools including background agent coordination.
   * When false, only governance tools.
   *
   * Derived from org audienceTier (billing-backed) + Remote Config.
   */
  internalOnly?: boolean;
  /**
   * When true, register Swarm tools.
   * Defaults to the internalOnly gate for backwards compatibility.
   */
  swarmOnly?: boolean;
}

/**
 * Register GAL MCP tools on the server.
 *
 * Governance tools (organizations, discovery, config, proposals, team, compliance)
 * are always registered. Agent coordination tools (sessions, directives, work items)
 * require internalOnly=true (derived from org audienceTier via API or cached config).
 * Swarm tools may be gated separately so Swarm preview access does not depend on
 * background-agent coordination being enabled.
 */
export function registerTools(
  server: McpServer,
  apiClient: GalApiClient,
  options?: RegisterToolsOptions,
): void {
  const enableAgentTools = options?.internalOnly ?? false;
  const enableSwarmTools = options?.swarmOnly ?? enableAgentTools;

  // Always registered — core governance
  registerOrganizationTools(server, apiClient);
  registerDiscoveryTools(server, apiClient);
  registerConfigTools(server, apiClient);
  registerGovernanceTools(server, apiClient, {
    enableProposals: enableAgentTools,
  });
  registerTeamTools(server, apiClient);
  registerComplianceTools(server, apiClient);
  registerMemoryTools(server, apiClient);
  registerRagTools(server, apiClient);
  registerPolicyTools(server, apiClient);

  // Gated — background agent coordination
  if (enableAgentTools) {
    registerSessionTools(server, apiClient);
  }

  if (enableSwarmTools) {
    registerSwarmTools(server, apiClient);
  }
}
