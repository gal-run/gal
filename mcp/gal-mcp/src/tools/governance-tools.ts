import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GalApiClient } from '../api-client.js';
import { createWorkspaceParamSchema, resolveWorkspace } from '../workspace-context.js';

export function registerGovernanceTools(server: McpServer, apiClient: GalApiClient, options?: { enableProposals?: boolean }): void {
  const proposalsEnabled = options?.enableProposals ?? false;

  // --- Proposals (internal-only,) ---

  if (proposalsEnabled) {
    server.tool(
    'gal_list_proposals',
    'List config change proposals for a workspace. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
    },
    async ({ orgName }) => {
      try {
        const result = await apiClient.listProposals(resolveWorkspace(orgName));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error listing proposals: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_create_proposal',
    'Create a config change proposal for review in a workspace. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      title: z.string().describe('Proposal title'),
      description: z.string().optional().describe('Detailed description of the proposed change'),
      changes: z.record(z.unknown()).describe('The proposed configuration changes'),
    },
    async ({ orgName, title, description, changes }) => {
      try {
        const result = await apiClient.createProposal(resolveWorkspace(orgName), { title, description, changes });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error creating proposal: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_review_proposal',
    'Approve or reject a config change proposal (requires admin or owner GAL role)',
    {
      proposalId: z.string().describe('Proposal ID to review'),
      action: z.enum(['approve', 'reject']).describe('Whether to approve or reject'),
      comment: z.string().optional().describe('Review comment'),
    },
    async ({ proposalId, action, comment }) => {
      try {
        const result = await apiClient.reviewProposal(proposalId, { action, comment });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error reviewing proposal: ${message}` }],
          isError: true,
        };
      }
    },
  );
  } // end proposalsEnabled

  // --- Config Versions ---

  server.tool(
    'gal_list_config_versions',
    'List config version history for a workspace. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
    },
    async ({ orgName }) => {
      try {
        const result = await apiClient.listConfigVersions(resolveWorkspace(orgName));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error listing config versions: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_rollback_config',
    'Rollback to a previous config version in a workspace (requires admin or owner GAL role). If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      versionId: z.string().describe('Version ID to rollback to'),
    },
    async ({ orgName, versionId }) => {
      try {
        const result = await apiClient.rollbackConfig(resolveWorkspace(orgName), versionId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error rolling back config: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- Tracked Repos ---

  server.tool(
    'gal_list_tracked_repos',
    'List repositories tracked for config governance in a workspace. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
    },
    async ({ orgName }) => {
      try {
        const result = await apiClient.listTrackedRepos(resolveWorkspace(orgName));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error listing tracked repos: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_add_tracked_repo',
    'Add a repository to config governance tracking in a workspace (requires admin or owner GAL role). If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      repoName: z.string().optional().describe('Repository name to track'),
      repo: z.string().optional().describe('Repository name to track (legacy alias)'),
      platform: z.string().optional().describe('Platform to track (e.g. "claude")'),
    },
    async ({ orgName, repoName, repo, platform }) => {
      try {
        const result = await apiClient.addTrackedRepo(resolveWorkspace(orgName), {
          repoName: repoName ?? repo,
          platform,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error adding tracked repo: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_remove_tracked_repo',
    'Remove a repository from config governance tracking in a workspace (requires admin or owner GAL role). If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      repo: z.string().describe('Repository name to remove'),
    },
    async ({ orgName, repo }) => {
      try {
        const result = await apiClient.removeTrackedRepo(resolveWorkspace(orgName), repo);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error removing tracked repo: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- Governance Overrides ---

  server.tool(
    'gal_report_governance_override',
    'Report a correction to an AI governance decision. Records a human override that feeds into the retraining pipeline for improving future AI decisions. Requires admin or owner GAL role.',
    {
      processType: z.enum([
        'auto-approval',
        'config-copilot',
        'orchestrator',
        'discovery',
        'llm-analysis',
        'pick-by-ai',
        'sync-copilot',
      ]).describe('The type of governance process being corrected'),
      decisionId: z.string().describe('ID of the AI decision being overridden (used to look up original input/output)'),
      correctedValue: z.string().describe('The correct value or decision that the AI should have produced (JSON string or plain text)'),
      reason: z.string().describe('Human-readable reason for the override'),
      orgName: createWorkspaceParamSchema(),
    },
    async ({ processType, decisionId, correctedValue, reason, orgName }) => {
      try {
        const workspace = resolveWorkspace(orgName);

        // Parse correctedValue as JSON if possible, otherwise wrap as string
        let correctedOutput: Record<string, unknown>;
        try {
          const parsed = JSON.parse(correctedValue);
          correctedOutput = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
            ? parsed
            : { value: parsed };
        } catch {
          correctedOutput = { value: correctedValue };
        }

        const result = await apiClient.reportGovernanceOverride({
          processType,
          organizationId: workspace,
          userId: 'mcp-user', // Authenticated via API token; server resolves actual user
          originalInput: { decisionId },
          originalOutput: { decisionId },
          correctedOutput,
          overrideReason: reason,
        });

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error reporting governance override: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
