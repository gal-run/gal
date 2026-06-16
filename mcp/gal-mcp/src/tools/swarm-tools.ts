import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  normalizeGalSwarmRunnerLabel,
  normalizeGalSwarmRunnerLabels,
  normalizeGalSwarmWorkerIssues,
  type GalSwarmWorkerDispatchRequest,
  type GalSwarmWorkerIssue,
} from "@gal-run/swarm";
import { GalApiClient } from "../api-client.js";
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

function parseIssuesFromObjective(objective: string): GalSwarmWorkerIssue[] {
  const issues: GalSwarmWorkerIssue[] = [];
  const seen = new Set<string>();
  const matches = objective.matchAll(/([\w.-]+\/[\w.-]+)#(\d+)(?:\s*\(([^)]+)\))?/g);
  for (const match of matches) {
    const repository = match[1];
    const issueNumber = parseInt(match[2], 10);
    const key = `${repository}#${issueNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({
      repository,
      issueNumber,
      title: match[3]?.trim() || `${repository}#${issueNumber}`,
      url: `https://github.com/${repository}/issues/${issueNumber}`,
    });
  }
  return issues;
}

interface WorkerDispatchToolOptions {
  mode?: string;
  workerOnly?: boolean;
  workerDispatchEnabled?: boolean;
  workerMaxSessions?: number;
  workerAgent?: string;
  workerModel?: string;
  workerRunnerLabel?: string;
  workerRunnerLabels?: string[];
  workerIssues?: unknown[];
}

function buildWorkerDispatch(
  objective: string,
  options: WorkerDispatchToolOptions,
): GalSwarmWorkerDispatchRequest | undefined {
  const inferredIssues = normalizeGalSwarmWorkerIssues(parseIssuesFromObjective(objective));
  const explicitIssues = options.workerIssues?.length
    ? normalizeGalSwarmWorkerIssues(options.workerIssues)
    : [];
  const shouldDispatch =
    options.workerOnly === true ||
    options.workerDispatchEnabled === true ||
    explicitIssues.length > 0 ||
    inferredIssues.length > 0;
  if (!shouldDispatch) return undefined;

  const issues = explicitIssues.length > 0 ? explicitIssues : inferredIssues;
  if (issues.length === 0) {
    throw new Error(
      "Worker dispatch requires workerIssues or issue references like owner/repo#123 in objective.",
    );
  }

  const dispatch: GalSwarmWorkerDispatchRequest = { enabled: true, issues };
  dispatch.maxSessions = options.workerMaxSessions ?? dispatch.issues.length;
  dispatch.dispatchBackend = "stratus";
  dispatch.agent = options.workerAgent;
  dispatch.model = options.workerModel;

  if (options.workerRunnerLabel) {
    const runnerLabel = normalizeGalSwarmRunnerLabel(options.workerRunnerLabel);
    if (!runnerLabel) {
      throw new Error(`Unsupported GAL Swarm runner label: ${options.workerRunnerLabel}`);
    }
    dispatch.runnerLabel = runnerLabel;
  }
  if (options.workerRunnerLabels?.length) {
    const runnerLabels = normalizeGalSwarmRunnerLabels(options.workerRunnerLabels);
    if (!runnerLabels?.length) {
      throw new Error("workerRunnerLabels did not contain any supported GAL Swarm runner labels.");
    }
    dispatch.runnerLabels = runnerLabels;
  }

  return dispatch;
}

export function registerSwarmTools(
  server: McpServer,
  apiClient: GalApiClient,
): void {
  server.tool(
    "gal_swarm_run",
    "Create a GAL Swarm run plan from inside GAL Code. Defaults to dry-run and the safe GCP L4 smoke profile; apply mode requires approval evidence and server-side gates.",
    {
      orgName: createWorkspaceParamSchema(),
      objective: z
        .string()
        .min(1)
        .describe("Swarm objective or issue/release batch description."),
      highLevelPrompt: z
        .string()
        .min(1)
        .optional()
        .describe("Operator's high-level prompt/intent for the swarm questionnaire."),
      successCriteria: z
        .array(z.string().min(1))
        .optional()
        .describe("Concrete success criteria for the swarm questionnaire."),
      constraints: z
        .array(z.string().min(1))
        .optional()
        .describe("Execution constraints, safety limits, repos, providers, or things not to touch."),
      approvalQuestion: z
        .string()
        .min(1)
        .optional()
        .describe("Exact execution approval question to ask before apply mode."),
      mode: z
        .enum(["dry-run", "apply"])
        .optional()
        .describe("Run mode. Defaults to dry-run."),
      provider: z
        .enum(["stratus"])
        .optional()
        .describe("Swarm provider target. Currently only Stratus-backed worker swarms are supported."),
      computeProfileId: z
        .string()
        .optional()
        .describe("Compute profile id. Defaults to deepseek-v4-pro."),
      capacityPolicyProfile: z
        .enum(["dev-smoke", "small-paid", "large-burst"])
        .optional()
        .describe("Capacity policy profile controlling drain/shutdown timing."),
      desiredWorkers: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Desired worker count. Defaults to 1."),
      desiredComputeUnits: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Desired compute unit count. Defaults to 1."),
      ttlHours: z
        .number()
        .positive()
        .max(2)
        .optional()
        .describe("Burst TTL in hours. Defaults to 0.25."),
      maxHourlyUsd: z
        .number()
        .positive()
        .optional()
        .describe("Maximum hourly spend. Defaults to 5."),
      serverlessEndpointId: z
        .string()
        .optional()
        .describe("Serverless fallback endpoint id."),
      tasks: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Estimated task count. Defaults to 1."),
      promptTokens: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Estimated prompt tokens."),
      completionTokens: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Estimated completion tokens."),
      toolCalls: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Estimated tool call count."),
      workflowWaitSeconds: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Estimated CI/workflow wait seconds."),
      sandboxCount: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Estimated agent sandbox count."),
      approvalEvidenceUrl: z
        .string()
        .url()
        .optional()
        .describe("Approval evidence URL required for apply mode."),
      executionApproved: z
        .boolean()
        .optional()
        .describe("Explicit operator approval for apply mode. Must be true to request execution."),
      approvedBy: z
        .string()
        .optional()
        .describe("Operator identity that approved execution."),
      correlationId: z
        .string()
        .optional()
        .describe("Optional stable run id/correlation id."),
      workerOnly: z
        .boolean()
        .optional()
        .describe("Create a worker-session-only Stratus swarm and skip the GPU pipeline."),
      workerDispatchEnabled: z
        .boolean()
        .optional()
        .describe("Enable worker session dispatch for supplied or inferred issues."),
      workerMaxSessions: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Maximum worker sessions to dispatch."),
      workerAgent: z
        .string()
        .optional()
        .describe("Worker session agent."),
      workerModel: z
        .string()
        .optional()
        .describe("Worker session model override."),
      workerRunnerLabel: z
        .string()
        .optional()
        .describe("Single GAL Swarm runner label."),
      workerRunnerLabels: z
        .array(z.string().min(1))
        .optional()
        .describe("GAL Swarm runner labels to round-robin."),
      workerIssues: z
        .array(z.object({
          repository: z.string().min(1),
          issueNumber: z.number().int().positive(),
          title: z.string().min(1).optional(),
          url: z.string().optional(),
          labels: z.array(z.string()).optional(),
        }))
        .optional()
        .describe("Explicit issue list for worker session dispatch."),
    },
    async ({
      orgName,
      objective,
      highLevelPrompt,
      successCriteria,
      constraints,
      approvalQuestion,
      mode,
      provider,
      computeProfileId,
      capacityPolicyProfile,
      desiredWorkers,
      desiredComputeUnits,
      ttlHours,
      maxHourlyUsd,
      serverlessEndpointId,
      tasks,
      promptTokens,
      completionTokens,
      toolCalls,
      workflowWaitSeconds,
      sandboxCount,
      approvalEvidenceUrl,
      executionApproved,
      approvedBy,
      correlationId,
      workerOnly,
      workerDispatchEnabled,
      workerMaxSessions,
      workerAgent,
      workerModel,
      workerRunnerLabel,
      workerRunnerLabels,
      workerIssues,
    }) => {
      try {
        const workspaceName = resolveWorkspace(orgName);
        const workerDispatch = buildWorkerDispatch(objective, {
          mode,
          workerOnly,
          workerDispatchEnabled,
          workerMaxSessions,
          workerAgent,
          workerModel,
          workerRunnerLabel,
          workerRunnerLabels,
          workerIssues,
        });
        const workerDispatchEnabledForRun = Boolean(workerDispatch);
        const result = await apiClient.createSwarmRun({
          orgName: workspaceName,
          objective,
          questionnaire: {
            highLevelPrompt,
            successCriteria,
            constraints,
            approvalQuestion,
          },
          mode,
          provider,
          computeProfileId,
          capacityPolicyProfile,
          desiredWorkers,
          desiredComputeUnits,
          ttlHours,
          maxHourlyUsd,
          serverlessEndpointId,
          tasks,
          promptTokens,
          completionTokens,
          toolCalls,
          workflowWaitSeconds,
          sandboxCount: sandboxCount ?? workerDispatch?.maxSessions,
          approvalEvidenceUrl,
          executionApproval: {
            approved: executionApproved,
            approvalEvidenceUrl,
            approvedBy,
            question: approvalQuestion,
          },
          correlationId,
          ...(workerDispatchEnabledForRun
            ? { stratusPipeline: { enabled: false }, workerDispatch }
            : {}),
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return buildError("Error creating swarm run", error);
      }
    },
  );

  server.tool(
    "gal_swarm_list_runs",
    "List GAL Swarm runs for the active workspace. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.",
    {
      orgName: createWorkspaceParamSchema(),
    },
    async ({ orgName }) => {
      try {
        const workspaceName = resolveWorkspace(orgName);
        const result = await apiClient.listSwarmRuns(workspaceName);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return buildError("Error listing swarm runs", error);
      }
    },
  );

  server.tool(
    "gal_swarm_status",
    "Get GAL Swarm run status. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.",
    {
      orgName: createWorkspaceParamSchema(),
      runId: z.string().min(1).describe("Swarm run id."),
    },
    async ({ orgName, runId }) => {
      try {
        const workspaceName = resolveWorkspace(orgName);
        const result = await apiClient.getSwarmRun(workspaceName, runId);
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return buildError("Error getting swarm status", error);
      }
    },
  );

  server.tool(
    "gal_swarm_calibrate",
    "Attach observed execution actuals to a Swarm run and receive the updated calibration summary.",
    {
      orgName: createWorkspaceParamSchema(),
      runId: z.string().min(1).describe("Swarm run id."),
      durationSeconds: z.number().min(0).describe("Observed wall-clock duration in seconds."),
      promptTokens: z.number().int().min(0).describe("Observed prompt token count."),
      completionTokens: z.number().int().min(0).describe("Observed completion token count."),
      toolCalls: z.number().int().min(0).describe("Observed tool call count."),
      workflowWaitSeconds: z.number().min(0).describe("Observed CI/workflow wait time in seconds."),
      sandboxCount: z.number().int().min(0).describe("Observed sandbox count."),
      notes: z.string().optional().describe("Optional calibration notes."),
    },
    async ({ orgName, runId, ...actuals }) => {
      try {
        const workspaceName = resolveWorkspace(orgName);
        const result = await apiClient.calibrateSwarmRun({
          orgName: workspaceName,
          runId,
          ...actuals,
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return buildError("Error calibrating swarm run", error);
      }
    },
  );

  server.tool(
    "gal_swarm_observe_capacity",
    "Submit Swarm utilization/cost observations and receive the next capacity decision plus noop provider action plan. Use this for dry-run simulations and provider monitor feedback loops.",
    {
      orgName: createWorkspaceParamSchema(),
      runId: z.string().min(1).describe("Swarm run id."),
      activeWorkers: z.number().int().min(0).describe("Current self-hosted worker count."),
      queuedTokenSeconds: z.number().min(0).describe("Queued token-seconds waiting for capacity."),
      tokensPerSecond: z.number().min(0).describe("Observed token throughput."),
      latencyP95Ms: z.number().min(0).describe("Observed p95 latency in milliseconds."),
      gpuUtilizationPercent: z.number().min(0).max(100).describe("Observed GPU utilization percent."),
      memoryUtilizationPercent: z.number().min(0).max(100).describe("Observed GPU memory utilization percent."),
      activeTasks: z.number().int().min(0).describe("Active task count."),
      queuedTasks: z.number().int().min(0).describe("Queued task count."),
      errorRatePercent: z.number().min(0).max(100).describe("Provider/request error rate percent."),
      providerHealthy: z.boolean().describe("Whether the self-hosted provider health check is passing."),
      elapsedSeconds: z.number().min(0).describe("Elapsed seconds since burst start."),
      spendUsd: z.number().min(0).describe("Observed spend so far."),
      idleSeconds: z.number().min(0).describe("Seconds since last active work."),
      serverlessFallbackHealthy: z.boolean().describe("Whether serverless fallback health check is passing."),
    },
    async ({ orgName, runId, ...observation }) => {
      try {
        const workspaceName = resolveWorkspace(orgName);
        const result = await apiClient.observeSwarmCapacity({
          orgName: workspaceName,
          runId,
          ...observation,
        });
        return {
          content: [
            { type: "text" as const, text: JSON.stringify(result, null, 2) },
          ],
        };
      } catch (error) {
        return buildError("Error observing swarm capacity", error);
      }
    },
  );
}
