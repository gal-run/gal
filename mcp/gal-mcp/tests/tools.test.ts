import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GalApiClient } from "../src/api-client.js";

// Capture tool handlers registered via server.tool()
const toolHandlers = new Map<string, Function>();

const mockServer = {
  tool: vi.fn((...args: unknown[]) => {
    const name = args[0] as string;
    // server.tool() can be called with 3 args (name, desc, handler) or 4 args (name, desc, schema, handler)
    const handler = (args.length === 3 ? args[2] : args[3]) as Function;
    toolHandlers.set(name, handler);
  }),
};

// Mock the api client
const mockApiClient = {
  createSession: vi.fn(),
  listWorkspaces: vi.fn(),
  listOrganizations: vi.fn(),
  syncWorkspace: vi.fn(),
  syncOrganization: vi.fn(),
  getDiscoveredConfigs: vi.fn(),
  listSessions: vi.fn(),
  heartbeat: vi.fn(),
  logEvents: vi.fn(),
  claimTask: vi.fn(),
  reportProgress: vi.fn(),
  sendDirective: vi.fn(),
  getDirectives: vi.fn(),
  dispatchAgent: vi.fn(),
  resumeSession: vi.fn(),
  getDispatchRules: vi.fn(),
  setDispatchRules: vi.fn(),
  claimBranch: vi.fn(),
  getSessionOutput: vi.fn(),
  getSessionMetadata: vi.fn(),
  enqueueWorkItems: vi.fn(),
  setQueueOrder: vi.fn(),
  getGitHubIssueContext: vi.fn(),
  createGitHubIssueComment: vi.fn(),
  getGitHubPullRequestContext: vi.fn(),
  createSwarmRun: vi.fn(),
  listSwarmRuns: vi.fn(),
  getSwarmRun: vi.fn(),
  calibrateSwarmRun: vi.fn(),
  observeSwarmCapacity: vi.fn(),
  pickConfigByAi: vi.fn(),
  reportGovernanceOverride: vi.fn(),
  readMemory: vi.fn(),
  writeMemory: vi.fn(),
  getPeerActivity: vi.fn(),
} as unknown as GalApiClient;

// We need a fresh module import for each test suite to reset module-level state
// (storedSessionId, installationId). Use dynamic import with cache busting.
async function loadAndRegister() {
  // Clear any previous registrations
  toolHandlers.clear();
  mockServer.tool.mockClear();

  // Reset module to clear storedSessionId / installationId
  // We use vi.resetModules + dynamic import to get a fresh module each time
  vi.resetModules();

  const { registerTools } = await import("../src/tools.js");
  registerTools(mockServer as any, mockApiClient, { internalOnly: true });
}

describe("registerTools", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadAndRegister();
  });

  it("registers agent coordination tools when internalOnly is enabled", () => {
    expect(mockServer.tool).toHaveBeenCalledTimes(76); // +4: gal_rag_search/get/graph/evaluate
    expect(toolHandlers.has("gal_list_workspaces")).toBe(true);
    expect(toolHandlers.has("gal_set_active_workspace")).toBe(true);
    expect(toolHandlers.has("gal_get_active_workspace")).toBe(true);
    expect(toolHandlers.has("gal_sync_workspace")).toBe(true);
    expect(toolHandlers.has("gal_register_session")).toBe(true);
    expect(toolHandlers.has("gal_heartbeat")).toBe(true);
    expect(toolHandlers.has("gal_list_sessions")).toBe(true);
    expect(toolHandlers.has("gal_log_event")).toBe(true);
    expect(toolHandlers.has("gal_claim_task")).toBe(true);
    expect(toolHandlers.has("gal_report_progress")).toBe(true);
    expect(toolHandlers.has("gal_send_directive")).toBe(true);
    expect(toolHandlers.has("gal_get_directives")).toBe(true);
    expect(toolHandlers.has("gal_claim_branch")).toBe(true);
    expect(toolHandlers.has("gal_dispatch_agent")).toBe(true);
    expect(toolHandlers.has("gal_resume_session")).toBe(true);
    expect(toolHandlers.has("gal_list_work_items")).toBe(true);
    expect(toolHandlers.has("gal_claim_work_item")).toBe(true);
    expect(toolHandlers.has("gal_complete_work_item")).toBe(true);
    expect(toolHandlers.has("gal_fail_work_item")).toBe(true);
    expect(toolHandlers.has("gal_enqueue_work_items")).toBe(true);
    expect(toolHandlers.has("gal_get_github_issue_context")).toBe(true);
    expect(toolHandlers.has("gal_get_github_pr_context")).toBe(true);
    expect(toolHandlers.has("gal_create_github_issue_comment")).toBe(true);
    expect(toolHandlers.has("gal_set_queue_order")).toBe(true);
    expect(toolHandlers.has("gal_get_dispatch_rules")).toBe(true);
    expect(toolHandlers.has("gal_set_dispatch_rules")).toBe(true);
    expect(toolHandlers.has("gal_pick_config_by_ai")).toBe(true);
    expect(toolHandlers.has("gal_detect_processes")).toBe(true);
    expect(toolHandlers.has("gal_read_memory")).toBe(true);
    expect(toolHandlers.has("gal_memory_search")).toBe(true);
    expect(toolHandlers.has("gal_memory_get")).toBe(true);
    expect(toolHandlers.has("gal_write_memory")).toBe(true);
    expect(toolHandlers.has("gal_get_peer_activity")).toBe(true);
    expect(toolHandlers.has("gal_swarm_run")).toBe(true);
    expect(toolHandlers.has("gal_swarm_list_runs")).toBe(true);
    expect(toolHandlers.has("gal_swarm_status")).toBe(true);
    expect(toolHandlers.has("gal_swarm_calibrate")).toBe(true);
    expect(toolHandlers.has("gal_rag_search")).toBe(true);
    expect(toolHandlers.has("gal_rag_get")).toBe(true);
    expect(toolHandlers.has("gal_rag_graph")).toBe(true);
    expect(toolHandlers.has("gal_rag_evaluate")).toBe(true);
  });

  it("does NOT register agent coordination tools when internalOnly is disabled (#4065)", async () => {
    // Clear and re-register with internalOnly: false
    toolHandlers.clear();
    mockServer.tool.mockClear();
    vi.resetModules();

    const { registerTools: registerToolsFresh } =
      await import("../src/tools.js");
    registerToolsFresh(mockServer as any, mockApiClient, {
      internalOnly: false,
    });

    // Governance tools should be registered
    expect(toolHandlers.has("gal_list_workspaces")).toBe(true);
    expect(toolHandlers.has("gal_sync_workspace")).toBe(true);
    expect(toolHandlers.has("gal_get_discovered_configs")).toBe(true);
    expect(toolHandlers.has("gal_read_memory")).toBe(true);
    expect(toolHandlers.has("gal_memory_search")).toBe(true);
    expect(toolHandlers.has("gal_memory_get")).toBe(true);
    expect(toolHandlers.has("gal_write_memory")).toBe(true);
    expect(toolHandlers.has("gal_get_peer_activity")).toBe(true);

    // Agent coordination tools should NOT be registered
    expect(toolHandlers.has("gal_register_session")).toBe(false);
    expect(toolHandlers.has("gal_heartbeat")).toBe(false);
    expect(toolHandlers.has("gal_list_sessions")).toBe(false);
    expect(toolHandlers.has("gal_dispatch_agent")).toBe(false);
    expect(toolHandlers.has("gal_claim_task")).toBe(false);
    expect(toolHandlers.has("gal_resume_session")).toBe(false);
    expect(toolHandlers.has("gal_list_work_items")).toBe(false);
    expect(toolHandlers.has("gal_swarm_run")).toBe(false);
    expect(toolHandlers.has("gal_swarm_status")).toBe(false);
  });

  it("can register swarm tools without session coordination tools", async () => {
    toolHandlers.clear();
    mockServer.tool.mockClear();
    vi.resetModules();

    const { registerTools: registerToolsFresh } =
      await import("../src/tools.js");
    registerToolsFresh(mockServer as any, mockApiClient, {
      internalOnly: false,
      swarmOnly: true,
    });

    expect(toolHandlers.has("gal_register_session")).toBe(false);
    expect(toolHandlers.has("gal_dispatch_agent")).toBe(false);
    expect(toolHandlers.has("gal_swarm_run")).toBe(true);
    expect(toolHandlers.has("gal_swarm_list_runs")).toBe(true);
    expect(toolHandlers.has("gal_swarm_status")).toBe(true);
    expect(toolHandlers.has("gal_swarm_calibrate")).toBe(true);
    expect(toolHandlers.has("gal_swarm_observe_capacity")).toBe(true);
  });

  describe("workspace context tools", () => {
    it("returns workspaces under the workspaces key for gal_list_workspaces", async () => {
      (
        mockApiClient.listWorkspaces as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        organizations: [{ name: "acme-corp" }],
      });

      const handler = toolHandlers.get("gal_list_workspaces")!;
      const result = await handler({});

      expect(mockApiClient.listWorkspaces).toHaveBeenCalledOnce();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.workspaces).toEqual([{ name: "acme-corp" }]);
      expect(parsed.organizations).toEqual([{ name: "acme-corp" }]);
    });

    it("stores and returns the active workspace", async () => {
      const setHandler = toolHandlers.get("gal_set_active_workspace")!;
      const getHandler = toolHandlers.get("gal_get_active_workspace")!;

      let result = await getHandler({});
      expect(JSON.parse(result.content[0].text)).toEqual({
        activeWorkspace: null,
      });

      await setHandler({ workspaceName: "devops-dynamics" });
      result = await getHandler({});

      expect(JSON.parse(result.content[0].text)).toEqual({
        activeWorkspace: "devops-dynamics",
      });
    });

    it("uses the active workspace when orgName is omitted", async () => {
      (
        mockApiClient.getDiscoveredConfigs as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        configs: [],
      });

      await toolHandlers.get("gal_set_active_workspace")!({
        workspaceName: "devops-dynamics",
      });

      const handler = toolHandlers.get("gal_get_discovered_configs")!;
      await handler({});

      expect(mockApiClient.getDiscoveredConfigs).toHaveBeenCalledWith(
        "devops-dynamics",
        undefined,
      );
    });
  });

  describe("GitHub context tools", () => {
    it("uses the active workspace for issue context when orgName is omitted", async () => {
      (
        mockApiClient.getGitHubIssueContext as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        issue: { number: 136, title: "Worker GitHub surface" },
      });

      await toolHandlers.get("gal_set_active_workspace")!({
        workspaceName: "gal-run",
      });

      const handler = toolHandlers.get("gal_get_github_issue_context")!;
      const result = await handler({
        owner: "gal-run",
        repo: "gal-api",
        issueNumber: 136,
      });

      expect(mockApiClient.getGitHubIssueContext).toHaveBeenCalledWith({
        orgName: "gal-run",
        owner: "gal-run",
        repo: "gal-api",
        issueNumber: 136,
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        issue: { number: 136, title: "Worker GitHub surface" },
      });
    });

    it("creates issue comments through the resolved workspace channel", async () => {
      (
        mockApiClient.createGitHubIssueComment as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        comment: { id: 42, body: "Blocked on deploy verification." },
      });

      const handler = toolHandlers.get("gal_create_github_issue_comment")!;
      const result = await handler({
        orgName: "gal-run",
        owner: "gal-run",
        repo: "gal-api",
        issueNumber: 136,
        body: "Blocked on deploy verification.",
      });

      expect(mockApiClient.createGitHubIssueComment).toHaveBeenCalledWith({
        orgName: "gal-run",
        owner: "gal-run",
        repo: "gal-api",
        issueNumber: 136,
        body: "Blocked on deploy verification.",
      });
      expect(JSON.parse(result.content[0].text)).toEqual({
        comment: { id: 42, body: "Blocked on deploy verification." },
      });
    });

    it("returns an error when pull request context fetch fails", async () => {
      (
        mockApiClient.getGitHubPullRequestContext as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("Forbidden"));

      const handler = toolHandlers.get("gal_get_github_pr_context")!;
      const result = await handler({
        orgName: "gal-run",
        owner: "gal-run",
        repo: "gal-api",
        prNumber: 137,
      });

      expect(mockApiClient.getGitHubPullRequestContext).toHaveBeenCalledWith({
        orgName: "gal-run",
        owner: "gal-run",
        repo: "gal-api",
        prNumber: 137,
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error fetching GitHub pull request context: Forbidden");
    });
  });

  describe("gal_register_session", () => {
    it("calls apiClient.createSession and returns sessionId", async () => {
      const apiResponse = {
        sessionId: "sess-abc",
        installationId: "inst-xyz",
        status: "registered",
        dashboardUrl: "https://app.gal.run/sessions/sess-abc",
      };
      (
        mockApiClient.createSession as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(apiResponse);

      const handler = toolHandlers.get("gal_register_session")!;
      const result = await handler({
        agent: "claude",
        prompt: "Fix tests",
        project_context: "owner/repo",
        session_type: undefined,
      });

      expect(mockApiClient.createSession).toHaveBeenCalledWith({
        agent: "claude",
        prompt: "Fix tests",
        project_context: "owner/repo",
        session_type: "local",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.sessionId).toBe("sess-abc");
      expect(parsed.status).toBe("registered");
      expect(parsed.dashboardUrl).toBe("https://app.gal.run/sessions/sess-abc");
    });

    it("returns isError when API fails", async () => {
      (
        mockApiClient.createSession as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(
        new Error("GAL API error 500: Internal Server Error"),
      );

      const handler = toolHandlers.get("gal_register_session")!;
      const result = await handler({
        agent: "claude",
        prompt: "test",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error registering session");
      expect(result.content[0].text).toContain("500");
    });
  });

  describe("gal_heartbeat", () => {
    it("returns error asking to register first when no session registered", async () => {
      const handler = toolHandlers.get("gal_heartbeat")!;
      const result = await handler({ status: "working" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No session registered");
      expect(result.content[0].text).toContain("gal_register_session");
      expect(mockApiClient.heartbeat).not.toHaveBeenCalled();
    });

    it("sends heartbeat with stored sessionId after registration", async () => {
      // First register a session to set storedSessionId
      (
        mockApiClient.createSession as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        sessionId: "sess-hb",
        installationId: "inst-hb",
      });
      const registerHandler = toolHandlers.get("gal_register_session")!;
      await registerHandler({ agent: "claude", prompt: "test" });

      // Now heartbeat should work
      (
        mockApiClient.heartbeat as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ ok: true });
      const heartbeatHandler = toolHandlers.get("gal_heartbeat")!;
      const result = await heartbeatHandler({
        status: "working",
        currentTask: "Writing unit tests",
      });

      expect(mockApiClient.heartbeat).toHaveBeenCalledWith("sess-hb", {
        status: "working",
        currentTask: "Writing unit tests",
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.sessionId).toBe("sess-hb");
    });
  });

  describe("gal_list_sessions", () => {
    it("calls apiClient.listSessions and returns sessions", async () => {
      const sessions = [
        { id: "sess-1", agent: "claude", status: "active" },
        { id: "sess-2", agent: "claude", status: "stale" },
      ];
      (
        mockApiClient.listSessions as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(sessions);

      const handler = toolHandlers.get("gal_list_sessions")!;
      const result = await handler({});

      expect(mockApiClient.listSessions).toHaveBeenCalledWith(undefined);
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toEqual(sessions);
    });

    it("passes orgId parameter when provided", async () => {
      (
        mockApiClient.listSessions as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce([]);

      const handler = toolHandlers.get("gal_list_sessions")!;
      await handler({ orgId: "org-123" });

      expect(mockApiClient.listSessions).toHaveBeenCalledWith("org-123");
    });
  });

  describe("gal_log_event", () => {
    it("calls apiClient.logEvents with generated event containing UUID and timestamp", async () => {
      (
        mockApiClient.logEvents as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ accepted: true });

      const handler = toolHandlers.get("gal_log_event")!;
      const result = await handler({
        eventType: "tool_use",
        payload: { tool: "bash", duration: 1500 },
      });

      expect(mockApiClient.logEvents).toHaveBeenCalledOnce();
      const calledEvents = (mockApiClient.logEvents as ReturnType<typeof vi.fn>)
        .mock.calls[0][0];
      expect(calledEvents).toHaveLength(1);

      const event = calledEvents[0];
      // UUID format check: 8-4-4-4-12 hex characters
      expect(event.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
      expect(event.eventType).toBe("tool_use");
      // ISO timestamp check
      expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
      expect(event.payload).toEqual({ tool: "bash", duration: 1500 });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.accepted).toBe(true);
      expect(parsed.eventId).toBe(event.id);
    });

    it("uses correct installationId from session registration", async () => {
      // Register a session first to set installationId
      (
        mockApiClient.createSession as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        sessionId: "sess-ev",
        installationId: "inst-ev-123",
      });
      const registerHandler = toolHandlers.get("gal_register_session")!;
      await registerHandler({ agent: "claude", prompt: "test" });

      // Now log an event
      (
        mockApiClient.logEvents as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ accepted: true });
      const logHandler = toolHandlers.get("gal_log_event")!;
      await logHandler({ eventType: "task_complete", payload: {} });

      const calledEvents = (mockApiClient.logEvents as ReturnType<typeof vi.fn>)
        .mock.calls[0][0];
      expect(calledEvents[0].installationId).toBe("inst-ev-123");
    });

    it('uses "unknown" as installationId when no session registered', async () => {
      (
        mockApiClient.logEvents as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ accepted: true });

      const handler = toolHandlers.get("gal_log_event")!;
      await handler({ eventType: "error", payload: { message: "oops" } });

      const calledEvents = (mockApiClient.logEvents as ReturnType<typeof vi.fn>)
        .mock.calls[0][0];
      expect(calledEvents[0].installationId).toBe("unknown");
    });
  });

  describe("gal_claim_task", () => {
    it("returns error when no session registered", async () => {
      const handler = toolHandlers.get("gal_claim_task")!;
      const result = await handler({ issueNumber: 42, repo: "owner/repo" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No session registered");
    });

    it("claims task with stored sessionId after registration", async () => {
      // Register session first
      (
        mockApiClient.createSession as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        sessionId: "sess-claim",
        installationId: "inst-claim",
      });
      await toolHandlers.get("gal_register_session")!({
        agent: "claude",
        prompt: "test",
      });

      // Claim task
      const claimResponse = { success: true, claimId: "owner_repo_42" };
      (
        mockApiClient.claimTask as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(claimResponse);

      const handler = toolHandlers.get("gal_claim_task")!;
      const result = await handler({ issueNumber: 42, repo: "owner/repo" });

      expect(mockApiClient.claimTask).toHaveBeenCalledWith({
        sessionId: "sess-claim",
        issueNumber: 42,
        repo: "owner/repo",
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it("returns error when claim conflicts (409)", async () => {
      // Register session
      (
        mockApiClient.createSession as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        sessionId: "sess-c2",
        installationId: "inst-c2",
      });
      await toolHandlers.get("gal_register_session")!({
        agent: "claude",
        prompt: "test",
      });

      // Claim fails
      (
        mockApiClient.claimTask as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("GAL API error 409: Already claimed"));

      const handler = toolHandlers.get("gal_claim_task")!;
      const result = await handler({ issueNumber: 99, repo: "owner/repo" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("409");
    });
  });

  describe("gal_report_progress", () => {
    it("returns error when no session registered", async () => {
      const handler = toolHandlers.get("gal_report_progress")!;
      const result = await handler({ currentTask: "Working on it" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No session registered");
    });

    it("reports progress with stored sessionId", async () => {
      // Register session
      (
        mockApiClient.createSession as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        sessionId: "sess-prog",
        installationId: "inst-prog",
      });
      await toolHandlers.get("gal_register_session")!({
        agent: "claude",
        prompt: "test",
      });

      (
        mockApiClient.reportProgress as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ success: true });

      const handler = toolHandlers.get("gal_report_progress")!;
      const result = await handler({
        currentTask: "Writing tests",
        branch: "feature/test",
        percentComplete: 75,
      });

      expect(mockApiClient.reportProgress).toHaveBeenCalledWith("sess-prog", {
        currentTask: "Writing tests",
        branch: "feature/test",
        filesTouched: undefined,
        percentComplete: 75,
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe("gal_send_directive", () => {
    it("returns error when no session registered", async () => {
      const handler = toolHandlers.get("gal_send_directive")!;
      const result = await handler({
        targetSessionId: "sess-2",
        type: "stop",
        payload: {},
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No session registered");
    });

    it("sends directive after registration", async () => {
      // Register session
      (
        mockApiClient.createSession as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        sessionId: "sess-dir",
        installationId: "inst-dir",
      });
      await toolHandlers.get("gal_register_session")!({
        agent: "claude",
        prompt: "test",
      });

      const directiveResponse = { success: true, directiveId: "dir-abc" };
      (
        mockApiClient.sendDirective as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(directiveResponse);

      const handler = toolHandlers.get("gal_send_directive")!;
      const result = await handler({
        targetSessionId: "sess-target",
        type: "claim_task",
        payload: { issueNumber: 42 },
      });

      expect(mockApiClient.sendDirective).toHaveBeenCalledWith("sess-dir", {
        targetSessionId: "sess-target",
        type: "claim_task",
        payload: { issueNumber: 42 },
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });
  });

  describe("gal_get_directives", () => {
    it("returns error when no session registered", async () => {
      const handler = toolHandlers.get("gal_get_directives")!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("No session registered");
    });

    it("returns directives after registration", async () => {
      // Register session
      (
        mockApiClient.createSession as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        sessionId: "sess-gd",
        installationId: "inst-gd",
      });
      await toolHandlers.get("gal_register_session")!({
        agent: "claude",
        prompt: "test",
      });

      const directivesResponse = {
        sessionId: "sess-gd",
        directives: [
          {
            id: "dir-1",
            from: "sess-other",
            type: "stop",
            payload: {},
            createdAt: "2026-02-15T00:00:00Z",
          },
        ],
      };
      (
        mockApiClient.getDirectives as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(directivesResponse);

      const handler = toolHandlers.get("gal_get_directives")!;
      const result = await handler({});

      expect(mockApiClient.getDirectives).toHaveBeenCalledWith("sess-gd");
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.directives).toHaveLength(1);
      expect(parsed.directives[0].type).toBe("stop");
    });
  });

  describe("gal_dispatch_agent", () => {
    it("calls dispatchAgent and returns session info", async () => {
      const dispatchResponse = {
        id: "sess-new",
        status: "PENDING",
        dashboardUrl: "https://app.gal.run/sessions/sess-new",
      };
      (
        mockApiClient.dispatchAgent as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(dispatchResponse);

      const handler = toolHandlers.get("gal_dispatch_agent")!;
      const result = await handler({
        agent: "claude",
        prompt: "Fix the auth bug",
        project_context: "owner/repo",
      });

      expect(mockApiClient.dispatchAgent).toHaveBeenCalledWith({
        agent: "claude",
        prompt: "Fix the auth bug",
        project_context: "owner/repo",
        session_type: "background",
        model: undefined,
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.sessionId).toBe("sess-new");
      expect(parsed.status).toBe("PENDING");
    });

    it("does not require a registered session (can dispatch without being registered)", async () => {
      const dispatchResponse = { id: "sess-anon", status: "PENDING" };
      (
        mockApiClient.dispatchAgent as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(dispatchResponse);

      const handler = toolHandlers.get("gal_dispatch_agent")!;
      const result = await handler({
        agent: "claude",
        prompt: "Scan repos",
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.sessionId).toBe("sess-anon");
    });

    it("passes through an explicit org override for multi-org dispatches", async () => {
      const dispatchResponse = { id: "sess-org", status: "PENDING" };
      (
        mockApiClient.dispatchAgent as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(dispatchResponse);

      const handler = toolHandlers.get("gal_dispatch_agent")!;
      await handler({
        agent: "claude",
        prompt: "Scan repos",
        org: "acme-corp",
      });

      expect(mockApiClient.dispatchAgent).toHaveBeenCalledWith({
        agent: "claude",
        prompt: "Scan repos",
        project_context: undefined,
        session_type: "background",
        model: undefined,
        org: "acme-corp",
      });
    });
  });

  describe("gal_resume_session", () => {
    it("calls resumeSession and returns response", async () => {
      const resumeResponse = {
        success: true,
        sessionId: "sess-123",
        workflowRunId: 987,
        agentSessionId: "agent-abc",
        message: "Session resume initiated",
      };
      (
        mockApiClient.resumeSession as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(resumeResponse);

      const handler = toolHandlers.get("gal_resume_session")!;
      const result = await handler({
        sessionId: "sess-123",
        prompt: "Continue from previous context",
        dispatch_backend: "stratus",
      });

      expect(mockApiClient.resumeSession).toHaveBeenCalledWith({
        session_id: "sess-123",
        prompt: "Continue from previous context",
        dispatch_backend: "stratus",
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.sessionId).toBe("sess-123");
      expect(parsed.workflowRunId).toBe(987);
    });

    it("accepts snake_case session_id alias", async () => {
      (
        mockApiClient.resumeSession as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ success: true });

      const handler = toolHandlers.get("gal_resume_session")!;
      await handler({
        session_id: "sess-alias",
        prompt: "Resume",
      });

      expect(mockApiClient.resumeSession).toHaveBeenCalledWith({
        session_id: "sess-alias",
        prompt: "Resume",
      });
    });
  });

  describe("gal_set_dispatch_rules", () => {
    it("sends rules payload to API", async () => {
      (
        mockApiClient.getDispatchRules as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        providerPools: [],
      });
      (
        mockApiClient.setDispatchRules as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ success: true });

      const handler = toolHandlers.get("gal_set_dispatch_rules")!;
      const result = await handler({
        orgName: "acme",
        rules: [{ category: "default", enabled: true, backend: "auto" }],
        maxConcurrentAgents: 3,
        reservedForManual: 1,
        preferredProvider: "gal-code",
        enabledCredentialOwners: ["github:146047080", "github:48866801"],
        preferredCredentialOwners: ["github:48866801"],
        providerPools: [{ provider: "gal-code", maxConcurrent: 4 }],
      });

      expect(mockApiClient.getDispatchRules).toHaveBeenCalledWith("acme");
      expect(mockApiClient.setDispatchRules).toHaveBeenCalledWith("acme", {
        rules: [{ category: "default", enabled: true, backend: "auto" }],
        maxConcurrentAgents: 3,
        reservedForManual: 1,
        preferredProvider: "gal-code",
        enabledCredentialOwners: ["github:146047080", "github:48866801"],
        preferredCredentialOwners: ["github:48866801"],
        providerPools: [{ provider: "gal-code", maxConcurrent: 4 }],
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
    });

    it("merges providerPools updates with existing pools", async () => {
      (
        mockApiClient.getDispatchRules as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        providerPools: [
          { provider: "claude", maxConcurrent: 2, maxPending: 20 },
          { provider: "codex", maxConcurrent: 1, maxPending: 8 },
        ],
      });
      (
        mockApiClient.setDispatchRules as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ success: true });

      const handler = toolHandlers.get("gal_set_dispatch_rules")!;
      await handler({
        orgName: "acme",
        rules: [{ category: "default", enabled: true, backend: "auto" }],
        providerPools: [{ provider: "claude", maxConcurrent: 4 }],
      });

      expect(mockApiClient.getDispatchRules).toHaveBeenCalledWith("acme");
      expect(mockApiClient.setDispatchRules).toHaveBeenCalledWith("acme", {
        rules: [{ category: "default", enabled: true, backend: "auto" }],
        providerPools: [
          { provider: "claude", maxConcurrent: 4, maxPending: 20 },
          { provider: "codex", maxConcurrent: 1, maxPending: 8 },
        ],
      });
    });

    it("preserves gal-code providerPools when merging updates", async () => {
      (
        mockApiClient.getDispatchRules as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        providerPools: [
          { provider: "gal-code", maxConcurrent: 2, maxPending: 20 },
          { provider: "codex", maxConcurrent: 1, maxPending: 8 },
        ],
      });
      (
        mockApiClient.setDispatchRules as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ success: true });

      const handler = toolHandlers.get("gal_set_dispatch_rules")!;
      await handler({
        orgName: "acme",
        rules: [{ category: "default", enabled: true, backend: "auto" }],
        providerPools: [{ provider: "gal-code", maxConcurrent: 4 }],
      });

      expect(mockApiClient.setDispatchRules).toHaveBeenCalledWith("acme", {
        rules: [{ category: "default", enabled: true, backend: "auto" }],
        providerPools: [
          { provider: "gal-code", maxConcurrent: 4, maxPending: 20 },
          { provider: "codex", maxConcurrent: 1, maxPending: 8 },
        ],
      });
    });

    it("rejects negative providerPools limits", async () => {
      const handler = toolHandlers.get("gal_set_dispatch_rules")!;
      const result = await handler({
        orgName: "acme",
        rules: [{ category: "default", enabled: true, backend: "auto" }],
        providerPools: [{ provider: "claude", maxPending: -1 }],
      });

      expect(mockApiClient.getDispatchRules).not.toHaveBeenCalled();
      expect(mockApiClient.setDispatchRules).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        "providerPools maxConcurrent/maxPending must be >= 0",
      );
    });

    it("reuses existing rules when only queue settings are provided", async () => {
      const existingRules = [
        { category: "default", enabled: true, backend: "auto" },
      ];
      (
        mockApiClient.getDispatchRules as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ rules: existingRules });
      (
        mockApiClient.setDispatchRules as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ success: true });

      const handler = toolHandlers.get("gal_set_dispatch_rules")!;
      await handler({
        orgName: "acme",
        maxConcurrentAgents: 2,
        reservedForManual: 1,
        maxPendingQueueItems: 10,
      });

      expect(mockApiClient.getDispatchRules).toHaveBeenCalledWith("acme");
      expect(mockApiClient.setDispatchRules).toHaveBeenCalledWith("acme", {
        rules: existingRules,
        maxConcurrentAgents: 2,
        reservedForManual: 1,
        maxPendingQueueItems: 10,
      });
    });
  });

  describe("gal_set_queue_order", () => {
    it("sends the full ordered queue to the API", async () => {
      (
        mockApiClient.setQueueOrder as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({ success: true, order: ["w2", "w1"] });

      const handler = toolHandlers.get("gal_set_queue_order")!;
      const result = await handler({
        orgName: "acme",
        itemIds: ["w2", "w1"],
      });

      expect(mockApiClient.setQueueOrder).toHaveBeenCalledWith({
        orgName: "acme",
        itemIds: ["w2", "w1"],
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.order).toEqual(["w2", "w1"]);
    });
  });

  describe("gal_get_session_output", () => {
    it("fetches output entries and returns sorted array", async () => {
      const rtdbData = {
        "-NzAA": {
          timestamp: "2026-01-01T00:00:00.000Z",
          tool_activity: { tool_name: "Bash", input: { command: "ls" } },
        },
        "-NzBB": {
          timestamp: "2026-01-01T00:00:01.000Z",
          tool_activity: {
            tool_name: "Read",
            input: { file_path: "/tmp/foo.ts" },
          },
        },
      };
      (
        mockApiClient.getSessionOutput as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(rtdbData);

      const handler = toolHandlers.get("gal_get_session_output")!;
      const result = await handler({ sessionId: "sess-out-1", lastN: 20 });

      expect(mockApiClient.getSessionOutput).toHaveBeenCalledWith(
        "sess-out-1",
        20,
      );
      expect(result.isError).toBeUndefined();

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.sessionId).toBe("sess-out-1");
      expect(parsed.count).toBe(2);
      // Entries should be sorted by key
      expect(parsed.entries[0].key).toBe("-NzAA");
      expect(parsed.entries[1].key).toBe("-NzBB");
      expect(parsed.entries[0].tool_activity.tool_name).toBe("Bash");
    });

    it("returns empty entries with message when session has no output", async () => {
      (
        mockApiClient.getSessionOutput as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(null);

      const handler = toolHandlers.get("gal_get_session_output")!;
      const result = await handler({ sessionId: "sess-empty", lastN: 20 });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.sessionId).toBe("sess-empty");
      expect(parsed.entries).toEqual([]);
      expect(parsed.message).toContain("No output found");
    });

    it("uses default lastN of 50 when not provided", async () => {
      (
        mockApiClient.getSessionOutput as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(null);

      const handler = toolHandlers.get("gal_get_session_output")!;
      await handler({ sessionId: "sess-def" });

      expect(mockApiClient.getSessionOutput).toHaveBeenCalledWith(
        "sess-def",
        50,
      );
    });

    it("respects custom lastN value", async () => {
      (
        mockApiClient.getSessionOutput as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(null);

      const handler = toolHandlers.get("gal_get_session_output")!;
      await handler({ sessionId: "sess-n", lastN: 50 });

      expect(mockApiClient.getSessionOutput).toHaveBeenCalledWith("sess-n", 50);
    });

    it("returns isError on API failure", async () => {
      (
        mockApiClient.getSessionOutput as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("RTDB error 403: Permission denied"));

      const handler = toolHandlers.get("gal_get_session_output")!;
      const result = await handler({ sessionId: "sess-fail", lastN: 20 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error fetching session output");
      expect(result.content[0].text).toContain("403");
    });

    it("works for TERMINATED sessions (no active session requirement)", async () => {
      // No session registered — tool should still work (reads RTDB directly)
      const rtdbData = {
        "-NzCC": {
          timestamp: "2026-01-01T12:00:00.000Z",
          tool_activity: {
            tool_name: "Write",
            input: { file_path: "/tmp/out.txt" },
          },
        },
      };
      (
        mockApiClient.getSessionOutput as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(rtdbData);

      const handler = toolHandlers.get("gal_get_session_output")!;
      const result = await handler({ sessionId: "sess-terminated", lastN: 20 });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.count).toBe(1);
      expect(parsed.entries[0].key).toBe("-NzCC");
    });
  });

  describe("shared memory tools", () => {
    it("gal_read_memory forwards org scope and registered session ID", async () => {
      (
        mockApiClient.createSession as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        sessionId: "sess-memory-1",
        installationId: "inst-memory",
      });
      await toolHandlers.get("gal_register_session")!({
        agent: "claude",
        prompt: "memory test",
      });

      (
        mockApiClient.readMemory as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        entries: [{ id: "mem-1", content: "Use Firestore emulator for tests" }],
      });

      const handler = toolHandlers.get("gal_read_memory")!;
      const result = await handler({
        orgId: "acme-corp",
        repoScope: "org/repo",
        limit: 5,
      });

      expect(mockApiClient.readMemory).toHaveBeenCalledWith({
        orgId: "acme-corp",
        repoScope: "org/repo",
        limit: 5,
        sessionId: "sess-memory-1",
      });
      expect(result.isError).toBeUndefined();
    });

    it("gal_write_memory writes an entry with optional metadata", async () => {
      (
        mockApiClient.writeMemory as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        entry: { id: "mem-2", source: "developer" },
      });

      const handler = toolHandlers.get("gal_write_memory")!;
      const result = await handler({
        orgId: "acme-corp",
        content: "CI requires firebase emulator startup in integration jobs.",
        repoScope: "org/repo",
        source: "developer",
        tags: ["testing", "firestore"],
        sessionId: "sess-manual",
      });

      expect(mockApiClient.writeMemory).toHaveBeenCalledWith({
        orgId: "acme-corp",
        content: "CI requires firebase emulator startup in integration jobs.",
        repoScope: "org/repo",
        source: "developer",
        tags: ["testing", "firestore"],
        sessionId: "sess-manual",
      });
      expect(result.isError).toBeUndefined();
    });

    it("gal_get_peer_activity fetches active peer session info", async () => {
      (
        mockApiClient.getPeerActivity as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        activities: [{ sessionId: "sess-peer-1", status: "active" }],
      });

      const handler = toolHandlers.get("gal_get_peer_activity")!;
      const result = await handler({
        orgId: "acme-corp",
        repoScope: "org/repo",
        limit: 10,
      });

      expect(mockApiClient.getPeerActivity).toHaveBeenCalledWith({
        orgId: "acme-corp",
        repoScope: "org/repo",
        limit: 10,
      });
      expect(result.isError).toBeUndefined();
    });
  });

  describe("gal swarm tools", () => {
    it("creates a swarm run using the active workspace", async () => {
      await toolHandlers.get("gal_set_active_workspace")!({
        workspaceName: "gal-run",
      });

      (
        mockApiClient.createSwarmRun as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        plan: {
          runId: "swarm_test",
          mode: "dry-run",
          target: { provider: "stratus", computeProfileId: "deepseek-v4-pro" },
        },
      });

      const handler = toolHandlers.get("gal_swarm_run")!;
      const result = await handler({
        objective: "Plan a release swarm",
        highLevelPrompt: "Plan the active release backlog",
        successCriteria: ["All release issues are planned"],
        constraints: ["dry-run only"],
        approvalQuestion: "Approve starting this swarm?",
        capacityPolicyProfile: "dev-smoke",
        tasks: 2,
        promptTokens: 1000,
      });

      expect(mockApiClient.createSwarmRun).toHaveBeenCalledWith(
        expect.objectContaining({
          orgName: "gal-run",
          objective: "Plan a release swarm",
          questionnaire: {
            highLevelPrompt: "Plan the active release backlog",
            successCriteria: ["All release issues are planned"],
            constraints: ["dry-run only"],
            approvalQuestion: "Approve starting this swarm?",
          },
          tasks: 2,
          promptTokens: 1000,
          capacityPolicyProfile: "dev-smoke",
          executionApproval: expect.objectContaining({
            approved: undefined,
            question: "Approve starting this swarm?",
          }),
        }),
      );
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.plan.runId).toBe("swarm_test");
    });

    it("creates an apply-mode issue swarm with worker dispatch", async () => {
      await toolHandlers.get("gal_set_active_workspace")!({
        workspaceName: "gal-run",
      });

      (
        mockApiClient.createSwarmRun as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        plan: {
          runId: "swarm_workers",
          mode: "apply",
        },
      });

      const handler = toolHandlers.get("gal_swarm_run")!;
      const result = await handler({
        objective: "Dispatch the infra operator backlog",
        workerOnly: true,
        workerMaxSessions: 3,
        workerAgent: "gal-code",
        workerModel: "deepseek-v4-pro",
        workerRunnerLabels: [
          "agents-standard-runc-x64",
          "agents-medium-runc-x64",
        ],
        workerIssues: [
          {
            repository: "acme-corp/infra",
            issueNumber: 3611,
            title: "Restore infra shell runtime /api facade for operator login",
          },
        ],
      });

      expect(mockApiClient.createSwarmRun).toHaveBeenCalledWith(
        expect.objectContaining({
          orgName: "gal-run",
          objective: "Dispatch the infra operator backlog",
          sandboxCount: 3,
          stratusPipeline: { enabled: false },
          workerDispatch: {
            enabled: true,
            maxSessions: 3,
            agent: "gal-code",
            model: "deepseek-v4-pro",
            runnerLabels: [
              "agents-standard-runc-x64",
              "agents-medium-runc-x64",
            ],
            dispatchBackend: "stratus",
            issues: [
              {
                repository: "acme-corp/infra",
                issueNumber: 3611,
                title:
                  "Restore infra shell runtime /api facade for operator login",
              },
            ],
          },
        }),
      );
      expect(result.isError).toBeUndefined();
    });

    it("does not synthesize worker dispatch for apply runs without explicit issues", async () => {
      await toolHandlers.get("gal_set_active_workspace")!({
        workspaceName: "gal-run",
      });

      (mockApiClient.createSwarmRun as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        plan: {
          runId: "swarm_apply_plan",
          mode: "apply",
        },
      });

      const handler = toolHandlers.get("gal_swarm_run")!;
      const result = await handler({
        objective: "Start a governed capacity run without worker fanout",
        mode: "apply",
        approvalEvidenceUrl: "https://github.com/gal-run/gal/issues/1#issuecomment-1",
        executionApproved: true,
      });

      const swarmPayload = (mockApiClient.createSwarmRun as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(swarmPayload).not.toHaveProperty("stratusPipeline");
      expect(swarmPayload).not.toHaveProperty("workerDispatch");
      expect(mockApiClient.createSwarmRun).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalEvidenceUrl: "https://github.com/gal-run/gal/issues/1#issuecomment-1",
          executionApproval: expect.objectContaining({
            approved: true,
            approvalEvidenceUrl: "https://github.com/gal-run/gal/issues/1#issuecomment-1",
          }),
        }),
      );
      expect(result.isError).toBeUndefined();
    });

    it("rejects explicit worker dispatch without worker issues", async () => {
      await toolHandlers.get("gal_set_active_workspace")!({
        workspaceName: "gal-run",
      });

      const handler = toolHandlers.get("gal_swarm_run")!;
      const result = await handler({
        objective: "Dispatch an unsourced backlog",
        workerOnly: true,
      });

      expect(mockApiClient.createSwarmRun).not.toHaveBeenCalled();
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Worker dispatch requires workerIssues");
    });

    it("defaults worker-dispatched issue swarms to worker-only mode", async () => {
      await toolHandlers.get("gal_set_active_workspace")!({
        workspaceName: "gal-run",
      });

      (mockApiClient.createSwarmRun as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        plan: {
          runId: "swarm_workers_default",
          mode: "dry-run",
        },
      });

      const handler = toolHandlers.get("gal_swarm_run")!;
      const result = await handler({
        objective: "Dispatch the repo backlog",
        workerDispatchEnabled: true,
        workerMaxSessions: 2,
        workerIssues: [
          {
            repository: "gal-run/super-agent",
            issueNumber: 1,
            title: "Implement super-agent meta-reasoning engine (Layer 1)",
          },
        ],
      });

      expect(mockApiClient.createSwarmRun).toHaveBeenCalledWith(
        expect.objectContaining({
          objective: "Dispatch the repo backlog",
          stratusPipeline: { enabled: false },
          workerDispatch: expect.objectContaining({
            enabled: true,
            maxSessions: 2,
            dispatchBackend: "stratus",
          }),
        }),
      );
      expect(result.isError).toBeUndefined();
    });

    it("infers worker issues from issue-shaped objectives and defaults to worker-only mode", async () => {
      await toolHandlers.get("gal_set_active_workspace")!({
        workspaceName: "gal-run",
      });

      (mockApiClient.createSwarmRun as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        plan: {
          runId: "swarm_workers_inferred",
          mode: "dry-run",
        },
      });

      const handler = toolHandlers.get("gal_swarm_run")!;
      const result = await handler({
        objective:
          "Fix gal-run/gal-code#52 (release signing verification) and gal-run/gal-cli#63 (npm trusted publishing for provenance).",
      });

      expect(mockApiClient.createSwarmRun).toHaveBeenCalledWith(
        expect.objectContaining({
          objective:
            "Fix gal-run/gal-code#52 (release signing verification) and gal-run/gal-cli#63 (npm trusted publishing for provenance).",
          stratusPipeline: { enabled: false },
          workerDispatch: expect.objectContaining({
            enabled: true,
            maxSessions: 2,
            dispatchBackend: "stratus",
            issues: [
              {
                repository: "gal-run/gal-code",
                issueNumber: 52,
                title: "release signing verification",
                url: "https://github.com/gal-run/gal-code/issues/52",
              },
              {
                repository: "gal-run/gal-cli",
                issueNumber: 63,
                title: "npm trusted publishing for provenance",
                url: "https://github.com/gal-run/gal-cli/issues/63",
              },
            ],
          }),
        }),
      );
      expect(result.isError).toBeUndefined();
    });

    it("checks swarm run status using the active workspace", async () => {
      await toolHandlers.get("gal_set_active_workspace")!({
        workspaceName: "gal-run",
      });

      (
        mockApiClient.getSwarmRun as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        runId: "swarm_test",
        status: "planned",
      });

      const handler = toolHandlers.get("gal_swarm_status")!;
      const result = await handler({ runId: "swarm_test" });

      expect(mockApiClient.getSwarmRun).toHaveBeenCalledWith(
        "gal-run",
        "swarm_test",
      );
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe("planned");
    });

    it("lists swarm runs using the active workspace", async () => {
      await toolHandlers.get("gal_set_active_workspace")!({
        workspaceName: "gal-run",
      });

      (
        mockApiClient.listSwarmRuns as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        runs: [{ plan: { runId: "swarm_test" } }],
      });

      const handler = toolHandlers.get("gal_swarm_list_runs")!;
      const result = await handler({});

      expect(mockApiClient.listSwarmRuns).toHaveBeenCalledWith("gal-run");
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.runs[0].plan.runId).toBe("swarm_test");
    });

    it("submits calibration actuals using the active workspace", async () => {
      await toolHandlers.get("gal_set_active_workspace")!({
        workspaceName: "gal-run",
      });

      (
        mockApiClient.calibrateSwarmRun as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        calibration: {
          efficiencyRatio: 0.93,
        },
      });

      const handler = toolHandlers.get("gal_swarm_calibrate")!;
      const result = await handler({
        runId: "swarm_test",
        durationSeconds: 180,
        promptTokens: 1000,
        completionTokens: 400,
        toolCalls: 8,
        workflowWaitSeconds: 30,
        sandboxCount: 2,
        notes: "Smoke calibration",
      });

      expect(mockApiClient.calibrateSwarmRun).toHaveBeenCalledWith({
        orgName: "gal-run",
        runId: "swarm_test",
        durationSeconds: 180,
        promptTokens: 1000,
        completionTokens: 400,
        toolCalls: 8,
        workflowWaitSeconds: 30,
        sandboxCount: 2,
        notes: "Smoke calibration",
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.calibration.efficiencyRatio).toBe(0.93);
    });

    it("submits capacity observations using the active workspace", async () => {
      await toolHandlers.get("gal_set_active_workspace")!({
        workspaceName: "gal-run",
      });

      (
        mockApiClient.observeSwarmCapacity as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        capacityDecision: {
          action: "scale_up",
          reason: "backlog_pressure",
        },
      });

      const handler = toolHandlers.get("gal_swarm_observe_capacity")!;
      const result = await handler({
        runId: "swarm_test",
        activeWorkers: 1,
        queuedTokenSeconds: 600,
        tokensPerSecond: 120,
        latencyP95Ms: 10000,
        gpuUtilizationPercent: 80,
        memoryUtilizationPercent: 70,
        activeTasks: 2,
        queuedTasks: 5,
        errorRatePercent: 0,
        providerHealthy: true,
        elapsedSeconds: 120,
        spendUsd: 0.2,
        idleSeconds: 0,
        serverlessFallbackHealthy: true,
      });

      expect(mockApiClient.observeSwarmCapacity).toHaveBeenCalledWith({
        orgName: "gal-run",
        runId: "swarm_test",
        activeWorkers: 1,
        queuedTokenSeconds: 600,
        tokensPerSecond: 120,
        latencyP95Ms: 10000,
        gpuUtilizationPercent: 80,
        memoryUtilizationPercent: 70,
        activeTasks: 2,
        queuedTasks: 5,
        errorRatePercent: 0,
        providerHealthy: true,
        elapsedSeconds: 120,
        spendUsd: 0.2,
        idleSeconds: 0,
        serverlessFallbackHealthy: true,
      });
      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.capacityDecision.action).toBe("scale_up");
    });
  });
});
