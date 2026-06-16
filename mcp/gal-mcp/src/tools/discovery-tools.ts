import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GalApiClient } from '../api-client.js';
import { createWorkspaceParamSchema, resolveWorkspace } from '../workspace-context.js';

export function registerDiscoveryTools(server: McpServer, apiClient: GalApiClient): void {
  server.tool(
    'gal_get_discovered_configs',
    'List discovered AI agent configuration files across all repositories in a workspace. Returns isStale:true when the cache is empty or outdated — call gal_sync_workspace to repopulate. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      type: z.string().optional().describe('Filter by config type (e.g. "claude", "cursor", "copilot")'),
    },
    async ({ orgName, type }) => {
      try {
        const result = await apiClient.getDiscoveredConfigs(
          resolveWorkspace(orgName),
          type ? { type } : undefined,
        );
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error getting discovered configs: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_get_config_content',
    'Get the content of a specific configuration file from a repository in a workspace. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      repo: z.string().describe('Repository name (e.g. "my-repo")'),
      path: z.string().describe('File path within the repository (e.g. "CLAUDE.md")'),
    },
    async ({ orgName, repo, path }) => {
      try {
        const result = await apiClient.getConfigContent(resolveWorkspace(orgName), repo, path);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error getting config content: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_pick_config_by_ai',
    'Use AI to select the best config from multiple discovered instances of the same config file. Analyzes content, commit frequency, and recency to recommend the most suitable version for org approval. Returns selected content and reasoning.',
    {
      orgName: createWorkspaceParamSchema(),
      configName: z.string().describe('Config name (e.g. "CLAUDE.md")'),
      configType: z.string().describe('Config type (e.g. "instructions", "settings")'),
      instances: z
        .array(
          z.object({
            repo: z.string(),
            path: z.string(),
            content: z.string(),
            commitDate: z.string().optional(),
            commitCount30d: z.number().optional(),
          }),
        )
        .min(1)
        .max(20)
        .describe('List of config instances to evaluate'),
      intention: z
        .string()
        .optional()
        .describe(
          'What makes a good config for your org (e.g. "most actively maintained version")',
        ),
    },
    async ({ orgName, configName, configType, instances, intention }) => {
      try {
        const result = await apiClient.pickConfigByAi(resolveWorkspace(orgName), {
          configName,
          configType,
          instances,
          intention,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error picking config by AI: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
