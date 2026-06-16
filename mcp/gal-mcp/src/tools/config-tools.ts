import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GalApiClient } from '../api-client.js';
import { createWorkspaceParamSchema, resolveWorkspace } from '../workspace-context.js';

export function registerConfigTools(server: McpServer, apiClient: GalApiClient): void {
  server.tool(
    'gal_get_approved_config',
    'Get the workspace-approved configuration for a specific AI platform. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      platform: z.string().describe('Platform name (e.g. "claude", "cursor", "copilot")'),
    },
    async ({ orgName, platform }) => {
      try {
        const result = await apiClient.getApprovedConfig(resolveWorkspace(orgName), platform);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error getting approved config: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_set_approved_config',
    'Set or update the workspace-approved configuration for a platform (requires admin or owner GAL role). If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      platform: z.string().describe('Platform name (e.g. "claude", "cursor", "copilot")'),
      config: z.record(z.unknown()).describe('Configuration object to set as approved'),
    },
    async ({ orgName, platform, config }) => {
      try {
        const result = await apiClient.setApprovedConfig(resolveWorkspace(orgName), platform, config);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error setting approved config: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
