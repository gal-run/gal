import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GalApiClient } from '../api-client.js';
import { createWorkspaceParamSchema, resolveWorkspace } from '../workspace-context.js';

export function registerComplianceTools(server: McpServer, apiClient: GalApiClient): void {
  // =========================================================================
  // Audit Query
  // =========================================================================
  server.tool(
    'audit_query',
    'Query audit logs for an org with optional filters. Returns log entries matching the specified criteria. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      action: z.enum(['tool_call', 'file_edit', 'bash_command', 'config_change', 'policy_violation'])
        .optional()
        .describe('Filter by audit action type'),
      severity: z.enum(['info', 'warning', 'critical'])
        .optional()
        .describe('Filter by severity level'),
      userId: z.string().optional().describe('Filter by user ID'),
      startDate: z.string().optional().describe('ISO 8601 start date for date range filter (e.g. 2024-01-01T00:00:00Z)'),
      endDate: z.string().optional().describe('ISO 8601 end date for date range filter (e.g. 2024-12-31T23:59:59Z)'),
      limit: z.number().int().min(1).max(500).optional().describe('Maximum number of entries to return (default: 50, max: 500)'),
      offset: z.number().int().min(0).optional().describe('Number of entries to skip for pagination (default: 0)'),
    },
    async ({ orgName, action, severity, userId, startDate, endDate, limit, offset }) => {
      try {
        const result = await apiClient.queryAuditLogs(resolveWorkspace(orgName), {
          action,
          severity,
          userId,
          startDate,
          endDate,
          limit,
          offset,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error querying audit logs: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // =========================================================================
  // Compliance Status
  // =========================================================================
  server.tool(
    'compliance_status',
    'Get compliance status for an org, including policy adherence, scan results, and any violations. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
    },
    async ({ orgName }) => {
      try {
        const result = await apiClient.getComplianceStatus(resolveWorkspace(orgName));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error getting compliance status: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // =========================================================================
  // Audit Summary
  // =========================================================================
  server.tool(
    'audit_summary',
    'Get audit summary statistics for an org, including totals broken down by action, user, session type, and severity. Defaults to the last 30 days. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      startDate: z.string().optional().describe('ISO 8601 start date (default: 30 days ago)'),
      endDate: z.string().optional().describe('ISO 8601 end date (default: now)'),
    },
    async ({ orgName, startDate, endDate }) => {
      try {
        const result = await apiClient.getAuditSummary(resolveWorkspace(orgName), { startDate, endDate });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error getting audit summary: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_scan_compliance',
    'Trigger a compliance scan for a workspace in the background. Returns immediately with scanId (202) — use gal_get_compliance_results with scanId to poll for results. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
    },
    async ({ orgName }) => {
      try {
        const result = await apiClient.scanCompliance(resolveWorkspace(orgName));
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error scanning compliance: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_get_compliance_results',
    'Get compliance scan results. Supports async polling via scanId and pagination via limit/offset. If no report exists, call gal_scan_compliance first. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      scanId: z.string().optional().describe('Optional scanId from gal_scan_compliance to poll for async scan results'),
      limit: z.number().int().min(1).max(500).optional().describe('Maximum issues to return (default: 50, max: 500)'),
      offset: z.number().int().min(0).optional().describe('Number of issues to skip for pagination (default: 0)'),
    },
    async ({ orgName, scanId, limit, offset }) => {
      try {
        const result = await apiClient.getComplianceResults(resolveWorkspace(orgName), { scanId, limit, offset });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error getting compliance results: ${message}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    'gal_get_sdlc_status',
    'Get SDLC phase tracking status for a specific issue',
    {
      issueNumber: z.number().describe('GitHub issue number to check SDLC status for'),
    },
    async ({ issueNumber }) => {
      try {
        const result = await apiClient.getSdlcStatus(issueNumber);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error getting SDLC status: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
