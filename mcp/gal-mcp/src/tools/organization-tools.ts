import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { GalApiClient } from '../api-client.js';
import {
  createWorkspaceParamSchema,
  getActiveWorkspace,
  resolveWorkspace,
  setActiveWorkspace,
} from '../workspace-context.js';

function formatWorkspaceListResult(result: unknown): unknown {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return result;
  }

  const parsed = result as Record<string, unknown>;
  if (!Array.isArray(parsed.organizations)) {
    return parsed;
  }

  return {
    ...parsed,
    workspaces: parsed.organizations,
  };
}

function buildError(message: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text' as const, text: `${message}: ${detail}` }],
    isError: true,
  };
}

export function registerOrganizationTools(
  server: McpServer,
  apiClient: GalApiClient,
): void {
  const listOrganizationsHandler = async () => {
    try {
      const result = await apiClient.listOrganizations();
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return buildError('Error listing organizations', error);
    }
  };

  const listWorkspacesHandler = async () => {
    try {
      const result = await apiClient.listWorkspaces();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(formatWorkspaceListResult(result), null, 2),
          },
        ],
      };
    } catch (error) {
      return buildError('Error listing workspaces', error);
    }
  };

  const syncWorkspaceHandler = async ({ orgName }: { orgName?: string }) => {
    try {
      const workspaceName = resolveWorkspace(orgName);
      const result = await apiClient.syncWorkspace(workspaceName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                workspaceName,
                ...(result as Record<string, unknown>),
              },
              null,
              2,
            ),
          },
        ],
      };
    } catch (error) {
      return buildError('Error syncing workspace', error);
    }
  };

  server.tool(
    'gal_list_workspaces',
    'List connected GitHub workspaces (organizations and personal accounts) and their installation status.',
    listWorkspacesHandler,
  );

  server.tool(
    'gal_list_organizations',
    'Legacy alias for gal_list_workspaces. Lists connected GitHub organizations and personal workspaces.',
    listOrganizationsHandler,
  );

  server.tool(
    'gal_set_active_workspace',
    'Set the active workspace for this session. Call this first when working in a specific workspace so subsequent GAL tools can omit orgName.',
    {
      workspaceName: createWorkspaceParamSchema().unwrap().describe(
        'Workspace name (GitHub organization or personal account) to use as the active session context.',
      ),
    },
    async ({ workspaceName }) => {
      setActiveWorkspace(workspaceName);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                activeWorkspace: workspaceName,
                message: `Active workspace set to "${workspaceName}"`,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.tool(
    'gal_get_active_workspace',
    'Get the currently active workspace for this session.',
    async () => ({
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({ activeWorkspace: getActiveWorkspace() }, null, 2),
        },
      ],
    }),
  );

  server.tool(
    'gal_sync_workspace',
    'Trigger a quick-sync to refresh connected workspace data. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
    },
    syncWorkspaceHandler,
  );

  server.tool(
    'gal_sync_organization',
    'Legacy alias for gal_sync_workspace. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
    },
    async ({ orgName }) => {
      try {
        const workspaceName = resolveWorkspace(orgName);
        const result = await apiClient.syncOrganization(workspaceName);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return buildError('Error syncing organization', error);
      }
    },
  );
}
