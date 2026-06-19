/**
 * GAL API Client
 *
 * HTTP client wrapping fetch calls to the GAL API for session management
 * and telemetry event logging.
 */

import {
  type GalSwarmCapacityPolicyProfile,
  type GalSwarmProvider,
  type GalSwarmRunMode,
  type GalSwarmSandboxProvider,
  type GalSwarmWorkerDispatchRequest,
} from "@gal-run/swarm";

export interface CreateSessionParams {
  agent: string;
  prompt: string;
  project_context?: string;
  orgId?: string;
  session_type?: "local" | "background" | "orchestrator";
}

export interface HeartbeatParams {
  status?: string;
  currentTask?: string;
}

export interface ClaimTaskParams {
  sessionId: string;
  issueNumber: number;
  repo: string;
}

export interface ReportProgressParams {
  currentTask: string;
  branch?: string;
  filesTouched?: string[];
  percentComplete?: number;
}

export interface SendDirectiveParams {
  targetSessionId: string;
  type:
    | "claim_task"
    | "stop"
    | "switch_branch"
    | "inject-context"
    | "change-approach"
    | "custom";
  payload: Record<string, unknown>;
  text?: string;
}

export interface ClaimBranchParams {
  repo: string;
  branch: string;
  sessionId?: string;
  issueNumber?: number;
}

export interface ReleaseBranchParams {
  repo: string;
  branch: string;
}

export interface DispatchAgentParams {
  agent: string;
  prompt: string;
  project_context?: string;
  session_type?: "background";
  model?: string;
  org?: string;
  runner_label?: string;
}

export interface ResumeSessionParams {
  session_id: string;
  prompt: string;
  dispatch_backend?: "stratus";
}

export interface ResumeSessionResponse {
  success: boolean;
  sessionId: string;
  workflowRunId: number;
  agentSessionId: string;
  message: string;
}

export interface ListWorkItemsParams {
  organizationId: string;
  status?: string;
  priority?: number;
  type?: string;
  limit?: number;
}

export interface ClaimWorkItemParams {
  workItemId: string;
  agentId: string;
}

export interface CompleteWorkItemParams {
  workItemId: string;
  agentId: string;
  message?: string;
  details?: Record<string, unknown>;
}

export interface FailWorkItemParams {
  workItemId: string;
  agentId: string;
  message: string;
  details?: Record<string, unknown>;
  retry?: boolean;
}

export interface EnqueueWorkItemsParams {
  owner: string;
  repo: string;
  issueNumbers: number[];
  org?: string;
  runnerLabel?: string;
}

export interface GitHubIssueContextParams {
  orgName: string;
  owner: string;
  repo: string;
  issueNumber: number;
}

export interface CreateGitHubIssueCommentParams
  extends GitHubIssueContextParams {
  body: string;
}

export interface GitHubPullRequestContextParams {
  orgName: string;
  owner: string;
  repo: string;
  prNumber: number;
}

export interface ReadMemoryParams {
  orgId: string;
  repoScope?: string;
  limit?: number;
  sessionId?: string;
}

export interface WriteMemoryParams {
  orgId: string;
  content: string;
  source?: "agent" | "developer" | "governance";
  sessionId?: string;
  repoScope?: string;
  tags?: string[];
}

export interface GetPeerActivityParams {
  orgId: string;
  repoScope?: string;
  limit?: number;
}

export interface DispatchRule {
  category: string;
  enabled: boolean;
  backend?: "stratus";
  agent?: string;
  note?: string;
}

export interface SetDispatchRulesPayload {
  rules: DispatchRule[];
  enabled?: boolean;
  customInstructions?: string;
  maxConcurrentAgents?: number;
  reservedForManual?: number;
  maxPendingQueueItems?: number;
  preferredProvider?: "claude" | "codex" | "gemini" | "gal-code";
  enabledCredentialOwners?: string[];
  preferredCredentialOwners?: string[];
  providerPools?: Array<{
    provider: "claude" | "codex" | "gemini" | "gal-code";
    maxConcurrent?: number;
    maxPending?: number;
  }>;
}

export interface SetQueueOrderParams {
  orgName: string;
  itemIds: string[];
}

export interface CreateSwarmRunParams {
  orgName: string;
  objective: string;
  questionnaire?: {
    highLevelPrompt?: string;
    successCriteria?: string[];
    constraints?: string[];
    approvalQuestion?: string;
  };
  mode?: GalSwarmRunMode;
  provider?: GalSwarmProvider;
  sandboxProvider?: GalSwarmSandboxProvider;
  computeProfileId?: string;
  capacityPolicyProfile?: GalSwarmCapacityPolicyProfile;
  desiredWorkers?: number;
  desiredComputeUnits?: number;
  ttlHours?: number;
  maxHourlyUsd?: number;
  serverlessEndpointId?: string;
  tasks?: number;
  promptTokens?: number;
  completionTokens?: number;
  toolCalls?: number;
  workflowWaitSeconds?: number;
  sandboxCount?: number;
  approvalEvidenceUrl?: string;
  executionApproval?: {
    approved?: boolean;
    approvalEvidenceUrl?: string;
    approvedBy?: string;
    approvedAt?: string;
    question?: string;
  };
  correlationId?: string;
  stratusPipeline?: {
    enabled?: boolean;
  };
  workerDispatch?: GalSwarmWorkerDispatchRequest;
}

export interface ObserveSwarmCapacityParams {
  orgName: string;
  runId: string;
  activeWorkers: number;
  queuedTokenSeconds: number;
  tokensPerSecond: number;
  latencyP95Ms: number;
  gpuUtilizationPercent: number;
  memoryUtilizationPercent: number;
  activeTasks: number;
  queuedTasks: number;
  errorRatePercent: number;
  providerHealthy: boolean;
  elapsedSeconds: number;
  spendUsd: number;
  idleSeconds: number;
  serverlessFallbackHealthy: boolean;
}

export interface CalibrateSwarmRunParams {
  orgName: string;
  runId: string;
  durationSeconds: number;
  promptTokens: number;
  completionTokens: number;
  toolCalls: number;
  workflowWaitSeconds: number;
  sandboxCount: number;
  notes?: string;
}

export interface TelemetryEvent {
  id: string;
  installationId: string;
  eventType: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export class GalApiClient {
  private ragBaseUrl: string;

  constructor(
    private baseUrl: string,
    private authToken: string,
  ) {
    this.ragBaseUrl =
      process.env.GAL_RAG_URL ?? "http://localhost:8090";
  }

  private async ragRequest(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${this.ragBaseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.authToken}`,
    };
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`gal-rag error ${response.status}: ${text}`);
    }
    return response.json();
  }

  async ragSearch(params: {
    orgId: string;
    query: string;
    embeddingConfig?: string;
    topK?: number;
    repoScopes?: string[];
    sourceTypes?: string[];
    tags?: string[];
    includeContent?: boolean;
  }): Promise<unknown> {
    return this.ragRequest("POST", "/rag/search", {
      query: params.query,
      embeddingConfig: params.embeddingConfig,
      topK: params.topK,
      includeContent: params.includeContent,
      filter: {
        orgId: params.orgId,
        ...(params.repoScopes?.length ? { repoScopes: params.repoScopes } : {}),
        ...(params.sourceTypes?.length ? { sourceTypes: params.sourceTypes } : {}),
        ...(params.tags?.length ? { tags: params.tags } : {}),
      },
    });
  }

  async ragGet(orgId: string, ids: string[]): Promise<unknown> {
    return this.ragRequest("POST", "/rag/get", { orgId, ids });
  }

  async ragGraph(params: {
    orgId: string;
    seedIds: string[];
    hops?: number;
    edgeKinds?: string[];
  }): Promise<unknown> {
    return this.ragRequest("POST", "/rag/graph", {
      orgId: params.orgId,
      seedIds: params.seedIds,
      hops: params.hops ?? 1,
      edgeKinds: params.edgeKinds ?? ["imports", "calls", "references"],
    });
  }

  async ragEvaluate(params: {
    query: string;
    resultIds: string[];
    criteria?: string[];
  }): Promise<unknown> {
    return this.ragRequest("POST", "/rag/evaluate", {
      query: params.query,
      resultIds: params.resultIds,
      criteria: params.criteria,
    });
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.authToken}`,
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GAL API error ${response.status}: ${text}`);
    }

    return response.json();
  }

  // Auth endpoints
  async getMe(): Promise<any> {
    return this.request("GET", "/auth/me");
  }

  // Session endpoints
  async createSession(data: CreateSessionParams): Promise<unknown> {
    // Map MCP snake_case params to API camelCase field names
    return this.request("POST", "/api/sessions", {
      agent: data.agent,
      initialPrompt: data.prompt,
      projectContext: data.project_context,
      orgId: data.orgId,
      session_type: data.session_type,
    });
  }

  async listSessions(orgId?: string): Promise<unknown> {
    //: Use 'org' param to match the GET /api/sessions endpoint contract
    const params = orgId ? `?org=${encodeURIComponent(orgId)}` : "";
    return this.request("GET", `/api/sessions${params}`);
  }

  async heartbeat(sessionId: string, data?: HeartbeatParams): Promise<unknown> {
    return this.request("POST", `/api/sessions/${sessionId}/heartbeat`, data);
  }

  // Task claiming
  async claimTask(data: ClaimTaskParams): Promise<unknown> {
    return this.request("POST", `/api/tasks/${data.issueNumber}/claim`, data);
  }

  // Progress reporting
  async reportProgress(
    sessionId: string,
    data: ReportProgressParams,
  ): Promise<unknown> {
    return this.request("POST", `/api/sessions/${sessionId}/progress`, data);
  }

  // Directives
  async sendDirective(
    sessionId: string,
    data: SendDirectiveParams,
  ): Promise<unknown> {
    const body: Record<string, unknown> = {
      targetSessionId: data.targetSessionId,
      type: data.type,
      payload: data.payload,
    };
    if (data.text) body.text = data.text;
    return this.request("POST", `/api/sessions/${sessionId}/directive`, body);
  }

  async getDirectives(sessionId: string): Promise<unknown> {
    return this.request("GET", `/api/sessions/${sessionId}/directives`);
  }

  // Branch claiming
  async claimBranch(data: ClaimBranchParams): Promise<unknown> {
    return this.request("POST", "/api/sessions/branches/claim", data);
  }

  async releaseBranch(data: ReleaseBranchParams): Promise<unknown> {
    return this.request("DELETE", "/api/sessions/branches/claim", data);
  }

  // Dispatch agent (wraps existing POST /api/sessions)
  async dispatchAgent(data: DispatchAgentParams): Promise<unknown> {
    // Extract org from project_context (e.g. "org/repo" → "org")
    // so the server's multi-org access check uses the correct org instead of organizations[0].
    const orgFromContext = data.project_context?.includes("/")
      ? data.project_context.split("/")[0]
      : undefined;
    return this.request("POST", "/api/sessions", {
      agent: data.agent,
      initialPrompt: data.prompt,
      projectContext: data.project_context,
      session_type: data.session_type ?? "background",
      ...(orgFromContext ? { org: orgFromContext } : {}),
      ...(data.model ? { model: data.model } : {}),
      ...(data.org ? { org: data.org } : {}),
      ...(data.runner_label ? { runnerLabel: data.runner_label } : {}),
    });
  }

  async resumeSession(
    data: ResumeSessionParams,
  ): Promise<ResumeSessionResponse> {
    const body: Record<string, unknown> = { prompt: data.prompt };
    if (data.dispatch_backend) body.dispatchBackend = data.dispatch_backend;
    return this.request(
      "POST",
      `/api/sessions/${encodeURIComponent(data.session_id)}/resume`,
      body,
    ) as Promise<ResumeSessionResponse>;
  }

  // Telemetry endpoint
  async logEvents(events: TelemetryEvent[]): Promise<unknown> {
    return this.request("POST", "/telemetry/events", { events });
  }

  // Work item endpoints
  async listWorkItems(params: ListWorkItemsParams): Promise<unknown> {
    const queryParams = new URLSearchParams();
    queryParams.append("org", params.organizationId);
    if (params.status) queryParams.append("status", params.status);
    if (params.priority !== undefined)
      queryParams.append("priority", String(params.priority));
    if (params.type) queryParams.append("type", params.type);
    if (params.limit) queryParams.append("limit", String(params.limit));

    return this.request("GET", `/api/work-items?${queryParams.toString()}`);
  }

  async claimWorkItem(params: ClaimWorkItemParams): Promise<unknown> {
    return this.request("POST", `/api/work-items/${params.workItemId}/claim`, {
      agentId: params.agentId,
    });
  }

  async completeWorkItem(params: CompleteWorkItemParams): Promise<unknown> {
    return this.request(
      "POST",
      `/api/work-items/${params.workItemId}/complete`,
      {
        agentId: params.agentId,
        message: params.message,
        details: params.details,
      },
    );
  }

  async failWorkItem(params: FailWorkItemParams): Promise<unknown> {
    return this.request("POST", `/api/work-items/${params.workItemId}/fail`, {
      agentId: params.agentId,
      message: params.message,
      details: params.details,
      retry: params.retry,
    });
  }

  // Enqueue work items (GitHub issues → work queue)
  async enqueueWorkItems(params: EnqueueWorkItemsParams): Promise<unknown> {
    const queryOrg = params.org ? `?org=${encodeURIComponent(params.org)}` : "";
    return this.request("POST", `/api/work-prioritizer/enqueue${queryOrg}`, {
      owner: params.owner,
      repo: params.repo,
      issueNumbers: params.issueNumbers,
      ...(params.runnerLabel ? { runnerLabel: params.runnerLabel } : {}),
    });
  }

  async getGitHubIssueContext(
    params: GitHubIssueContextParams,
  ): Promise<unknown> {
    return this.request(
      "GET",
      `/organizations/${encodeURIComponent(params.orgName)}/github/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/issues/${params.issueNumber}/context`,
    );
  }

  async createGitHubIssueComment(
    params: CreateGitHubIssueCommentParams,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/organizations/${encodeURIComponent(params.orgName)}/github/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/issues/${params.issueNumber}/comments`,
      {
        body: params.body,
      },
    );
  }

  async getGitHubPullRequestContext(
    params: GitHubPullRequestContextParams,
  ): Promise<unknown> {
    return this.request(
      "GET",
      `/organizations/${encodeURIComponent(params.orgName)}/github/repos/${encodeURIComponent(params.owner)}/${encodeURIComponent(params.repo)}/pulls/${params.prNumber}/context`,
    );
  }

  // Dispatch rules endpoints
  async getDispatchRules(orgName: string): Promise<unknown> {
    return this.request(
      "GET",
      `/organizations/${encodeURIComponent(orgName)}/dispatch-rules`,
    );
  }

  async setDispatchRules(
    orgName: string,
    payload: SetDispatchRulesPayload,
  ): Promise<unknown> {
    return this.request(
      "PUT",
      `/organizations/${encodeURIComponent(orgName)}/dispatch-rules`,
      payload,
    );
  }

  async setQueueOrder(params: SetQueueOrderParams): Promise<unknown> {
    const query = `?org=${encodeURIComponent(params.orgName)}`;
    return this.request("PUT", `/api/queue/order${query}`, {
      order: params.itemIds,
    });
  }

  // Swarm planning and execution gateway
  async createSwarmRun(params: CreateSwarmRunParams): Promise<unknown> {
    const workerFanoutSessions = params.workerDispatch
      ? Math.max(params.workerDispatch.maxSessions ?? 0, params.workerDispatch.issues.length)
      : 0;
    const desiredWorkers = params.desiredWorkers ?? (workerFanoutSessions > 0 ? workerFanoutSessions : 1);
    const sandboxCount = params.sandboxCount ?? (workerFanoutSessions > 0 ? workerFanoutSessions : 1);
    const provider = params.provider ?? (workerFanoutSessions > 0 ? "stratus" : "gcp");
    const computeProfileId = params.computeProfileId ?? (workerFanoutSessions > 0 ? "deepseek-v4-pro" : "gcp-l4-1x-qwen-smoke");
    return this.request(
      "POST",
      `/api/swarm/${encodeURIComponent(params.orgName)}/runs`,
      {
        orgName: params.orgName,
        objective: params.objective,
        questionnaire: params.questionnaire,
        source: "gal-mcp",
        mode: params.mode ?? "dry-run",
        approvalEvidenceUrl: params.approvalEvidenceUrl,
        executionApproval: params.executionApproval,
        correlationId: params.correlationId,
        target: {
          provider,
          sandboxProvider: params.sandboxProvider ?? "stratus",
          computeProfileId,
          capacityPolicyProfile: params.capacityPolicyProfile,
          desiredWorkers,
          desiredComputeUnits: params.desiredComputeUnits ?? 1,
          ttlHours: params.ttlHours ?? 0.25,
          maxHourlyUsd: params.maxHourlyUsd ?? 5,
          serverlessEndpointId: params.serverlessEndpointId ?? "deepseek-v4-pro",
        },
        workload: {
          tasks: params.tasks ?? 1,
          promptTokens: params.promptTokens ?? 0,
          completionTokens: params.completionTokens ?? 0,
          toolCalls: params.toolCalls ?? 0,
          workflowWaitSeconds: params.workflowWaitSeconds ?? 0,
          sandboxCount,
        },
        ...(params.stratusPipeline
          ? { stratusPipeline: params.stratusPipeline }
          : {}),
        ...(params.workerDispatch
          ? {
              workerDispatch: {
                enabled: params.workerDispatch.enabled,
                maxSessions: params.workerDispatch.maxSessions,
                projectContext: params.workerDispatch.projectContext,
                branch: params.workerDispatch.branch,
                agent: params.workerDispatch.agent,
                model: params.workerDispatch.model,
                runnerLabel: params.workerDispatch.runnerLabel,
                runnerLabels: params.workerDispatch.runnerLabels,
                dispatchBackend:
                  params.workerDispatch.dispatchBackend ?? "stratus",
                issues: params.workerDispatch.issues,
              },
            }
          : {}),
      },
    );
  }

  async getSwarmRun(orgName: string, runId: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/swarm/${encodeURIComponent(orgName)}/runs/${encodeURIComponent(runId)}`,
    );
  }

  async listSwarmRuns(orgName: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/swarm/${encodeURIComponent(orgName)}/runs`,
    );
  }

  async calibrateSwarmRun(params: CalibrateSwarmRunParams): Promise<unknown> {
    const { orgName, runId, ...actuals } = params;
    return this.request(
      "PATCH",
      `/api/swarm/${encodeURIComponent(orgName)}/runs/${encodeURIComponent(runId)}/actuals`,
      actuals,
    );
  }

  async observeSwarmCapacity(params: ObserveSwarmCapacityParams): Promise<unknown> {
    const { orgName, runId, ...observation } = params;
    return this.request(
      "PATCH",
      `/api/swarm/${encodeURIComponent(orgName)}/runs/${encodeURIComponent(runId)}/capacity`,
      observation,
    );
  }

  // =========================================================================
  // Organizations & Discovery
  // =========================================================================

  async listWorkspaces(): Promise<unknown> {
    return this.request("GET", "/organizations");
  }

  async listOrganizations(): Promise<unknown> {
    return this.listWorkspaces();
  }

  async syncWorkspace(orgName: string): Promise<unknown> {
    return this.request("POST", `/organizations/quick-sync`);
  }

  async syncOrganization(orgName: string): Promise<unknown> {
    return this.syncWorkspace(orgName);
  }

  async getDiscoveredConfigs(
    orgName: string,
    opts?: { type?: string },
  ): Promise<unknown> {
    const params = opts?.type ? `?type=${encodeURIComponent(opts.type)}` : "";
    return this.request(
      "GET",
      `/organizations/${encodeURIComponent(orgName)}/discovered-configs${params}`,
    );
  }

  async getConfigContent(
    orgName: string,
    repo: string,
    path: string,
  ): Promise<unknown> {
    const params = new URLSearchParams({ repo, path });
    return this.request(
      "GET",
      `/organizations/${encodeURIComponent(orgName)}/config-content?${params.toString()}`,
    );
  }

  async pickConfigByAi(
    orgName: string,
    data: {
      configName: string;
      configType: string;
      instances: Array<{
        repo: string;
        path: string;
        content: string;
        commitDate?: string;
        commitCount30d?: number;
      }>;
      intention?: string;
    },
  ): Promise<{
    selectedRepo: string;
    selectedPath: string;
    selectedContent: string;
    reasoning: string;
    confidence: number;
    modelInfo: { name: string; provider: string };
  }> {
    return this.request(
      "POST",
      `/organizations/${encodeURIComponent(orgName)}/discovery/pick-by-ai`,
      data,
    ) as Promise<{
      selectedRepo: string;
      selectedPath: string;
      selectedContent: string;
      reasoning: string;
      confidence: number;
      modelInfo: { name: string; provider: string };
    }>;
  }

  // =========================================================================
  // Approved Config Management
  // =========================================================================

  async getApprovedConfig(orgName: string, platform: string): Promise<unknown> {
    return this.request(
      "GET",
      `/organizations/${encodeURIComponent(orgName)}/approved-config?platform=${encodeURIComponent(platform)}`,
    );
  }

  async setApprovedConfig(
    orgName: string,
    platform: string,
    config: unknown,
  ): Promise<unknown> {
    return this.request(
      "PUT",
      `/organizations/${encodeURIComponent(orgName)}/approved-config`,
      { ...(config as object), platform },
    );
  }

  // =========================================================================
  // Config Governance (Proposals, Versions, Tracked Repos)
  // =========================================================================

  async listProposals(orgName: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/orgs/${encodeURIComponent(orgName)}/proposals`,
    );
  }

  async createProposal(
    orgName: string,
    data: { title: string; description?: string; changes: unknown },
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/orgs/${encodeURIComponent(orgName)}/proposals`,
      data,
    );
  }

  async reviewProposal(
    proposalId: string,
    data: { action: "approve" | "reject"; comment?: string },
  ): Promise<unknown> {
    return this.request(
      "PATCH",
      `/api/proposals/${encodeURIComponent(proposalId)}`,
      data,
    );
  }

  async listConfigVersions(orgName: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/orgs/${encodeURIComponent(orgName)}/config/versions`,
    );
  }

  async rollbackConfig(orgName: string, versionId: string): Promise<unknown> {
    return this.request(
      "POST",
      `/api/orgs/${encodeURIComponent(orgName)}/config/rollback`,
      { versionId },
    );
  }

  async listTrackedRepos(orgName: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/orgs/${encodeURIComponent(orgName)}/repos`,
    );
  }

  async addTrackedRepo(
    orgName: string,
    data: { repo?: string; repoName?: string; platform?: string },
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/orgs/${encodeURIComponent(orgName)}/repos`,
      {
        repoName: data.repoName ?? data.repo,
        platform: data.platform,
      },
    );
  }

  async removeTrackedRepo(orgName: string, repo: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `/api/orgs/${encodeURIComponent(orgName)}/repos/${encodeURIComponent(repo)}`,
    );
  }

  // =========================================================================
  // Team Management
  // =========================================================================

  async listTeamMembers(orgName: string): Promise<unknown> {
    return this.request(
      "GET",
      `/organizations/${encodeURIComponent(orgName)}/team`,
    );
  }

  async setTeamRole(
    orgName: string,
    githubId: string,
    role: string,
  ): Promise<unknown> {
    return this.request(
      "PUT",
      `/organizations/${encodeURIComponent(orgName)}/team/members/${encodeURIComponent(githubId)}/role`,
      { role },
    );
  }

  async syncTeam(orgName: string): Promise<unknown> {
    return this.request(
      "POST",
      `/organizations/${encodeURIComponent(orgName)}/team/sync`,
    );
  }

  // =========================================================================
  // Compliance
  // =========================================================================

  async scanCompliance(orgName: string): Promise<unknown> {
    return this.request(
      "POST",
      `/organizations/${encodeURIComponent(orgName)}/compliance/scan`,
    );
  }

  async getComplianceResults(
    orgName: string,
    opts?: { scanId?: string; limit?: number; offset?: number },
  ): Promise<unknown> {
    const qs = new URLSearchParams();
    if (opts?.scanId) qs.append("scanId", opts.scanId);
    if (opts?.limit !== undefined) qs.append("limit", String(opts.limit));
    if (opts?.offset !== undefined) qs.append("offset", String(opts.offset));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(
      "GET",
      `/organizations/${encodeURIComponent(orgName)}/compliance${query}`,
    );
  }

  // =========================================================================
  // Shared Memory Pool
  // =========================================================================

  async searchMemory(params: ReadMemoryParams): Promise<unknown> {
    const query = new URLSearchParams();
    if (params.repoScope) query.append("repoScope", params.repoScope);
    if (params.limit !== undefined) query.append("limit", String(params.limit));
    if (params.sessionId) query.append("sessionId", params.sessionId);
    const queryString = query.toString();
    return this.request(
      "GET",
      `/api/orgs/${encodeURIComponent(params.orgId)}/memory/search${queryString ? `?${queryString}` : ""}`,
    );
  }

  async getMemoryByIds(
    orgId: string,
    entryIds: string[],
  ): Promise<unknown[]> {
    const results = await Promise.allSettled(
      entryIds.map((entryId) =>
        this.request(
          "GET",
          `/api/orgs/${encodeURIComponent(orgId)}/memory/${encodeURIComponent(entryId)}`,
        ).then((r) => (r as { entry: unknown }).entry ?? r),
      ),
    );
    return results
      .filter((r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled")
      .map((r) => r.value);
  }

  async readMemory(params: ReadMemoryParams): Promise<unknown> {
    const query = new URLSearchParams();
    if (params.repoScope) query.append("repoScope", params.repoScope);
    if (params.limit !== undefined) query.append("limit", String(params.limit));
    if (params.sessionId) query.append("sessionId", params.sessionId);
    const queryString = query.toString();
    return this.request(
      "GET",
      `/api/orgs/${encodeURIComponent(params.orgId)}/memory${queryString ? `?${queryString}` : ""}`,
    );
  }

  async writeMemory(params: WriteMemoryParams): Promise<unknown> {
    return this.request(
      "POST",
      `/api/orgs/${encodeURIComponent(params.orgId)}/memory`,
      {
        content: params.content,
        ...(params.source ? { source: params.source } : {}),
        ...(params.sessionId ? { sessionId: params.sessionId } : {}),
        ...(params.repoScope ? { repoScope: params.repoScope } : {}),
        ...(params.tags ? { tags: params.tags } : {}),
      },
    );
  }

  async getPeerActivity(params: GetPeerActivityParams): Promise<unknown> {
    const query = new URLSearchParams();
    if (params.repoScope) query.append("repoScope", params.repoScope);
    if (params.limit !== undefined) query.append("limit", String(params.limit));
    const queryString = query.toString();
    return this.request(
      "GET",
      `/api/orgs/${encodeURIComponent(params.orgId)}/peer-activity${queryString ? `?${queryString}` : ""}`,
    );
  }

  // =========================================================================
  // Audit Logs
  // =========================================================================

  /**
   * Query audit logs for an org with optional filters.
   */
  async queryAuditLogs(
    orgName: string,
    params?: {
      action?: string;
      severity?: string;
      userId?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.action) qs.append("action", params.action);
    if (params?.severity) qs.append("severity", params.severity);
    if (params?.userId) qs.append("userId", params.userId);
    if (params?.startDate) qs.append("startDate", params.startDate);
    if (params?.endDate) qs.append("endDate", params.endDate);
    if (params?.limit !== undefined) qs.append("limit", String(params.limit));
    if (params?.offset !== undefined)
      qs.append("offset", String(params.offset));
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(
      "GET",
      `/organizations/${encodeURIComponent(orgName)}/audit/logs${query}`,
    );
  }

  /**
   * Get compliance status for an org.
   */
  async getComplianceStatus(orgName: string): Promise<unknown> {
    return this.request(
      "GET",
      `/organizations/${encodeURIComponent(orgName)}/compliance`,
    );
  }

  /**
   * Get audit summary stats for an org.
   */
  async getAuditSummary(
    orgName: string,
    params?: { startDate?: string; endDate?: string },
  ): Promise<unknown> {
    const qs = new URLSearchParams();
    if (params?.startDate) qs.append("startDate", params.startDate);
    if (params?.endDate) qs.append("endDate", params.endDate);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(
      "GET",
      `/organizations/${encodeURIComponent(orgName)}/audit/summary${query}`,
    );
  }

  // =========================================================================
  // Dispatch Health
  // =========================================================================

  /**
   * Check availability of all dispatch backends (GHA + Hive).
   * Maps to GET /api/dispatch/health.
   */
  async getDispatchHealth(): Promise<unknown> {
    return this.request("GET", "/api/dispatch/health");
  }

  // =========================================================================
  // Credential Validation
  // =========================================================================

  /**
   * Validate a credential for dispatch readiness.
   * Calls POST /api/credentials/validate-for-dispatch.
   *
   * Returns { ready, provider, method, issues, suggestions }.
   * Does NOT throw on validation failures — callers inspect `ready`.
   */
  async validateCredentialForDispatch(provider: string): Promise<{
    ready: boolean;
    provider: string;
    method?: string;
    issues: string[];
    suggestions: string[];
  }> {
    return this.request("POST", "/api/credentials/validate-for-dispatch", {
      provider,
    }) as Promise<{
      ready: boolean;
      provider: string;
      method?: string;
      issues: string[];
      suggestions: string[];
    }>;
  }

  // =========================================================================
  // Governance Overrides
  // =========================================================================

  async reportGovernanceOverride(data: {
    processType: string;
    organizationId: string;
    userId: string;
    originalInput: Record<string, unknown>;
    originalOutput: Record<string, unknown>;
    correctedOutput: Record<string, unknown>;
    overrideReason?: string;
    systemPromptVersion?: string;
  }): Promise<unknown> {
    return this.request("POST", "/api/governance/overrides", data);
  }

  // =========================================================================
  // SDLC
  // =========================================================================

  async getSdlcStatus(issueNumber: number): Promise<unknown> {
    return this.request("GET", `/api/sdlc/${issueNumber}/status`);
  }

  // =========================================================================
  // Session Output (Firebase RTDB)
  // =========================================================================

  /**
   * Fetch recent output entries for a session from Firebase RTDB.
   * The RTDB path `sessions/<sessionId>/output` is publicly readable.
   *
   * @param sessionId - The session ID to fetch output for
   * @param lastN - Number of most-recent entries to return (default: 20)
   * @returns Record of output entries keyed by RTDB push-key
   */
  async getSessionOutput(
    sessionId: string,
    lastN: number = 20,
  ): Promise<Record<string, unknown> | null> {
    try {
      const result = (await this.request(
        "GET",
        `/api/sessions/${encodeURIComponent(sessionId)}/output?lastN=${lastN}`,
      )) as { output: Record<string, unknown> | null };
      return result.output;
    } catch {
      return null;
    }
  }

  /**
   * Fetch session metadata via the GAL API (no longer calls RTDB REST directly).
   * Returns status, logsTruncated, errorMessage, branchName, estimatedCost, etc.
   * Used by gal_get_session_output to surface diagnostic context alongside output.
   */
  async getSessionMetadata(
    sessionId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      const result = (await this.request(
        "GET",
        `/api/sessions/${encodeURIComponent(sessionId)}/rtdb-metadata`,
      )) as { metadata: Record<string, unknown> | null };
      return result.metadata;
    } catch {
      return null;
    }
  }

  /**
   * Returns the SSE stream URL for real-time session output.
   * Clients connect with an EventSource or fetch() to receive output,
   * status_change, heartbeat, and done events.
   */
  getSessionStreamUrl(sessionId: string): string {
    return `${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/stream`;
  }

  // =========================================================================
  // Policy Agent Service
  // =========================================================================

  async createPolicy(
    orgName: string,
    data: {
      name: string;
      description: string;
      type: "distribution-first" | "security" | "custom";
      rationale: string;
      rules: Array<{
        id: string;
        name: string;
        description?: string;
        condition: {
          type:
            | "work_type"
            | "repo_pattern"
            | "label"
            | "issue_title"
            | "custom";
          operator: "equals" | "contains" | "matches" | "in" | "not_in";
          value: string | string[];
        };
        action: "allow" | "warn" | "block";
        message: string;
        severity?: "info" | "warning" | "error";
        evidenceRequired?: string[];
      }>;
      enforcement: {
        enabled: boolean;
        mode: "off" | "warn" | "block";
        scope: "org" | "repo";
        repoScope?: string[];
      };
    },
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/orgs/${encodeURIComponent(orgName)}/policies`,
      data,
    );
  }

  async listPolicies(
    orgName: string,
    opts?: {
      status?: "draft" | "pending" | "approved" | "rejected" | "deprecated";
      type?: "distribution-first" | "security" | "custom";
    },
  ): Promise<unknown> {
    const qs = new URLSearchParams();
    if (opts?.status) qs.append("status", opts.status);
    if (opts?.type) qs.append("type", opts.type);
    const query = qs.toString() ? `?${qs.toString()}` : "";
    return this.request(
      "GET",
      `/api/orgs/${encodeURIComponent(orgName)}/policies${query}`,
    );
  }

  async getPolicy(orgName: string, policyId: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/policies/${encodeURIComponent(policyId)}?orgName=${encodeURIComponent(orgName)}`,
    );
  }

  async reviewPolicy(
    orgName: string,
    policyId: string,
    data: {
      action: "approve" | "reject";
      comment?: string;
    },
  ): Promise<unknown> {
    return this.request(
      "PATCH",
      `/api/policies/${encodeURIComponent(policyId)}/review?orgName=${encodeURIComponent(orgName)}`,
      data,
    );
  }

  async updatePolicyEnforcement(
    orgName: string,
    policyId: string,
    data: {
      enabled?: boolean;
      mode?: "off" | "warn" | "block";
      scope?: "org" | "repo";
      repoScope?: string[];
    },
  ): Promise<unknown> {
    return this.request(
      "PATCH",
      `/api/policies/${encodeURIComponent(policyId)}/enforcement?orgName=${encodeURIComponent(orgName)}`,
      data,
    );
  }

  async checkOrgPolicy(
    orgName: string,
    context: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/orgs/${encodeURIComponent(orgName)}/policies/check`,
      { context },
    );
  }

  async checkSpecificPolicy(
    orgName: string,
    policyId: string,
    context: Record<string, unknown>,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/policies/${encodeURIComponent(policyId)}/check?orgName=${encodeURIComponent(orgName)}`,
      { context },
    );
  }
}
