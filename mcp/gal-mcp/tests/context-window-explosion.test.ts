/**
 * Regression test for #2157: Context Window Explosion with GAL MCP Server Tools
 *
 * This test reproduces the bug where gal_get_session_output and gal_dispatch_agent
 * return massive payloads that blow up the LLM context window in Gemini CLI.
 *
 * TDD Red Phase: This test should FAIL until truncation is implemented.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GalApiClient } from '../src/api-client.js';

// Capture tool handlers registered via server.tool()
const toolHandlers = new Map<string, Function>();

const mockServer = {
  tool: vi.fn((name: string, _desc: string, _schema: unknown, handler: Function) => {
    toolHandlers.set(name, handler);
  }),
};

// Mock the api client
const mockApiClient = {
  createSession: vi.fn(),
  dispatchAgent: vi.fn(),
  getSessionOutput: vi.fn(),
  getSessionMetadata: vi.fn(),
} as unknown as GalApiClient;

// Load and register tools
async function loadAndRegister() {
  toolHandlers.clear();
  mockServer.tool.mockClear();
  vi.resetModules();

  const { registerTools } = await import('../src/tools.js');
  registerTools(mockServer as any, mockApiClient, { internalOnly: true });
}

describe('[#2157] Context Window Explosion Bug', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadAndRegister();
  });

  describe('gal_get_session_output', () => {
    it('REPRO: returns massive payload without truncation (bug)', async () => {
      // Simulate realistic large output from a background agent session
      // Each entry can contain large bash output, file reads, etc.
      const LARGE_FILE_CONTENT = 'x'.repeat(50000); // 50K chars simulating a large file read
      const LARGE_BASH_OUTPUT = 'log line\n'.repeat(5000); // 5K lines of bash output

      const rtdbData = {
        '-NzAA': {
          timestamp: '2026-01-01T00:00:00.000Z',
          tool_activity: {
            tool_name: 'Read',
            input: { file_path: '/app/large-file.ts' },
            toolResult: {
              content: [{ type: 'text', text: LARGE_FILE_CONTENT }],
            },
          },
        },
        '-NzBB': {
          timestamp: '2026-01-01T00:00:01.000Z',
          tool_activity: {
            tool_name: 'Bash',
            input: { command: 'pnpm test' },
            toolResult: {
              content: [{ type: 'text', text: LARGE_BASH_OUTPUT }],
            },
          },
        },
        '-NzCC': {
          timestamp: '2026-01-01T00:00:02.000Z',
          tool_activity: {
            tool_name: 'Grep',
            input: { pattern: 'export', path: 'src' },
            toolResult: {
              content: [{ type: 'text', text: 'export function foo...\n'.repeat(1000) }],
            },
          },
        },
      };

      (mockApiClient.getSessionOutput as ReturnType<typeof vi.fn>).mockResolvedValueOnce(rtdbData);

      const handler = toolHandlers.get('gal_get_session_output')!;
      const result = await handler({ sessionId: 'sess-large', lastN: 20 });

      expect(result.isError).toBeUndefined();
      const responseText = result.content[0].text;
      const responseSize = responseText.length;

      // BUG REPRODUCTION: Response is massive (>100K chars)
      // This proves the context window explosion bug exists
      console.log(`[#2157 BUG] Response size: ${responseSize} chars`);
      console.log(`[#2157 BUG] Estimated tokens: ~${Math.ceil(responseSize / 4)}`);

      // TEST FAILS HERE (proves bug exists):
      // Response should be under 10K chars after truncation
      // Currently it's ~105K chars (no truncation implemented)
      expect(responseSize).toBeLessThan(10000);
      // ⬆️ This assertion will FAIL until fix is implemented (TDD Red)
    });

    it('FIX: truncates large text fields to prevent context explosion', async () => {
      // Same large data as above
      const LARGE_FILE_CONTENT = 'x'.repeat(50000);
      const LARGE_BASH_OUTPUT = 'log line\n'.repeat(5000);

      const rtdbData = {
        '-NzAA': {
          timestamp: '2026-01-01T00:00:00.000Z',
          tool_activity: {
            tool_name: 'Read',
            input: { file_path: '/app/large-file.ts' },
            toolResult: {
              content: [{ type: 'text', text: LARGE_FILE_CONTENT }],
            },
          },
        },
        '-NzBB': {
          timestamp: '2026-01-01T00:00:01.000Z',
          tool_activity: {
            tool_name: 'Bash',
            input: { command: 'pnpm test' },
            toolResult: {
              content: [{ type: 'text', text: LARGE_BASH_OUTPUT }],
            },
          },
        },
      };

      (mockApiClient.getSessionOutput as ReturnType<typeof vi.fn>).mockResolvedValueOnce(rtdbData);

      const handler = toolHandlers.get('gal_get_session_output')!;
      const result = await handler({ sessionId: 'sess-truncated', lastN: 20 });

      expect(result.isError).toBeUndefined();
      const responseText = result.content[0].text;
      const parsed = JSON.parse(responseText);

      // EXPECTED BEHAVIOR (after fix):
      // 1. Response size is reasonable (<10K chars total)
      expect(responseText.length).toBeLessThan(10000);

      // 2. Large text fields are truncated to max 500 chars + truncation indicator
      const entry1 = parsed.entries.find((e: any) => e.key === '-NzAA');
      const entry2 = parsed.entries.find((e: any) => e.key === '-NzBB');

      // Truncated text is 500 chars + "...[truncated]" = 514 chars
      expect(entry1.tool_activity.toolResult.content[0].text.length).toBeLessThanOrEqual(520);
      expect(entry2.tool_activity.toolResult.content[0].text.length).toBeLessThanOrEqual(520);

      // 3. Truncation indicator added
      expect(entry1.tool_activity.toolResult.content[0].text).toContain('...[truncated]');
      expect(entry2.tool_activity.toolResult.content[0].text).toContain('...[truncated]');
    });

    it('hard cap: response never exceeds 100K chars even with many entries', async () => {
      // 300 entries each with 500-char content → after per-field truncation still
      // 300 × ~500 chars of content plus JSON overhead ≈ 150K+ chars total.
      // The hard cap (MAX_TOTAL_RESPONSE_CHARS = 100_000) must clamp this down.
      // Issue #5927: test-pyramid epic regression guard.
      const ENTRY_CONTENT = 'a'.repeat(500);
      const rtdbData: Record<string, unknown> = {};
      for (let i = 0; i < 300; i++) {
        const key = `-N${String(i).padStart(4, '0')}`;
        rtdbData[key] = {
          timestamp: `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`,
          tool_activity: {
            tool_name: 'Bash',
            input: { command: `echo ${i}` },
            toolResult: {
              content: [{ type: 'text', text: ENTRY_CONTENT }],
            },
          },
        };
      }

      (mockApiClient.getSessionOutput as ReturnType<typeof vi.fn>).mockResolvedValueOnce(rtdbData);

      const handler = toolHandlers.get('gal_get_session_output')!;
      const result = await handler({ sessionId: 'sess-hardcap', lastN: 300 });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text.length).toBeLessThanOrEqual(100_000);
    });

    it('FIX: fullOutput param bypasses truncation when needed', async () => {
      const LARGE_CONTENT = 'x'.repeat(50000);
      const rtdbData = {
        '-NzAA': {
          timestamp: '2026-01-01T00:00:00.000Z',
          tool_activity: {
            tool_name: 'Read',
            input: { file_path: '/app/large-file.ts' },
            toolResult: {
              content: [{ type: 'text', text: LARGE_CONTENT }],
            },
          },
        },
      };

      (mockApiClient.getSessionOutput as ReturnType<typeof vi.fn>).mockResolvedValueOnce(rtdbData);

      const handler = toolHandlers.get('gal_get_session_output')!;
      const result = await handler({ sessionId: 'sess-full', lastN: 20, fullOutput: true });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);

      // With fullOutput=true, no truncation should occur
      const entry = parsed.entries[0];
      expect(entry.tool_activity.toolResult.content[0].text.length).toBe(50000);
      expect(entry.tool_activity.toolResult.content[0].text).not.toContain('...[truncated]');
    });
  });

  describe('gal_dispatch_agent', () => {
    it('VERIFIED: already returns minimal response (no bug)', async () => {
      const LARGE_PROMPT = 'Fix the following issues:\n' + 'Issue description line\n'.repeat(1000);

      const apiResponse = {
        id: 'sess-dispatch-1',
        sessionId: 'sess-dispatch-1',
        status: 'PENDING',
        dashboardUrl: 'https://app.gal.run/sessions/sess-dispatch-1',
        prompt: LARGE_PROMPT, // API returns this, but tool filters it out
        project_context: 'owner/repo',
        agent: 'claude',
        metadata: { large: 'x'.repeat(5000) }, // API returns this, but tool filters it out
      };

      (mockApiClient.dispatchAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce(apiResponse);

      const handler = toolHandlers.get('gal_dispatch_agent')!;
      const result = await handler({
        agent: 'claude',
        prompt: LARGE_PROMPT,
        project_context: 'owner/repo',
      });

      expect(result.isError).toBeUndefined();
      const responseText = result.content[0].text;
      const responseSize = responseText.length;

      console.log(`[#2157] gal_dispatch_agent response size: ${responseSize} chars (already minimal)`);

      // VERIFIED: gal_dispatch_agent already returns minimal response
      // No fix needed - tool was already correct
      const parsed = JSON.parse(responseText);
      expect(parsed.sessionId).toBe('sess-dispatch-1');
      expect(parsed.status).toBe('PENDING');
      expect(parsed.dashboardUrl).toBe('https://app.gal.run/sessions/sess-dispatch-1');

      // Response does NOT include large fields
      expect(responseText).not.toContain(LARGE_PROMPT);
    });

    it('FIX: returns minimal response (sessionId, status, dashboardUrl only)', async () => {
      const LARGE_PROMPT = 'Fix the following issues:\n' + 'Issue description line\n'.repeat(1000);

      const apiResponse = {
        id: 'sess-dispatch-2',
        sessionId: 'sess-dispatch-2',
        status: 'PENDING',
        dashboardUrl: 'https://app.gal.run/sessions/sess-dispatch-2',
        prompt: LARGE_PROMPT,
        project_context: 'owner/repo',
        agent: 'claude',
        metadata: { large: 'x'.repeat(5000) },
      };

      (mockApiClient.dispatchAgent as ReturnType<typeof vi.fn>).mockResolvedValueOnce(apiResponse);

      const handler = toolHandlers.get('gal_dispatch_agent')!;
      const result = await handler({
        agent: 'claude',
        prompt: LARGE_PROMPT,
        project_context: 'owner/repo',
      });

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);

      // EXPECTED: Only essential fields in response
      expect(parsed).toHaveProperty('sessionId');
      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('dashboardUrl');

      // EXPECTED: Large fields NOT echoed back
      expect(parsed).not.toHaveProperty('prompt');
      expect(parsed).not.toHaveProperty('project_context');
      expect(parsed).not.toHaveProperty('agent');
      expect(parsed).not.toHaveProperty('metadata');

      // Response should be tiny (<1K chars)
      const responseSize = result.content[0].text.length;
      expect(responseSize).toBeLessThan(1000);
    });
  });
});
