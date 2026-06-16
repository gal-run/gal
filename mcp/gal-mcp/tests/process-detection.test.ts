/**
 * Tests for process detection logic (#4296)
 *
 * Validates:
 * - Process detection from sample session data
 * - Classification logic (automatable / hybrid / manual)
 * - Output format validation
 * - Edge cases (empty input, no matches, etc.)
 */

import { describe, it, expect } from 'vitest';
import {
  detectProcesses,
  type SessionEntry,
  type ProcessProposal,
  type DetectionResult,
  type AutomationPotential,
  type ProcessCategory,
} from '../src/tools/process-detection.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeToolEntry(toolName: string, input: Record<string, unknown> = {}): SessionEntry {
  return {
    timestamp: new Date().toISOString(),
    tool_activity: {
      tool_name: toolName,
      input,
    },
  };
}

function makeMessageEntry(assistantMessage?: string, userMessage?: string): SessionEntry {
  return {
    timestamp: new Date().toISOString(),
    ...(assistantMessage ? { assistant_message: assistantMessage } : {}),
    ...(userMessage ? { user_message: userMessage } : {}),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectProcesses', () => {
  describe('empty and invalid input', () => {
    it('returns empty result for empty entries array', () => {
      const result = detectProcesses([]);

      expect(result.entriesAnalyzed).toBe(0);
      expect(result.proposals).toEqual([]);
      expect(result.summary).toBe('No session entries to analyze.');
    });

    it('returns empty result for null-ish input', () => {
      const result = detectProcesses(null as unknown as SessionEntry[]);

      expect(result.entriesAnalyzed).toBe(0);
      expect(result.proposals).toEqual([]);
    });

    it('returns no proposals when entries have no matching patterns', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Read', { file_path: '/tmp/random.txt' }),
        makeMessageEntry('Hello, how are you?'),
      ];

      const result = detectProcesses(entries);

      expect(result.entriesAnalyzed).toBe(2);
      expect(result.proposals).toEqual([]);
      expect(result.summary).toContain('No repeatable processes detected');
    });
  });

  describe('output format validation', () => {
    it('returns a valid DetectionResult structure', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'pnpm install' }),
        makeToolEntry('Bash', { command: 'pnpm update typescript' }),
        makeToolEntry('Edit', { file_path: 'package.json', old_string: '"1.0.0"', new_string: '"1.1.0"' }),
      ];

      const result: DetectionResult = detectProcesses(entries);

      // Structure checks
      expect(typeof result.entriesAnalyzed).toBe('number');
      expect(Array.isArray(result.proposals)).toBe(true);
      expect(typeof result.summary).toBe('string');
    });

    it('proposals have all required fields', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'gcloud run deploy my-service' }),
      ];

      const result = detectProcesses(entries);
      expect(result.proposals.length).toBeGreaterThan(0);

      for (const proposal of result.proposals) {
        expect(typeof proposal.name).toBe('string');
        expect(proposal.name.length).toBeGreaterThan(0);
        expect(typeof proposal.description).toBe('string');
        expect(proposal.description.length).toBeGreaterThan(0);
        expect(['manual', 'automatable', 'hybrid']).toContain(proposal.automationPotential);
        expect(typeof proposal.category).toBe('string');
        expect(typeof proposal.confidence).toBe('number');
        expect(proposal.confidence).toBeGreaterThanOrEqual(0);
        expect(proposal.confidence).toBeLessThanOrEqual(1);
        expect(Array.isArray(proposal.matchedPatterns)).toBe(true);
        expect(proposal.matchedPatterns.length).toBeGreaterThan(0);
      }
    });

    it('proposals are sorted by confidence descending', () => {
      // Create entries that match multiple patterns
      const entries: SessionEntry[] = [
        // CI/CD (high confidence, minMatches=1)
        makeToolEntry('Bash', { command: 'edit .github/workflows/ci.yml' }),
        // Dependency (needs 2 matches)
        makeToolEntry('Bash', { command: 'pnpm install' }),
        makeToolEntry('Bash', { command: 'pnpm update' }),
        // Testing (needs 2 matches)
        makeToolEntry('Bash', { command: 'vitest run' }),
        makeToolEntry('Bash', { command: 'pnpm test' }),
      ];

      const result = detectProcesses(entries);
      expect(result.proposals.length).toBeGreaterThan(1);

      for (let i = 1; i < result.proposals.length; i++) {
        expect(result.proposals[i - 1].confidence).toBeGreaterThanOrEqual(
          result.proposals[i].confidence,
        );
      }
    });
  });

  describe('CI/CD detection', () => {
    it('detects GitHub Actions workflow modification', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Edit', { file_path: '.github/workflows/ci.yml' }),
      ];

      const result = detectProcesses(entries);

      const ciProposal = result.proposals.find((p) => p.category === 'ci-cd');
      expect(ciProposal).toBeDefined();
      expect(ciProposal!.name).toBe('CI/CD Workflow Update');
      expect(ciProposal!.automationPotential).toBe('hybrid');
      expect(ciProposal!.matchedPatterns).toContain('ci-workflow-update');
    });
  });

  describe('dependency management detection', () => {
    it('detects dependency update process (requires 2+ matches)', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'pnpm install' }),
        makeToolEntry('Bash', { command: 'pnpm update @types/node' }),
      ];

      const result = detectProcesses(entries);

      const depProposal = result.proposals.find((p) => p.category === 'dependency-management');
      expect(depProposal).toBeDefined();
      expect(depProposal!.automationPotential).toBe('automatable');
      expect(depProposal!.suggestedTrigger).toBe('weekly-schedule');
    });

    it('does NOT detect dependency management with only 1 match', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'pnpm install' }),
      ];

      const result = detectProcesses(entries);

      const depProposal = result.proposals.find((p) => p.category === 'dependency-management');
      expect(depProposal).toBeUndefined();
    });
  });

  describe('testing detection', () => {
    it('detects test suite management', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'vitest run' }),
        makeToolEntry('Edit', { file_path: 'src/utils.test.ts' }),
        makeMessageEntry('Fixing the failing test suite'),
      ];

      const result = detectProcesses(entries);

      const testProposal = result.proposals.find((p) => p.category === 'testing');
      expect(testProposal).toBeDefined();
      expect(testProposal!.automationPotential).toBe('hybrid');
    });
  });

  describe('deployment detection', () => {
    it('detects Cloud Run deployment', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'gcloud run deploy website-production --region us-central1' }),
      ];

      const result = detectProcesses(entries);

      const deployProposal = result.proposals.find((p) => p.category === 'deployment');
      expect(deployProposal).toBeDefined();
      expect(deployProposal!.automationPotential).toBe('automatable');
      expect(deployProposal!.suggestedTrigger).toBe('on-tag-push');
    });

    it('detects Docker-based deployment', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'docker build -t myapp .' }),
        makeMessageEntry('Deploying to production'),
      ];

      const result = detectProcesses(entries);

      const deployProposal = result.proposals.find((p) => p.category === 'deployment');
      expect(deployProposal).toBeDefined();
    });

    it('detects terraform apply', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'terraform plan' }),
        makeToolEntry('Bash', { command: 'terraform apply -auto-approve' }),
      ];

      const result = detectProcesses(entries);

      // Should match both deployment AND infrastructure
      const categories = result.proposals.map((p) => p.category);
      expect(categories).toContain('deployment');
      expect(categories).toContain('infrastructure');
    });
  });

  describe('security detection', () => {
    it('detects security audit from npm audit', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'npm audit fix' }),
      ];

      const result = detectProcesses(entries);

      const secProposal = result.proposals.find((p) => p.category === 'security');
      expect(secProposal).toBeDefined();
      expect(secProposal!.automationPotential).toBe('hybrid');
    });

    it('detects vulnerability discussion in messages', () => {
      const entries: SessionEntry[] = [
        makeMessageEntry('Found a critical vulnerability CVE-2026-1234 that needs patching'),
      ];

      const result = detectProcesses(entries);

      const secProposal = result.proposals.find((p) => p.category === 'security');
      expect(secProposal).toBeDefined();
    });
  });

  describe('release process detection', () => {
    it('detects git tag-based release', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'git tag v1.2.3' }),
      ];

      const result = detectProcesses(entries);

      const releaseProposal = result.proposals.find((p) => p.category === 'release');
      expect(releaseProposal).toBeDefined();
      expect(releaseProposal!.automationPotential).toBe('automatable');
    });

    it('detects npm publish release', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'pnpm publish --access restricted' }),
      ];

      const result = detectProcesses(entries);

      const releaseProposal = result.proposals.find((p) => p.category === 'release');
      expect(releaseProposal).toBeDefined();
    });
  });

  describe('classification accuracy', () => {
    it('classifies deployment as automatable', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'firebase deploy --only hosting' }),
      ];

      const result = detectProcesses(entries);
      const proposal = result.proposals.find((p) => p.category === 'deployment');
      expect(proposal?.automationPotential).toBe('automatable');
    });

    it('classifies testing as hybrid', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'vitest run' }),
        makeToolEntry('Edit', { file_path: 'src/foo.test.ts' }),
      ];

      const result = detectProcesses(entries);
      const proposal = result.proposals.find((p) => p.category === 'testing');
      expect(proposal?.automationPotential).toBe('hybrid');
    });

    it('classifies dependency update as automatable', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'pnpm update' }),
        makeToolEntry('Bash', { command: 'pnpm install' }),
      ];

      const result = detectProcesses(entries);
      const proposal = result.proposals.find((p) => p.category === 'dependency-management');
      expect(proposal?.automationPotential).toBe('automatable');
    });
  });

  describe('confidence scoring', () => {
    it('assigns higher confidence when more entries match', () => {
      const fewMatches: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'pnpm install' }),
        makeToolEntry('Bash', { command: 'pnpm update' }),
      ];

      const manyMatches: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'pnpm install' }),
        makeToolEntry('Bash', { command: 'pnpm update' }),
        makeToolEntry('Bash', { command: 'pnpm add zod' }),
        makeToolEntry('Edit', { file_path: 'package.json' }),
      ];

      const fewResult = detectProcesses(fewMatches);
      const manyResult = detectProcesses(manyMatches);

      const fewDep = fewResult.proposals.find((p) => p.category === 'dependency-management');
      const manyDep = manyResult.proposals.find((p) => p.category === 'dependency-management');

      expect(fewDep).toBeDefined();
      expect(manyDep).toBeDefined();
      expect(manyDep!.confidence).toBeGreaterThan(fewDep!.confidence);
    });

    it('confidence is capped at confidenceWeight', () => {
      // Create many matching entries to ensure cap
      const entries: SessionEntry[] = Array.from({ length: 20 }, (_, i) =>
        makeToolEntry('Bash', { command: `pnpm install dep-${i}` }),
      );

      const result = detectProcesses(entries);
      const depProposal = result.proposals.find((p) => p.category === 'dependency-management');

      expect(depProposal).toBeDefined();
      expect(depProposal!.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('step inference', () => {
    it('infers steps from matching entries', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'gcloud run deploy my-service --region us-central1' }),
        makeToolEntry('Bash', { command: 'docker build -t my-service .' }),
      ];

      const result = detectProcesses(entries);
      const deployProposal = result.proposals.find((p) => p.category === 'deployment');

      expect(deployProposal).toBeDefined();
      expect(deployProposal!.steps).toBeDefined();
      expect(deployProposal!.steps!.length).toBeGreaterThan(0);
    });

    it('caps steps at 10', () => {
      const entries: SessionEntry[] = Array.from({ length: 15 }, (_, i) =>
        makeToolEntry('Bash', { command: `pnpm install package-${i}` }),
      );

      const result = detectProcesses(entries);
      const depProposal = result.proposals.find((p) => p.category === 'dependency-management');

      expect(depProposal).toBeDefined();
      if (depProposal?.steps) {
        expect(depProposal.steps.length).toBeLessThanOrEqual(10);
      }
    });
  });

  describe('summary generation', () => {
    it('includes entry count in summary', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'echo hello' }),
        makeToolEntry('Bash', { command: 'echo world' }),
      ];

      const result = detectProcesses(entries);
      expect(result.summary).toContain('2 session entries');
    });

    it('includes classification counts in summary when processes found', () => {
      const entries: SessionEntry[] = [
        // Automatable: deployment
        makeToolEntry('Bash', { command: 'gcloud run deploy app' }),
        // Hybrid: CI/CD
        makeToolEntry('Edit', { file_path: '.github/workflows/deploy.yml' }),
      ];

      const result = detectProcesses(entries);
      expect(result.summary).toContain('Detected');
      expect(result.summary).toContain('process');
    });

    it('names the top process in summary', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'gcloud run deploy website --region us-central1' }),
      ];

      const result = detectProcesses(entries);
      expect(result.proposals.length).toBeGreaterThan(0);
      expect(result.summary).toContain(result.proposals[0].name);
    });
  });

  describe('multi-pattern detection', () => {
    it('detects multiple distinct processes in a single session', () => {
      const entries: SessionEntry[] = [
        // Deployment
        makeToolEntry('Bash', { command: 'gcloud run deploy app --region us-central1' }),
        // CI/CD
        makeToolEntry('Edit', { file_path: '.github/workflows/ci.yml' }),
        // Testing
        makeToolEntry('Bash', { command: 'vitest run' }),
        makeToolEntry('Bash', { command: 'pnpm test' }),
        // Dependency
        makeToolEntry('Bash', { command: 'pnpm install zod' }),
        makeToolEntry('Bash', { command: 'pnpm update typescript' }),
      ];

      const result = detectProcesses(entries);

      const categories = result.proposals.map((p) => p.category);
      expect(categories).toContain('deployment');
      expect(categories).toContain('ci-cd');
      expect(categories).toContain('testing');
      expect(categories).toContain('dependency-management');
    });
  });

  describe('documentation detection', () => {
    it('detects documentation update from file paths', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Edit', { file_path: 'README.md' }),
        makeToolEntry('Edit', { file_path: 'docs/architecture.md' }),
      ];

      const result = detectProcesses(entries);

      const docProposal = result.proposals.find((p) => p.category === 'documentation');
      expect(docProposal).toBeDefined();
      expect(docProposal!.automationPotential).toBe('hybrid');
    });
  });

  describe('refactoring detection', () => {
    it('detects refactoring from messages', () => {
      const entries: SessionEntry[] = [
        makeMessageEntry('Refactoring the authentication module'),
        makeToolEntry('Edit', { file_path: 'src/auth.ts' }),
        makeMessageEntry('Extracting function to improve readability'),
        makeToolEntry('Edit', { file_path: 'src/utils.ts' }),
      ];

      const result = detectProcesses(entries);

      const refactorProposal = result.proposals.find((p) => p.category === 'refactoring');
      expect(refactorProposal).toBeDefined();
      expect(refactorProposal!.automationPotential).toBe('hybrid');
    });
  });

  describe('data migration detection', () => {
    it('detects data migration from tool input', () => {
      const entries: SessionEntry[] = [
        makeToolEntry('Bash', { command: 'npx prisma migrate deploy' }),
      ];

      const result = detectProcesses(entries);

      const migrationProposal = result.proposals.find((p) => p.category === 'data-migration');
      expect(migrationProposal).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Integration-style test: MCP tool handler for gal_detect_processes
// ---------------------------------------------------------------------------

describe('gal_detect_processes tool handler', () => {
  it('is registered as an MCP tool when internalOnly is true', async () => {
    const { vi } = await import('vitest');

    const toolHandlers = new Map<string, Function>();
    const mockServer = {
      tool: vi.fn((...args: unknown[]) => {
        const name = args[0] as string;
        const handler = (args.length === 3 ? args[2] : args[3]) as Function;
        toolHandlers.set(name, handler);
      }),
    };

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
      enqueueWorkItems: vi.fn(),
      pickConfigByAi: vi.fn(),
      reportGovernanceOverride: vi.fn(),
    };

    vi.resetModules();
    const { registerTools } = await import('../src/tools.js');
    registerTools(mockServer as any, mockApiClient as any, { internalOnly: true });

    expect(toolHandlers.has('gal_detect_processes')).toBe(true);

    // Test handler with raw entries
    const handler = toolHandlers.get('gal_detect_processes')!;
    const result = await handler({
      entries: [
        { tool_activity: { tool_name: 'Bash', input: { command: 'gcloud run deploy app' } } },
      ],
    });

    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.entriesAnalyzed).toBe(1);
    expect(parsed.proposals.length).toBeGreaterThan(0);
    expect(parsed.proposals[0].category).toBe('deployment');
  });

  it('returns error when neither sessionId nor entries provided', async () => {
    const { vi } = await import('vitest');

    const toolHandlers = new Map<string, Function>();
    const mockServer = {
      tool: vi.fn((...args: unknown[]) => {
        const name = args[0] as string;
        const handler = (args.length === 3 ? args[2] : args[3]) as Function;
        toolHandlers.set(name, handler);
      }),
    };

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
      enqueueWorkItems: vi.fn(),
      pickConfigByAi: vi.fn(),
      reportGovernanceOverride: vi.fn(),
    };

    vi.resetModules();
    const { registerTools } = await import('../src/tools.js');
    registerTools(mockServer as any, mockApiClient as any, { internalOnly: true });

    const handler = toolHandlers.get('gal_detect_processes')!;
    const result = await handler({});

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Provide either sessionId or entries');
  });
});
