import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GalApiClient } from '../src/api-client.js';

const BASE_URL = 'https://api.gal.run';
const AUTH_TOKEN = 'test-token-abc123';

describe('GalApiClient', () => {
  let client: GalApiClient;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    client = new GalApiClient(BASE_URL, AUTH_TOKEN);
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  function mockOkResponse(body: unknown) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    });
  }

  function mockErrorResponse(status: number, body: string) {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      text: () => Promise.resolve(body),
    });
  }

  describe('createSession', () => {
    it('sends POST to /api/sessions with correct body and auth header', async () => {
      const responseBody = { sessionId: 'sess-123', status: 'registered' };
      mockOkResponse(responseBody);

      const params = {
        agent: 'claude',
        prompt: 'Fix bug in auth',
        project_context: 'owner/repo',
        session_type: 'local' as const,
      };

      const result = await client.createSession(params);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/sessions`);
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['Authorization']).toBe(`Bearer ${AUTH_TOKEN}`);
      // Verify MCP params are mapped to API camelCase field names
      const body = JSON.parse(options.body);
      expect(body.agent).toBe('claude');
      expect(body.initialPrompt).toBe('Fix bug in auth');
      expect(body.projectContext).toBe('owner/repo');
      expect(body.session_type).toBe('local');
      expect(result).toEqual(responseBody);
    });
  });

  describe('listSessions', () => {
    it('sends GET to /api/sessions without orgId', async () => {
      const sessions = [{ id: 'sess-1' }, { id: 'sess-2' }];
      mockOkResponse(sessions);

      const result = await client.listSessions();

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/sessions`);
      expect(options.method).toBe('GET');
      expect(options.body).toBeUndefined();
      expect(result).toEqual(sessions);
    });

    it('sends GET to /api/sessions?org=xxx with org URL-encoded (#3161)', async () => {
      const sessions = [{ id: 'sess-1' }];
      mockOkResponse(sessions);

      await client.listSessions('org with spaces');

      const [url] = mockFetch.mock.calls[0];
      // #3161: Use 'org' param (not 'orgId') to match GET /api/sessions endpoint contract
      expect(url).toBe(`${BASE_URL}/api/sessions?org=org%20with%20spaces`);
    });
  });

  describe('workspace endpoints', () => {
    it('lists workspaces via GET /organizations', async () => {
      const responseBody = {
        organizations: [{ name: 'acme-corp' }],
      };
      mockOkResponse(responseBody);

      const result = await client.listWorkspaces();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/organizations`);
      expect(options.method).toBe('GET');
      expect(result).toEqual(responseBody);
    });

    it('keeps listOrganizations as a compatibility alias', async () => {
      mockOkResponse({ organizations: [] });

      await client.listOrganizations();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/organizations`);
      expect(options.method).toBe('GET');
    });

    it('syncs workspaces via POST /organizations/quick-sync', async () => {
      mockOkResponse({ success: true, organizations: ['acme-corp'] });

      const result = await client.syncWorkspace('acme-corp');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/organizations/quick-sync`);
      expect(options.method).toBe('POST');
      expect(result).toEqual({ success: true, organizations: ['acme-corp'] });
    });
  });

  describe('dispatch rules endpoints', () => {
    it('sends owner-control fields when setting dispatch rules', async () => {
      mockOkResponse({ success: true });

      await client.setDispatchRules('acme-corp', {
        rules: [{ category: 'default', enabled: true, backend: 'auto' }],
        reservedForManual: 1,
        enabledCredentialOwners: ['github:146047080', 'github:48866801'],
        preferredCredentialOwners: ['github:48866801'],
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/organizations/acme-corp/dispatch-rules`);
      expect(options.method).toBe('PUT');
      const body = JSON.parse(options.body);
      expect(body.reservedForManual).toBe(1);
      expect(body.enabledCredentialOwners).toEqual(['github:146047080', 'github:48866801']);
      expect(body.preferredCredentialOwners).toEqual(['github:48866801']);
    });
  });

  describe('github tool endpoints', () => {
    it('fetches GitHub issue context through the org-scoped route', async () => {
      const responseBody = { issue: { number: 136, title: 'Worker GitHub surface' } };
      mockOkResponse(responseBody);

      const result = await client.getGitHubIssueContext({
        orgName: 'gal-run',
        owner: 'gal-run',
        repo: 'gal-api',
        issueNumber: 136,
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/organizations/gal-run/github/repos/gal-run/gal-api/issues/136/context`);
      expect(options.method).toBe('GET');
      expect(result).toEqual(responseBody);
    });

    it('creates GitHub issue comments through the org-scoped route', async () => {
      const responseBody = { comment: { id: 42 } };
      mockOkResponse(responseBody);

      const result = await client.createGitHubIssueComment({
        orgName: 'gal-run',
        owner: 'gal-run',
        repo: 'gal-api',
        issueNumber: 136,
        body: 'Blocked on deploy verification.',
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/organizations/gal-run/github/repos/gal-run/gal-api/issues/136/comments`);
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ body: 'Blocked on deploy verification.' });
      expect(result).toEqual(responseBody);
    });

    it('fetches GitHub pull request context through the org-scoped route', async () => {
      const responseBody = { pullRequest: { number: 137, title: 'Add swarm GitHub tool surface' } };
      mockOkResponse(responseBody);

      const result = await client.getGitHubPullRequestContext({
        orgName: 'gal-run',
        owner: 'gal-run',
        repo: 'gal-api',
        prNumber: 137,
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/organizations/gal-run/github/repos/gal-run/gal-api/pulls/137/context`);
      expect(options.method).toBe('GET');
      expect(result).toEqual(responseBody);
    });
  });

  describe('swarm endpoints', () => {
    it('creates swarm runs with gal-mcp as the trigger source', async () => {
      mockOkResponse({ plan: { runId: 'swarm-1' } });

      await client.createSwarmRun({
        orgName: 'gal-run',
        objective: 'Plan a governed swarm',
        mode: 'dry-run',
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/swarm/gal-run/runs`);
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.source).toBe('gal-mcp');
      expect(body.target.provider).toBe('gcp');
      expect(body.target.sandboxProvider).toBe('stratus');
      expect(body.target.computeProfileId).toBe('gcp-l4-1x-qwen-smoke');
      expect(body.workload.sandboxCount).toBe(1);
    });

    it('lists swarm runs for an organization', async () => {
      mockOkResponse({ runs: [] });

      await client.listSwarmRuns('acme-corp');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/swarm/acme-corp/runs`);
      expect(options.method).toBe('GET');
    });

    it('patches swarm calibration actuals', async () => {
      mockOkResponse({ calibration: { durationRatio: 1.1 } });

      await client.calibrateSwarmRun({
        orgName: 'acme-corp',
        runId: 'swarm-test',
        durationSeconds: 120,
        promptTokens: 1000,
        completionTokens: 400,
        toolCalls: 8,
        workflowWaitSeconds: 15,
        sandboxCount: 2,
        notes: 'calibration smoke',
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/swarm/acme-corp/runs/swarm-test/actuals`);
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body)).toEqual({
        durationSeconds: 120,
        promptTokens: 1000,
        completionTokens: 400,
        toolCalls: 8,
        workflowWaitSeconds: 15,
        sandboxCount: 2,
        notes: 'calibration smoke',
      });
    });
  });

  describe('heartbeat', () => {
    it('sends POST to /api/sessions/:id/heartbeat with body', async () => {
      mockOkResponse({ ok: true });

      const data = { status: 'working', currentTask: 'Writing tests' };
      await client.heartbeat('sess-123', data);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/sessions/sess-123/heartbeat`);
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual(data);
    });
  });

  describe('logEvents', () => {
    it('sends POST to /telemetry/events with { events: [...] }', async () => {
      mockOkResponse({ accepted: true });

      const events = [
        {
          id: 'evt-1',
          installationId: 'inst-1',
          eventType: 'tool_use',
          timestamp: '2026-02-15T00:00:00.000Z',
          payload: { tool: 'bash' },
        },
      ];

      await client.logEvents(events);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/telemetry/events`);
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ events });
    });
  });

  describe('error handling', () => {
    it('throws Error with status code and body text when response.ok is false', async () => {
      mockErrorResponse(403, 'Forbidden: invalid token');

      await expect(client.createSession({ agent: 'claude', prompt: 'test' }))
        .rejects.toThrow('GAL API error 403: Forbidden: invalid token');
    });

    it('throws on 500 server error', async () => {
      mockErrorResponse(500, 'Internal Server Error');

      await expect(client.listSessions())
        .rejects.toThrow('GAL API error 500: Internal Server Error');
    });
  });

  describe('claimTask', () => {
    it('sends POST to /api/tasks/:issueNumber/claim', async () => {
      mockOkResponse({ success: true, claimId: 'owner_repo_42' });

      await client.claimTask({
        sessionId: 'sess-1',
        issueNumber: 42,
        repo: 'owner/repo',
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/tasks/42/claim`);
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        sessionId: 'sess-1',
        issueNumber: 42,
        repo: 'owner/repo',
      });
    });
  });

  describe('reportProgress', () => {
    it('sends POST to /api/sessions/:id/progress', async () => {
      mockOkResponse({ success: true });

      await client.reportProgress('sess-1', {
        currentTask: 'Writing tests',
        branch: 'feature/test',
        percentComplete: 50,
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/sessions/sess-1/progress`);
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.currentTask).toBe('Writing tests');
      expect(body.branch).toBe('feature/test');
      expect(body.percentComplete).toBe(50);
    });
  });

  describe('sendDirective', () => {
    it('sends POST to /api/sessions/:id/directive', async () => {
      mockOkResponse({ success: true, directiveId: 'dir-1' });

      await client.sendDirective('sess-1', {
        targetSessionId: 'sess-2',
        type: 'claim_task',
        payload: { issueNumber: 99 },
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/sessions/sess-1/directive`);
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.targetSessionId).toBe('sess-2');
      expect(body.type).toBe('claim_task');
    });
  });

  describe('getDirectives', () => {
    it('sends GET to /api/sessions/:id/directives', async () => {
      mockOkResponse({ sessionId: 'sess-1', directives: [] });

      await client.getDirectives('sess-1');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/sessions/sess-1/directives`);
      expect(options.method).toBe('GET');
    });
  });

  describe('dispatchAgent', () => {
    it('sends POST to /api/sessions with session_type=background', async () => {
      mockOkResponse({ id: 'sess-new', status: 'PENDING' });

      await client.dispatchAgent({
        agent: 'claude',
        prompt: 'Fix bug in auth',
        project_context: 'owner/repo',
        org: 'acme-corp',
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/sessions`);
      expect(options.method).toBe('POST');
      // Verify MCP params are mapped to API camelCase field names
      const body = JSON.parse(options.body);
      expect(body.agent).toBe('claude');
      expect(body.initialPrompt).toBe('Fix bug in auth');
      expect(body.projectContext).toBe('owner/repo');
      expect(body.session_type).toBe('background');
      expect(body.org).toBe('acme-corp');
    });
  });

  describe('resumeSession', () => {
    it('sends POST to /api/sessions/:id/resume with prompt and dispatchBackend', async () => {
      mockOkResponse({ success: true });

      await client.resumeSession({
        session_id: 'sess-123',
        prompt: 'Continue the work',
        dispatch_backend: 'stratus',
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/sessions/sess-123/resume`);
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.prompt).toBe('Continue the work');
      expect(body.dispatchBackend).toBe('stratus');
    });

    it('omits dispatchBackend when not provided', async () => {
      mockOkResponse({ success: true });

      await client.resumeSession({
        session_id: 'sess-456',
        prompt: 'Resume without override',
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body).toEqual({ prompt: 'Resume without override' });
    });
  });

  describe('createSwarmRun', () => {
    it('serializes worker-only stratus swarm payloads', async () => {
      mockOkResponse({ plan: { runId: 'swarm-workers' } });

      await client.createSwarmRun({
        orgName: 'gal-run',
        objective: 'Dispatch Stratus issue workers',
        stratusPipeline: { enabled: false },
        workerDispatch: {
          enabled: true,
          maxSessions: 2,
          agent: 'gal-code',
          model: 'deepseek-v4-pro',
          dispatchBackend: 'stratus',
          runnerLabels: ['agents-standard-runc-x64', 'agents-medium-runc-x64'],
          issues: [
            {
              repository: 'acme-corp/infra',
              issueNumber: 3611,
              title: 'Restore Stratus shell runtime /api facade for operator login',
            },
          ],
        },
      });

      const [, options] = mockFetch.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.target).toEqual({
        provider: 'stratus',
        sandboxProvider: 'stratus',
        computeProfileId: 'deepseek-v4-pro',
        serverlessEndpointId: 'deepseek-v4-pro',
        desiredWorkers: 2,
        desiredComputeUnits: 1,
        ttlHours: 0.25,
        maxHourlyUsd: 5,
      });
      expect(body.workload.sandboxCount).toBe(2);
      expect(body.stratusPipeline).toEqual({ enabled: false });
      expect(body.workerDispatch).toEqual({
        enabled: true,
        maxSessions: 2,
        agent: 'gal-code',
        model: 'deepseek-v4-pro',
        runnerLabels: ['agents-standard-runc-x64', 'agents-medium-runc-x64'],
        dispatchBackend: 'stratus',
        issues: [
          {
            repository: 'acme-corp/infra',
            issueNumber: 3611,
            title: 'Restore Stratus shell runtime /api facade for operator login',
          },
        ],
      });
    });
  });

  describe('shared memory endpoints', () => {
    it('reads shared memory with optional repoScope, limit, and sessionId', async () => {
      mockOkResponse({ entries: [] });

      await client.readMemory({
        orgId: 'acme-corp',
        repoScope: 'org/repo',
        limit: 10,
        sessionId: 'sess-123',
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        `${BASE_URL}/api/orgs/acme-corp/memory?repoScope=org%2Frepo&limit=10&sessionId=sess-123`,
      );
      expect(options.method).toBe('GET');
    });

    it('writes shared memory entry via POST /api/orgs/:orgId/memory', async () => {
      mockOkResponse({ entry: { id: 'mem-1' } });

      await client.writeMemory({
        orgId: 'acme-corp',
        content: 'Run firestore emulator before integration tests.',
        source: 'developer',
        sessionId: 'sess-2',
        repoScope: 'org/repo',
        tags: ['testing', 'firestore'],
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${BASE_URL}/api/orgs/acme-corp/memory`);
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        content: 'Run firestore emulator before integration tests.',
        source: 'developer',
        sessionId: 'sess-2',
        repoScope: 'org/repo',
        tags: ['testing', 'firestore'],
      });
    });

    it('fetches peer activity via /api/orgs/:orgId/peer-activity', async () => {
      mockOkResponse({ activities: [] });

      await client.getPeerActivity({
        orgId: 'acme-corp',
        repoScope: 'org/repo',
        limit: 5,
      });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        `${BASE_URL}/api/orgs/acme-corp/peer-activity?repoScope=org%2Frepo&limit=5`,
      );
      expect(options.method).toBe('GET');
    });
  });

  describe('auth header', () => {
    it('includes Bearer token in Authorization header for every request', async () => {
      mockOkResponse({});

      await client.listSessions();

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe(`Bearer ${AUTH_TOKEN}`);
    });
  });

  describe('getSessionOutput', () => {
    it('fetches output from GAL API with lastN query param (#6520)', async () => {
      const outputData = {
        '-NzAA': { timestamp: '2026-01-01T00:00:00.000Z', tool_activity: { tool_name: 'Bash' } },
        '-NzBB': { timestamp: '2026-01-01T00:00:01.000Z', tool_activity: { tool_name: 'Read' } },
      };

      mockOkResponse({ output: outputData });

      const result = await client.getSessionOutput('sess-abc', 20);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain(`${BASE_URL}/api/sessions/sess-abc/output`);
      expect(url).toContain('lastN=20');
      expect(options.headers['Authorization']).toBe(`Bearer ${AUTH_TOKEN}`);
      expect(result).toEqual(outputData);
    });

    it('uses default lastN of 20 when not specified', async () => {
      mockOkResponse({ output: null });

      await client.getSessionOutput('sess-def');

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('lastN=20');
    });

    it('returns null when session has no output', async () => {
      mockOkResponse({ output: null });

      const result = await client.getSessionOutput('sess-empty', 20);

      expect(result).toBeNull();
    });

    it('swallows API errors and returns null (non-fatal for callers)', async () => {
      mockErrorResponse(403, 'Permission denied');

      const result = await client.getSessionOutput('sess-403', 20);
      expect(result).toBeNull();
    });

    it('URL-encodes the session ID', async () => {
      mockOkResponse({ output: null });

      await client.getSessionOutput('sess/with+special chars', 10);

      const [url] = mockFetch.mock.calls[0];
      expect(url).not.toContain('sess/with+special chars');
      expect(url).toContain(encodeURIComponent('sess/with+special chars'));
    });
  });
});
