import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GalApiClient } from '../api-client.js';
import { createWorkspaceParamSchema, resolveWorkspace } from '../workspace-context.js';

export function registerTeamTools(server: McpServer, apiClient: GalApiClient): void {
  server.tool(
    'gal_list_team_members',
    'List workspace team members with their GAL roles. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
    },
    async ({ orgName }) => {
      try {
        const result = await apiClient.listTeamMembers(resolveWorkspace(orgName));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error listing team members: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_set_team_role',
    'Change a workspace team member\'s GAL role (requires admin). If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      githubId: z.string().describe('GitHub user ID of the team member'),
      role: z.enum(['owner', 'admin', 'developer']).describe('New GAL role to assign'),
    },
    async ({ orgName, githubId, role }) => {
      try {
        const result = await apiClient.setTeamRole(resolveWorkspace(orgName), githubId, role);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error setting team role: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_sync_team',
    'Sync workspace team members from GitHub to refresh roles and membership. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
    },
    async ({ orgName }) => {
      try {
        const result = await apiClient.syncTeam(resolveWorkspace(orgName));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error syncing team: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
