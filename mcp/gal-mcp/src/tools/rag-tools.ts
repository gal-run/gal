import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GalApiClient } from "../api-client.js";
import { createWorkspaceParamSchema, resolveWorkspace } from "../workspace-context.js";

function buildError(message: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `${message}: ${detail}` }],
    isError: true,
  };
}

export function registerRagTools(
  server: McpServer,
  apiClient: GalApiClient,
): void {
  server.tool(
    "gal_rag_search",
    "Semantic + keyword search across indexed code, docs, issues, PRs, and memory. Returns compact hits (id, score, snippet, sourceRef) without full content — use gal_rag_get to fetch full chunks for relevant IDs. Supports agentic retrieval: check coverage.nextQuery in the response and call again with the suggested query when coverage is low.",
    {
      orgId: createWorkspaceParamSchema().describe("Organization identifier"),
      query: z.string().min(1).describe("Natural language search query"),
      repoScopes: z
        .array(z.string())
        .optional()
        .describe("Limit to specific repos in owner/repo format"),
      sourceTypes: z
        .array(
          z.enum(["go", "rust", "ts", "py", "md", "issue", "pr", "adr", "memory"]),
        )
        .optional()
        .describe("Limit to specific content types"),
      tags: z.array(z.string()).optional().describe("Filter by tags"),
      topK: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Max results (default 20)"),
      embeddingConfig: z
        .enum(["OPENAI_TEXT_SMALL_3_256", "VOYAGE_3_5", "VOYAGE_CODE_3_512", "VOYAGE_3_5_LITE_512"])
        .optional()
        .describe("Embedding model — defaults to VOYAGE_3_5_LITE_512"),
    },
    async ({ orgId, query, repoScopes, sourceTypes, tags, topK, embeddingConfig }) => {
      try {
        const resolvedOrgId = resolveWorkspace(orgId);
        const result = await apiClient.ragSearch({
          orgId: resolvedOrgId,
          query,
          repoScopes,
          sourceTypes,
          tags,
          topK,
          embeddingConfig,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return buildError("Error calling gal-rag search", error);
      }
    },
  );

  server.tool(
    "gal_rag_get",
    "Fetch full chunk content for specific IDs returned by gal_rag_search. Progressive disclosure: call gal_rag_search first, then gal_rag_get only for the IDs you actually need.",
    {
      orgId: createWorkspaceParamSchema().describe("Organization identifier"),
      ids: z
        .array(z.string())
        .min(1)
        .max(20)
        .describe("Chunk IDs from gal_rag_search results"),
    },
    async ({ orgId, ids }) => {
      try {
        const resolvedOrgId = resolveWorkspace(orgId);
        const result = await apiClient.ragGet(resolvedOrgId, ids);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return buildError("Error calling gal-rag get", error);
      }
    },
  );

  server.tool(
    "gal_rag_graph",
    "Expand a set of seed chunk IDs to their neighbors via symbol/import relationships. Use after gal_rag_search to discover related code without a second query — e.g. find all files that import a symbol found in search results.",
    {
      orgId: createWorkspaceParamSchema().describe("Organization identifier"),
      seedIds: z
        .array(z.string())
        .min(1)
        .max(20)
        .describe("Chunk IDs to expand from"),
      hops: z
        .number()
        .int()
        .min(1)
        .max(3)
        .optional()
        .describe("BFS depth (default 1)"),
      edgeKinds: z
        .array(z.enum(["imports", "calls", "references", "implements"]))
        .optional()
        .describe("Edge types to follow (default: all)"),
    },
    async ({ orgId, seedIds, hops, edgeKinds }) => {
      try {
        const resolvedOrgId = resolveWorkspace(orgId);
        const result = await apiClient.ragGraph({
          orgId: resolvedOrgId,
          seedIds,
          hops,
          edgeKinds,
        });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return buildError("Error calling gal-rag graph", error);
      }
    },
  );

  server.tool(
    "gal_rag_evaluate",
    "Self-critique a set of search results: scores coverage, freshness, and diversity, then suggests a follow-up query if gaps exist. Use when gal_rag_search results feel incomplete before deciding whether to retrieve more.",
    {
      query: z.string().min(1).describe("The original search query"),
      resultIds: z
        .array(z.string())
        .min(1)
        .max(50)
        .describe("IDs from gal_rag_search to evaluate"),
      criteria: z
        .array(z.string())
        .optional()
        .describe("Additional evaluation criteria (e.g. 'security', 'performance')"),
    },
    async ({ query, resultIds, criteria }) => {
      try {
        const result = await apiClient.ragEvaluate({ query, resultIds, criteria });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        return buildError("Error calling gal-rag evaluate", error);
      }
    },
  );
}
