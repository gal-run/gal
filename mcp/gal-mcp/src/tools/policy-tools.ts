import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GalApiClient } from "../api-client.js";
import {
  createWorkspaceParamSchema,
  resolveWorkspace,
} from "../workspace-context.js";

export function registerPolicyTools(
  server: McpServer,
  apiClient: GalApiClient,
): void {
  server.tool(
    "gal_policy_propose",
    "Create a policy proposal for the workspace. Policies define governance rules that can be approved and enforced. Requires admin to approve.",
    {
      orgName: createWorkspaceParamSchema(),
      name: z.string().describe("Policy name"),
      description: z.string().describe("Policy description"),
      type: z
        .enum(["distribution-first", "security", "custom"])
        .describe("Policy type"),
      rationale: z.string().describe("Why this policy is needed"),
      rules: z
        .array(
          z.object({
            id: z.string().describe("Unique rule identifier"),
            name: z.string().describe("Rule name"),
            description: z.string().optional().describe("Rule description"),
            condition: z
              .object({
                type: z.enum([
                  "work_type",
                  "repo_pattern",
                  "label",
                  "issue_title",
                  "custom",
                ]),
                operator: z.enum([
                  "equals",
                  "contains",
                  "matches",
                  "in",
                  "not_in",
                ]),
                value: z.union([z.string(), z.array(z.string())]),
              })
              .describe("When this rule applies"),
            action: z
              .enum(["allow", "warn", "block"])
              .describe("What action to take"),
            message: z.string().describe("Message to show when rule triggers"),
            severity: z.enum(["info", "warning", "error"]).optional(),
            evidenceRequired: z
              .array(z.string())
              .optional()
              .describe("Evidence needed to proceed"),
          }),
        )
        .describe("Policy rules"),
      enforcement: z
        .object({
          enabled: z.boolean().describe("Whether enforcement is active"),
          mode: z.enum(["off", "warn", "block"]).describe("Enforcement mode"),
          scope: z.enum(["org", "repo"]).describe("Scope of enforcement"),
          repoScope: z
            .array(z.string())
            .optional()
            .describe("Repos if scope is repo"),
        })
        .describe("Enforcement settings"),
    },
    async ({
      orgName,
      name,
      description,
      type,
      rationale,
      rules,
      enforcement,
    }) => {
      try {
        const result = await apiClient.createPolicy(resolveWorkspace(orgName), {
          name,
          description,
          type,
          rationale,
          rules,
          enforcement,
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error creating policy: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "gal_policy_list",
    "List policies for a workspace. Optionally filter by status or type. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.",
    {
      orgName: createWorkspaceParamSchema(),
      status: z
        .enum(["draft", "pending", "approved", "rejected", "deprecated"])
        .optional()
        .describe("Filter by status"),
      type: z
        .enum(["distribution-first", "security", "custom"])
        .optional()
        .describe("Filter by type"),
    },
    async ({ orgName, status, type }) => {
      try {
        const opts = status || type ? { status, type } : undefined;
        const result = await apiClient.listPolicies(
          resolveWorkspace(orgName),
          opts,
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error listing policies: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "gal_policy_get",
    "Get details of a specific policy by ID.",
    {
      policyId: z.string().describe("Policy ID"),
      orgName: createWorkspaceParamSchema(),
    },
    async ({ policyId, orgName }) => {
      try {
        const result = await apiClient.getPolicy(
          resolveWorkspace(orgName),
          policyId,
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            { type: "text" as const, text: `Error getting policy: ${message}` },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "gal_policy_approve",
    "Approve a policy proposal (admin only). Once approved, the policy can be enabled for enforcement.",
    {
      policyId: z.string().describe("Policy ID to approve"),
      orgName: createWorkspaceParamSchema(),
      comment: z.string().optional().describe("Optional approval comment"),
    },
    async ({ policyId, orgName, comment }) => {
      try {
        const result = await apiClient.reviewPolicy(
          resolveWorkspace(orgName),
          policyId,
          {
            action: "approve",
            comment,
          },
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error approving policy: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "gal_policy_reject",
    "Reject a policy proposal (admin only). The policy will be marked as rejected and cannot be enabled.",
    {
      policyId: z.string().describe("Policy ID to reject"),
      orgName: createWorkspaceParamSchema(),
      comment: z.string().describe("Reason for rejection"),
    },
    async ({ policyId, orgName, comment }) => {
      try {
        const result = await apiClient.reviewPolicy(
          resolveWorkspace(orgName),
          policyId,
          {
            action: "reject",
            comment,
          },
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error rejecting policy: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "gal_policy_check",
    "Check if work context is allowed by policy. Returns enforcement decision with reasons and evidence requirements.",
    {
      orgName: createWorkspaceParamSchema(),
      policyId: z
        .string()
        .optional()
        .describe(
          "Specific policy ID to check (optional, checks all org policies if omitted)",
        ),
      context: z
        .object({
          workType: z
            .string()
            .optional()
            .describe("Type of work (feature, bugfix, migration, etc.)"),
          repo: z.string().optional().describe("Repository name (owner/repo)"),
          issueNumber: z.number().optional().describe("Issue number"),
          issueLabels: z.array(z.string()).optional().describe("Issue labels"),
          issueTitle: z.string().optional().describe("Issue title"),
          issueBody: z.string().optional().describe("Issue body"),
          userLogin: z.string().optional().describe("User login"),
          branch: z.string().optional().describe("Branch name"),
          customContext: z
            .record(z.unknown())
            .optional()
            .describe("Additional context"),
        })
        .describe("Work context to check against policy"),
    },
    async ({ orgName, policyId, context }) => {
      try {
        const result = policyId
          ? await apiClient.checkSpecificPolicy(
              resolveWorkspace(orgName),
              policyId,
              context,
            )
          : await apiClient.checkOrgPolicy(resolveWorkspace(orgName), context);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error checking policy: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "gal_policy_set_enforcement",
    "Update policy enforcement settings (admin only). Can toggle enforcement on/off, change mode, or update scope.",
    {
      policyId: z.string().describe("Policy ID to update"),
      orgName: createWorkspaceParamSchema(),
      enabled: z.boolean().optional().describe("Enable or disable enforcement"),
      mode: z
        .enum(["off", "warn", "block"])
        .optional()
        .describe("Enforcement mode"),
      scope: z.enum(["org", "repo"]).optional().describe("Enforcement scope"),
      repoScope: z
        .array(z.string())
        .optional()
        .describe("Repos if scope is repo"),
    },
    async ({ policyId, orgName, enabled, mode, scope, repoScope }) => {
      try {
        const result = await apiClient.updatePolicyEnforcement(
          resolveWorkspace(orgName),
          policyId,
          {
            enabled,
            mode,
            scope,
            repoScope,
          },
        );
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [
            {
              type: "text" as const,
              text: `Error updating enforcement: ${message}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
