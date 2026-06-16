import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GalApiClient } from "../api-client.js";
import { getStoredSessionId } from "./session-tools.js";
import {
  createWorkspaceParamSchema,
  resolveWorkspace,
} from "../workspace-context.js";

function buildError(message: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `${message}: ${detail}` }],
    isError: true,
  };
}

export function registerMemoryTools(
  server: McpServer,
  apiClient: GalApiClient,
): void {
  server.tool(
    "gal_memory_search",
    "Search shared organization memory — returns compact index (id, title, tags, confidence) without full content. Use this first for progressive disclosure: scan results, then call gal_memory_get with specific IDs to fetch full content.",
    {
      orgId: createWorkspaceParamSchema().describe("Organization identifier"),
      repoScope: z
        .string()
        .optional()
        .describe(
          "Optional repo scope in owner/repo format. Includes org-wide entries when set.",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of entries to return"),
      sessionId: z
        .string()
        .optional()
        .describe(
          "Optional session ID. Defaults to the session registered via gal_register_session",
        ),
    },
    async ({ orgId, repoScope, limit, sessionId }) => {
      try {
        const resolvedOrgId = resolveWorkspace(orgId);
        const result = await apiClient.searchMemory({
          orgId: resolvedOrgId,
          repoScope,
          limit,
          sessionId: sessionId ?? getStoredSessionId() ?? undefined,
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return buildError("Error searching shared memory", error);
      }
    },
  );

  server.tool(
    "gal_memory_get",
    "Get full content for specific memory entries by ID. Use after gal_memory_search to fetch details only for relevant entries.",
    {
      orgId: createWorkspaceParamSchema().describe("Organization identifier"),
      entryIds: z
        .array(z.string())
        .min(1)
        .max(20)
        .describe("Memory entry IDs to fetch full content for"),
    },
    async ({ orgId, entryIds }) => {
      try {
        const resolvedOrgId = resolveWorkspace(orgId);
        const entries = await apiClient.getMemoryByIds(resolvedOrgId, entryIds);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ entries, count: entries.length }, null, 2),
            },
          ],
        };
      } catch (error) {
        return buildError("Error getting memory entries", error);
      }
    },
  );

  server.tool(
    "gal_read_memory",
    "Read shared organization memory entries for context injection, ordered by confidence and recency. Prefer gal_memory_search + gal_memory_get for progressive disclosure to reduce context window usage.",
    {
      orgId: createWorkspaceParamSchema().describe("Organization identifier"),
      repoScope: z
        .string()
        .optional()
        .describe(
          "Optional repo scope in owner/repo format. Includes org-wide entries when set.",
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of entries to return"),
      sessionId: z
        .string()
        .optional()
        .describe(
          "Optional session ID. Defaults to the session registered via gal_register_session",
        ),
    },
    async ({ orgId, repoScope, limit, sessionId }) => {
      try {
        const resolvedOrgId = resolveWorkspace(orgId);
        const result = await apiClient.readMemory({
          orgId: resolvedOrgId,
          repoScope,
          limit,
          sessionId: sessionId ?? getStoredSessionId() ?? undefined,
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return buildError("Error reading shared memory", error);
      }
    },
  );

  server.tool(
    "gal_write_memory",
    "Write a shared memory entry for this organization.",
    {
      orgId: createWorkspaceParamSchema().describe("Organization identifier"),
      content: z.string().describe("The memory content to store"),
      repoScope: z
        .string()
        .optional()
        .describe(
          "Optional owner/repo scope. Omit for organization-wide memory.",
        ),
      tags: z
        .array(z.string())
        .optional()
        .describe("Optional tags to improve retrieval relevance"),
      source: z
        .enum(["agent", "developer", "governance"])
        .optional()
        .describe("Source of the memory entry (defaults to developer)"),
      sessionId: z
        .string()
        .optional()
        .describe(
          "Optional session ID. Defaults to the session registered via gal_register_session",
        ),
    },
    async ({ orgId, content, repoScope, tags, source, sessionId }) => {
      try {
        const resolvedOrgId = resolveWorkspace(orgId);
        const result = await apiClient.writeMemory({
          orgId: resolvedOrgId,
          content,
          repoScope,
          tags,
          source,
          sessionId: sessionId ?? getStoredSessionId() ?? undefined,
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return buildError("Error writing shared memory", error);
      }
    },
  );

  server.tool(
    "gal_get_peer_activity",
    "Get active peer session activity for the organization from the agent activity pool.",
    {
      orgId: createWorkspaceParamSchema().describe("Organization identifier"),
      repoScope: z
        .string()
        .optional()
        .describe("Optional owner/repo scope filter"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Maximum number of activity items"),
    },
    async ({ orgId, repoScope, limit }) => {
      try {
        const resolvedOrgId = resolveWorkspace(orgId);
        const result = await apiClient.getPeerActivity({
          orgId: resolvedOrgId,
          repoScope,
          limit,
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return buildError("Error getting peer activity", error);
      }
    },
  );
}
