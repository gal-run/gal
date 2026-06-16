/**
 * Session & Agent Coordination Tools
 *
 * These tools are gated behind the internalOnly flag, derived from org audienceTier
 * (billing-backed) + Remote Config.
 * They provide multi-agent coordination capabilities:
 * - Session registration and heartbeat
 * - Task and branch claiming
 * - Progress reporting and directives
 * - Agent dispatch
 * - Work item management
 * - Pre-dispatch capability analysis (gal_analyze_dispatch)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { GalApiClient, type DispatchRule, type SetDispatchRulesPayload } from '../api-client.js';
import { createWorkspaceParamSchema, resolveWorkspace } from '../workspace-context.js';
import { detectProcesses, type SessionEntry } from './process-detection.js';

// ---------------------------------------------------------------------------
// Inline capability analysis (mirrors apps/cli/src/utils/capability-analyzer.ts)
// Duplicated here because @gal/mcp does not depend
// on @gal/cli. Keep patterns in sync with the CLI module.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Inline work-item qualification keywords (mirrors session-capability-analyzer.ts)
// Used by gal_analyze_dispatch to detect human-required signals.
// ---------------------------------------------------------------------------

/** Keywords that indicate human action is needed (sync with session-capability-analyzer.ts) */
const HUMAN_REQUIRED_KEYWORDS = [
  'meeting', 'call', 'discuss', 'decision', 'approval needed',
  'manual', 'phone', 'vendor', 'negotiate', 'sign', 'review with',
];

/** Labels that gate on human involvement (sync with session-capability-analyzer.ts) */
const HUMAN_REQUIRED_LABELS = [
  'needs-human', 'gate:human-required', 'gate:blocked',
];

interface WorkItemQualificationResult {
  qualified: boolean;
  reason?: string;
  signals: string[];
}

/**
 * Lightweight pre-flight qualification for the analyze_dispatch MCP tool.
 *
 * Mirrors the humanRequired check from qualifyWorkItem in
 * session-capability-analyzer.ts. Only checks keyword/label signals since
 * the MCP tool doesn't have access to server-side config or session state.
 */
function qualifyWorkItemForDispatch(params: {
  title: string;
  body: string;
  labels?: string[];
}): WorkItemQualificationResult {
  const { title, body, labels = [] } = params;
  const textLower = `${title} ${body}`.toLowerCase();
  const signals: string[] = [];

  for (const keyword of HUMAN_REQUIRED_KEYWORDS) {
    if (textLower.includes(keyword)) {
      signals.push(`keyword:${keyword}`);
    }
  }

  for (const label of HUMAN_REQUIRED_LABELS) {
    if (labels.includes(label)) {
      signals.push(`label:${label}`);
    }
  }

  const qualified = signals.length === 0;
  return {
    qualified,
    reason: qualified ? undefined : `human action required (${signals.join(', ')})`,
    signals,
  };
}

type WarningSeverity = 'info' | 'warning' | 'error';
type CapabilityCategory =
  | 'github_workflows'
  | 'github_secrets'
  | 'branch_protection'
  | 'deployments'
  | 'npm_publish'
  | 'elevated_permissions'
  | 'browser_profile'
  | 'cloud_access'
  | 'environment_secrets';

interface CapabilityWarning {
  ruleId: string;
  severity: WarningSeverity;
  title: string;
  message: string;
  recommendation: string;
}

interface DispatchAnalysis {
  hasErrors: boolean;
  hasWarnings: boolean;
  warnings: CapabilityWarning[];
  requiredCapabilities: CapabilityCategory[];
  summary: string;
}

interface AnalyzerRule {
  ruleId: string;
  category: CapabilityCategory;
  severity: WarningSeverity;
  patterns: RegExp[];
  title: string;
  message: string;
  recommendation: string;
}

const CAPABILITY_RULES: AnalyzerRule[] = [
  {
    ruleId: 'GITHUB_WORKFLOW_MODIFICATION',
    category: 'github_workflows',
    severity: 'warning',
    patterns: [/\.github[\\/]workflows/i, /github\s+actions?/i, /workflow\s+file/i, /ci[\s\-_]?cd/i, /modify\s+workflow/i, /update\s+workflow/i],
    title: 'GitHub Actions workflow modification detected',
    message: 'The prompt references GitHub Actions workflow files. Modifying `.github/workflows/` requires write access to the repository and may trigger CI runs.',
    recommendation: 'Ensure the session token has `contents: write` and `actions: write` permissions. Prefer using a GitHub App token with `workflows` scope rather than a personal access token.',
  },
  {
    ruleId: 'GITHUB_TOKEN_OR_SECRETS',
    category: 'github_secrets',
    severity: 'warning',
    patterns: [/GITHUB_TOKEN/i, /secrets\.GITHUB/i, /repository\s+secret/i, /environment\s+secret/i, /actions\s+secret/i, /create\s+secret/i, /update\s+secret/i, /set\s+secret/i],
    title: 'GitHub Secrets or GITHUB_TOKEN access detected',
    message: 'The prompt references GitHub Secrets or GITHUB_TOKEN. Managing secrets requires `secrets` write permission. Leaking secrets in logs is a critical security risk.',
    recommendation: 'Restrict the agent to the minimum required permissions. Never print secrets to stdout. Use GCP Secret Manager or GitHub Secrets — never commit secrets to the repository.',
  },
  {
    ruleId: 'BRANCH_PROTECTION_RULESET',
    category: 'branch_protection',
    severity: 'warning',
    patterns: [/branch\s+protection/i, /ruleset/i, /bypass\s+(branch|protection|rule)/i, /force[\s\-]push/i, /--force\s+push/i, /push\s+--force/i, /admin\s+bypass/i],
    title: 'Branch protection or ruleset bypass detected',
    message: 'The prompt references branch protection rules, rulesets, or force pushes. Bypassing branch protection requires admin or bypass-actor permissions.',
    recommendation: 'Avoid force-pushing to protected branches. If required, ensure the GitHub App or token has been explicitly granted bypass permissions.',
  },
  {
    ruleId: 'PRODUCTION_DEPLOYMENT',
    category: 'deployments',
    severity: 'warning',
    patterns: [/deploy\s+(to\s+)?production/i, /production\s+deploy/i, /release\s+to\s+prod/i, /\bprod\b.*\bdeploy/i, /\bdeploy\b.*\bprod/i, /gcloud\s+run\s+deploy/i, /docker\s+push/i, /kubernetes.*deploy/i, /k8s.*deploy/i, /cloud\s+run.*deploy/i],
    title: 'Production deployment detected',
    message: 'The prompt includes a production deployment operation. Production deploys require elevated cloud permissions and may impact live users.',
    recommendation: 'Ensure the session has appropriate GCP / cloud IAM roles. Run a dry-run or staging deploy first to validate the change.',
  },
  {
    ruleId: 'NPM_PUBLISH',
    category: 'npm_publish',
    severity: 'warning',
    patterns: [/npm\s+publish/i, /pnpm\s+publish/i, /yarn\s+publish/i, /publish\s+to\s+npm/i, /publish\s+(the\s+)?package/i, /npm\s+release/i, /NPM_TOKEN/i, /NODE_AUTH_TOKEN/i],
    title: 'npm package publish detected',
    message: 'The prompt includes an npm publish operation. Publishing requires a valid npm token with publish rights to the target package scope.',
    recommendation: 'Ensure NPM_TOKEN or NODE_AUTH_TOKEN is set in the runner environment. Verify the package version has been bumped before publishing.',
  },
  {
    ruleId: 'ELEVATED_PERMISSIONS',
    category: 'elevated_permissions',
    severity: 'info',
    patterns: [/--admin/i, /admin\s+merge/i, /bypass\s+review/i, /bypass\s+required\s+review/i, /override\s+review/i, /merge\s+without\s+review/i, /skip\s+(ci|checks)/i, /\[skip\s+ci\]/i, /no-verify/i, /--no-verify/i, /force\s+merge/i],
    title: 'Elevated permissions or CI bypass detected',
    message: 'The prompt references elevated permissions (admin merge, bypass reviews, skip CI checks). These operations should only be performed by authorised users in exceptional circumstances.',
    recommendation: 'Document the reason for the elevated operation. Prefer the normal PR review flow.',
  },
  {
    ruleId: 'BROWSER_PROFILE_REQUIRED',
    category: 'browser_profile',
    severity: 'warning',
    patterns: [/playwright/i, /puppeteer/i, /\bselenium\b/i, /\bcypress\b/i, /chrome[\s-]?profile/i, /browser[\s-]?profile/i, /headed\s+mode/i, /headed\s+browser/i, /headless\s*=\s*false/i, /visible\s+browser/i, /browser\s+automation/i, /chrome[\s-]?extension\s+test/i, /--headed/i, /user[\s-]?data[\s-]?dir/i],
    title: 'Browser or headed-profile access detected',
    message: 'The prompt references browser automation or a headed browser profile. Background agent runners operate in headless environments without display servers.',
    recommendation: 'Use headless mode for Playwright/Puppeteer (`headless: true`). If headed mode is required, ensure the runner image includes Xvfb and browser dependencies.',
  },
  {
    ruleId: 'CLOUD_ACCESS_REQUIRED',
    category: 'cloud_access',
    severity: 'warning',
    patterns: [/\bfirestore\b/i, /firebase[\s-]?admin/i, /firebase[\s-]?emulator/i, /\bgcloud\b/i, /google[\s-]?cloud/i, /cloud\s+run/i, /cloud\s+functions?/i, /cloud\s+storage/i, /\bbigquery\b/i, /\bgcs:\/\//i, /gs:\/\//i, /GCP_SA_KEY/i, /GOOGLE_APPLICATION_CREDENTIALS/i, /GOOGLE_CLOUD_PROJECT/i, /application[\s-]?default[\s-]?credentials/i, /service[\s-]?account[\s-]?key/i, /FIREBASE_TOKEN/i, /FIREBASE_PROJECT/i, /firebase\s+deploy/i, /\brtdb\b/i, /realtime[\s-]?database/i, /\baws\b\s+(s3|lambda|ec2|iam|sqs|sns|ecs|eks|rds|dynamodb)/i, /AWS_ACCESS_KEY/i, /AWS_SECRET_ACCESS_KEY/i, /AWS_SESSION_TOKEN/i],
    title: 'Cloud service or Firebase access detected',
    message: 'The prompt references Firebase, GCP, or cloud services that require authentication credentials. Background agent runners do not have implicit cloud access.',
    recommendation: 'Ensure the approved config includes an `environment.secrets` entry for the required credentials (e.g. GCP_SA_KEY, GOOGLE_APPLICATION_CREDENTIALS).',
  },
  {
    ruleId: 'ENVIRONMENT_SECRETS_REFERENCED',
    category: 'environment_secrets',
    severity: 'warning',
    patterns: [/environment\.secrets/i, /environment\.auth/i, /approved[\s-]?config.*secret/i, /secret[\s-]?manager/i, /\bvault\b.*secret/i, /secret.*\bvault\b/i, /inject\s+.{0,30}secret/i, /secret\s+injection/i, /rotate\s+.{0,30}(key|token|secret|credential)/i, /(key|token|secret|credential)\s+rotation/i, /\bSSH_KEY\b/i, /\bSSH_PRIVATE_KEY\b/i, /\bAPI_KEY\b/, /\bAPI_SECRET\b/, /\bAUTH_TOKEN\b/i, /\bACCESS_TOKEN\b/, /\bSECRET_KEY\b/, /\bPRIVATE_KEY\b/i, /\bENCRYPTION_KEY\b/i, /\bDATABASE_URL\b.*password/i, /password.*\bDATABASE_URL\b/i, /\.env\.production/i, /\.env\.secret/i],
    title: 'Environment secrets or auth configuration referenced',
    message: 'The prompt references environment secrets, auth configuration, or sensitive credential material. The approved config must declare these for the runner to resolve them.',
    recommendation: 'Verify the approved config includes the referenced secrets under `environment.secrets` or `environment.auth`. Use `gal_set_approved_config` to add missing entries before dispatching.',
  },
];

function runCapabilityAnalysis(input: { name?: string; prompt?: string; projectContext?: string; agent?: string }): DispatchAnalysis {
  const text = [input.name ?? '', input.prompt ?? ''].join('\n');
  const warnings: CapabilityWarning[] = [];
  const caps = new Set<CapabilityCategory>();

  for (const rule of CAPABILITY_RULES) {
    if (rule.patterns.some((p) => p.test(text))) {
      caps.add(rule.category);
      warnings.push({ ruleId: rule.ruleId, severity: rule.severity, title: rule.title, message: rule.message, recommendation: rule.recommendation });
    }
  }

  const order: Record<WarningSeverity, number> = { error: 0, warning: 1, info: 2 };
  warnings.sort((a, b) => order[a.severity] - order[b.severity]);

  const hasErrors = warnings.some((w) => w.severity === 'error');
  const hasWarnings = warnings.some((w) => w.severity === 'warning');
  const requiredCapabilities = Array.from(caps);

  let summary: string;
  if (warnings.length === 0) {
    summary = 'No capability issues detected. Safe to dispatch.';
  } else {
    const ec = warnings.filter((w) => w.severity === 'error').length;
    const wc = warnings.filter((w) => w.severity === 'warning').length;
    const ic = warnings.filter((w) => w.severity === 'info').length;
    const parts = [ec && `${ec} error${ec > 1 ? 's' : ''}`, wc && `${wc} warning${wc > 1 ? 's' : ''}`, ic && `${ic} info${ic > 1 ? 's' : ''}`].filter(Boolean);
    const capList = requiredCapabilities.map((c) => c.replace(/_/g, ' ')).join(', ');
    summary = `Detected ${parts.join(', ')}: required capabilities [${capList}]. Review warnings before dispatching.`;
  }

  return { hasErrors, hasWarnings, warnings, requiredCapabilities, summary };
}

/** Module-level session state */
let storedSessionId: string | null = null;
let installationId: string = 'unknown';

export function getStoredSessionId(): string | null {
  return storedSessionId;
}

/**
 * Hard cap on total response size (characters) returned by gal_get_session_output.
 * Prevents context window explosion even when many truncated entries accumulate
 * (e.g. 500 entries x 500 chars each = 250K chars, still over the LLM limit).
 * test-pyramid epic regression test.
 */
export const MAX_TOTAL_RESPONSE_CHARS = 100_000;

/**
 * Truncate large text fields to prevent context window explosion
 * @param text Text to truncate
 * @param maxChars Maximum character limit (default: 500)
 * @returns Truncated text with indicator if truncation occurred
 */
function truncateText(text: string | undefined | null, maxChars: number = 500): string {
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '...[truncated]';
}

/**
 * Recursively truncate large text fields in an object
 * @param obj Object to process
 * @param maxChars Maximum character limit for text fields
 * @returns Processed object with truncated text fields
 */
function truncateLargeFields(obj: any, maxChars: number = 500): any {
  if (typeof obj === 'string') {
    return truncateText(obj, maxChars);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => truncateLargeFields(item, maxChars));
  }
  if (obj && typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = truncateLargeFields(value, maxChars);
    }
    return result;
  }
  return obj;
}

export function registerSessionTools(server: McpServer, apiClient: GalApiClient): void {
  // --- gal_register_session ---
  server.tool(
    'gal_register_session',
    'Register this Claude Code session with GAL for dashboard visibility and coordination',
    {
      agent: z.string().describe('Agent identifier, e.g. "claude"'),
      prompt: z.string().describe('What this session is working on'),
      project_context: z.string().optional().describe('Repository context, e.g. "owner/repo"'),
      session_type: z.enum(['local', 'background', 'orchestrator']).optional().describe('Session type (default: local)'),
    },
    async ({ agent, prompt, project_context, session_type }) => {
      try {
        const result = await apiClient.createSession({
          agent,
          prompt,
          project_context,
          session_type: session_type ?? 'local',
        }) as Record<string, unknown>;

        const sessionId = (result.id as string) ?? (result.sessionId as string) ?? null;
        storedSessionId = sessionId;
        installationId = (result.installationId as string) ?? storedSessionId ?? 'unknown';

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              sessionId,
              status: result.status ?? 'registered',
              dashboardUrl: result.dashboardUrl ?? null,
            }, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error registering session: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_heartbeat ---
  server.tool(
    'gal_heartbeat',
    'Send heartbeat to keep session alive on the GAL dashboard. Call periodically (every 30-60 seconds) to prevent session from being marked stale.',
    {
      status: z.string().optional().describe('Current status description'),
      currentTask: z.string().optional().describe('What you are currently doing'),
    },
    async ({ status, currentTask }) => {
      try {
        if (!storedSessionId) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No session registered. Call gal_register_session first.' }],
            isError: true,
          };
        }
        await apiClient.heartbeat(storedSessionId, { status, currentTask });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, sessionId: storedSessionId }, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error sending heartbeat: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_list_sessions ---
  server.tool(
    'gal_list_sessions',
    'List all active GAL sessions (local and background) for the organization',
    {
      orgId: z.string().optional().describe('Filter by organization ID'),
    },
    async ({ orgId }) => {
      try {
        const sessions = await apiClient.listSessions(orgId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(sessions, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error listing sessions: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_log_event ---
  server.tool(
    'gal_log_event',
    'Log a telemetry event to the GAL data pipeline for analytics and the data flywheel',
    {
      eventType: z.string().describe('Event type, e.g. "tool_use", "error", "task_complete"'),
      payload: z.record(z.unknown()).optional().describe('Event-specific data'),
    },
    async ({ eventType, payload }) => {
      try {
        const eventId = crypto.randomUUID();
        const event = {
          id: eventId,
          installationId,
          eventType,
          timestamp: new Date().toISOString(),
          payload,
        };
        await apiClient.logEvents([event]);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ accepted: true, eventId }, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error logging event: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_claim_task ---
  server.tool(
    'gal_claim_task',
    'Atomically claim a GitHub issue so no other session works on it. Returns 409 if already claimed by an active session.',
    {
      issueNumber: z.number().describe('GitHub issue number to claim'),
      repo: z.string().describe('Repository in owner/repo format'),
    },
    async ({ issueNumber, repo }) => {
      try {
        if (!storedSessionId) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No session registered. Call gal_register_session first.' }],
            isError: true,
          };
        }
        const result = await apiClient.claimTask({ sessionId: storedSessionId, issueNumber, repo });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error claiming task: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_get_github_issue_context ---
  server.tool(
    'gal_get_github_issue_context',
    'Fetch live GitHub issue details and recent comments through the approved GAL server-side channel. Prefer this over unauthenticated gh calls inside background agents.',
    {
      orgName: createWorkspaceParamSchema(),
      owner: z.string().describe('Repository owner, usually the workspace org (for example "gal-run")'),
      repo: z.string().describe('Repository name (for example "gal-api")'),
      issueNumber: z.number().int().positive().describe('GitHub issue number'),
    },
    async ({ orgName, owner, repo, issueNumber }) => {
      try {
        const result = await apiClient.getGitHubIssueContext({
          orgName: resolveWorkspace(orgName ?? owner),
          owner,
          repo,
          issueNumber,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error fetching GitHub issue context: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_get_github_pr_context ---
  server.tool(
    'gal_get_github_pr_context',
    'Fetch live GitHub pull request details, review comments, and changed files through the approved GAL server-side channel.',
    {
      orgName: createWorkspaceParamSchema(),
      owner: z.string().describe('Repository owner, usually the workspace org (for example "gal-run")'),
      repo: z.string().describe('Repository name (for example "gal-api")'),
      prNumber: z.number().int().positive().describe('GitHub pull request number'),
    },
    async ({ orgName, owner, repo, prNumber }) => {
      try {
        const result = await apiClient.getGitHubPullRequestContext({
          orgName: resolveWorkspace(orgName ?? owner),
          owner,
          repo,
          prNumber,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error fetching GitHub pull request context: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_create_github_issue_comment ---
  server.tool(
    'gal_create_github_issue_comment',
    'Publish a blocker note, progress note, or handoff comment on a GitHub issue through the approved GAL server-side channel.',
    {
      orgName: createWorkspaceParamSchema(),
      owner: z.string().describe('Repository owner, usually the workspace org (for example "gal-run")'),
      repo: z.string().describe('Repository name (for example "gal-api")'),
      issueNumber: z.number().int().positive().describe('GitHub issue number'),
      body: z.string().min(1).describe('Markdown comment body to publish'),
    },
    async ({ orgName, owner, repo, issueNumber, body }) => {
      try {
        const result = await apiClient.createGitHubIssueComment({
          orgName: resolveWorkspace(orgName ?? owner),
          owner,
          repo,
          issueNumber,
          body,
        });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error creating GitHub issue comment: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_report_progress ---
  server.tool(
    'gal_report_progress',
    'Report what this session is currently doing. Updates dashboard with progress info visible to other sessions.',
    {
      currentTask: z.string().describe('Description of what you are currently working on'),
      branch: z.string().optional().describe('Git branch you are working on'),
      filesTouched: z.array(z.string()).optional().describe('Files you have modified'),
      percentComplete: z.number().min(0).max(100).optional().describe('Estimated percent complete (0-100)'),
    },
    async ({ currentTask, branch, filesTouched, percentComplete }) => {
      try {
        if (!storedSessionId) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No session registered. Call gal_register_session first.' }],
            isError: true,
          };
        }
        await apiClient.reportProgress(storedSessionId, { currentTask, branch, filesTouched, percentComplete });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ success: true, sessionId: storedSessionId }, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error reporting progress: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_send_directive ---
  server.tool(
    'gal_send_directive',
    'Send an instruction to another active session (e.g. tell it to claim a task, stop, switch branch, inject context, or change approach)',
    {
      targetSessionId: z.string().describe('Session ID to send the directive to'),
      type: z.enum(['claim_task', 'stop', 'switch_branch', 'inject-context', 'change-approach', 'custom']).describe('Directive type: claim_task, stop, switch_branch, inject-context (inject extra context into agent), change-approach (ask agent to pivot strategy), custom'),
      payload: z.record(z.unknown()).describe('Directive payload (e.g. { issueNumber: 123 } for claim_task, or { text: "..." } for inject-context/change-approach)'),
      text: z.string().optional().describe('Optional free-form text to attach to the directive (e.g. guidance for inject-context or change-approach)'),
    },
    async ({ targetSessionId, type, payload, text }) => {
      try {
        if (!storedSessionId) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No session registered. Call gal_register_session first.' }],
            isError: true,
          };
        }
        // Merge optional text into payload for backward compat — the API will
        // also persist it at the top-level `text` field for auditing.
        const mergedPayload = text
          ? { ...payload, text }
          : payload;
        const result = await apiClient.sendDirective(storedSessionId, { targetSessionId, type, payload: mergedPayload });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error sending directive: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_get_directives ---
  server.tool(
    'gal_get_directives',
    'Check for pending directives (instructions) sent to this session by other sessions or orchestrators',
    async () => {
      try {
        if (!storedSessionId) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No session registered. Call gal_register_session first.' }],
            isError: true,
          };
        }
        const result = await apiClient.getDirectives(storedSessionId);
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error getting directives: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_claim_branch ---
  server.tool(
    'gal_claim_branch',
    'Atomically claim a git branch so no other agent creates a conflicting branch. Returns 409 if already claimed.',
    {
      repo: z.string().describe('Repository in owner/repo format'),
      branch: z.string().describe('Branch name to claim (e.g. "fix/issue-123")'),
      issueNumber: z.number().optional().describe('Related GitHub issue number'),
    },
    async ({ repo, branch, issueNumber }) => {
      try {
        if (!storedSessionId) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No session registered. Call gal_register_session first.' }],
            isError: true,
          };
        }
        const result = await apiClient.claimBranch({ repo, branch, sessionId: storedSessionId, issueNumber });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error claiming branch: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_dispatch_agent ---
  server.tool(
    'gal_dispatch_agent',
    'Create a new background agent session. Use this to spawn a worker session for a specific task.',
    {
      agent: z.string().describe('Agent type, e.g. "claude"'),
      prompt: z.string().describe('What the new background agent should work on'),
      project_context: z.string().optional().describe('Repository context, e.g. "owner/repo"'),
      model: z.string().optional().describe('Model override (e.g. "gemini-3.1-pro-preview", "claude-sonnet-4-20250514")'),
      org: z.string().optional().describe('Organization ID to dispatch under (e.g. "acme-corp"). Defaults to the authenticated user\'s primary org.'),
      runner_label: z.string().optional().describe('Kata-backed ARC runner label (agents-standard-runc-x64, agents-medium-runc-x64, agents-high-runc-x64, agents-kali-runc). Defaults to agents-standard-runc-x64.'),
    },
    async ({ agent, prompt, project_context, model, org, runner_label }) => {
      try {
        const result = await apiClient.dispatchAgent({
          agent,
          prompt,
          project_context,
          session_type: 'background',
          model,
          org,
          runner_label,
        }) as Record<string, unknown>;
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              sessionId: result.id ?? result.sessionId,
              status: result.status ?? 'PENDING',
              dashboardUrl: result.dashboardUrl ?? null,
            }, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        // Surface capacity/dispatch-rule errors with structured detail
        const is429 = message.includes('429');
        const isCapacity = message.includes('WORKER_POOL_CAPACITY_EXCEEDED') || message.includes('at capacity');
        if (is429 || isCapacity) {
          // Try to extract the JSON error body for richer context
          let detail = message;
          try {
            const jsonStart = message.indexOf('{');
            if (jsonStart >= 0) {
              const parsed = JSON.parse(message.slice(jsonStart));
              const limits = parsed.limits;
              detail = `Dispatch blocked: ${parsed.message || 'Pool at capacity'}`;
              if (limits?.global) {
                detail += ` (global: ${limits.global.active}/${limits.global.max})`;
              }
              if (limits?.provider) {
                detail += ` (${limits.provider.name}: ${limits.provider.active}/${limits.provider.max})`;
              }
            }
          } catch {
            // Fall through with raw message
          }
          return {
            content: [{ type: 'text' as const, text: detail }],
            isError: true,
          };
        }

        return {
          content: [{ type: 'text' as const, text: `Error dispatching agent: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_resume_session ---
  server.tool(
    'gal_resume_session',
    'Resume a TERMINATED background agent session with a new prompt.',
    {
      sessionId: z.string().optional().describe('Session ID to resume'),
      session_id: z.string().optional().describe('Session ID to resume (snake_case alias)'),
      prompt: z.string().describe('Prompt to continue with'),
      dispatch_backend: z.enum(['stratus']).optional().describe('Dispatch backend override (stratus only)'),
      dispatchBackend: z.enum(['stratus']).optional().describe('Dispatch backend override (camelCase alias)'),
    },
    async ({ sessionId, session_id, prompt, dispatch_backend, dispatchBackend }) => {
      try {
        const resolvedSessionId = sessionId ?? session_id;
        if (!resolvedSessionId) {
          return {
            content: [{ type: 'text' as const, text: 'Error: sessionId is required (provide sessionId or session_id).' }],
            isError: true,
          };
        }

        const trimmedPrompt = prompt?.trim();
        if (!trimmedPrompt) {
          return {
            content: [{ type: 'text' as const, text: 'Error: prompt is required to resume a session.' }],
            isError: true,
          };
        }

        const resolvedBackend = dispatchBackend ?? dispatch_backend;
        const result = await apiClient.resumeSession({
          session_id: resolvedSessionId,
          prompt: trimmedPrompt,
          ...(resolvedBackend ? { dispatch_backend: resolvedBackend } : {}),
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error resuming session: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_list_work_items ---
  server.tool(
    'gal_list_work_items',
    'List available work items for an organization. Filter by status, type, or priority.',
    {
      organizationId: z.string().describe('Organization ID to list work items for'),
      status: z.enum(['pending', 'claimed', 'in_progress', 'completed', 'failed']).optional().describe('Filter by status'),
      priority: z.number().min(0).max(3).optional().describe('Filter by priority (0=highest, 3=lowest)'),
      type: z.enum(['pr_review', 'implement', 'bug_fix', 'sdlc_task', 'session']).optional().describe('Filter by work item type'),
      limit: z.number().min(1).max(100).optional().describe('Maximum number of items to return (default: 50)'),
    },
    async ({ organizationId, status, priority, type, limit }) => {
      try {
        const result = await apiClient.listWorkItems({
          organizationId, status, priority, type, limit: limit ?? 50,
        }) as { workItems: unknown[] };
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ count: result.workItems.length, workItems: result.workItems }, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error listing work items: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_claim_work_item ---
  server.tool(
    'gal_claim_work_item',
    'Claim a specific work item by ID. Returns success if claimed, or error if already claimed by another agent.',
    {
      workItemId: z.string().describe('Work item ID to claim'),
      agentId: z.string().optional().describe('Agent ID claiming the work (defaults to session ID)'),
    },
    async ({ workItemId, agentId }) => {
      try {
        if (!storedSessionId) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No session registered. Call gal_register_session first.' }],
            isError: true,
          };
        }
        const result = await apiClient.claimWorkItem({ workItemId, agentId: agentId ?? storedSessionId });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error claiming work item: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_complete_work_item ---
  server.tool(
    'gal_complete_work_item',
    'Mark a claimed work item as completed with a result summary.',
    {
      workItemId: z.string().describe('Work item ID to complete'),
      agentId: z.string().optional().describe('Agent ID completing the work (defaults to session ID)'),
      message: z.string().optional().describe('Completion message/summary'),
      details: z.record(z.unknown()).optional().describe('Additional result details'),
    },
    async ({ workItemId, agentId, message, details }) => {
      try {
        if (!storedSessionId) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No session registered. Call gal_register_session first.' }],
            isError: true,
          };
        }
        const result = await apiClient.completeWorkItem({ workItemId, agentId: agentId ?? storedSessionId, message, details });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error completing work item: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_fail_work_item ---
  server.tool(
    'gal_fail_work_item',
    'Mark a claimed work item as failed with error details. Optionally retry if not at max retries.',
    {
      workItemId: z.string().describe('Work item ID to fail'),
      agentId: z.string().optional().describe('Agent ID reporting failure (defaults to session ID)'),
      message: z.string().describe('Error message describing the failure'),
      details: z.record(z.unknown()).optional().describe('Additional error details'),
      retry: z.boolean().optional().describe('Whether to retry (if under max retries)'),
    },
    async ({ workItemId, agentId, message, details, retry }) => {
      try {
        if (!storedSessionId) {
          return {
            content: [{ type: 'text' as const, text: 'Error: No session registered. Call gal_register_session first.' }],
            isError: true,
          };
        }
        const result = await apiClient.failWorkItem({ workItemId, agentId: agentId ?? storedSessionId, message, details, retry });
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error failing work item: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_enqueue_work_items ---
  server.tool(
    'gal_enqueue_work_items',
    'Enqueue GitHub issues as work items in the agent work queue. Fetches issue details and creates prioritized work items.',
    {
      owner: z.string().describe('Repository owner (e.g. "acme-corp")'),
      repo: z.string().describe('Repository name (e.g. "my-repo")'),
      issueNumbers: z.array(z.number().int().positive()).min(1).describe('Array of GitHub issue numbers to enqueue'),
      org: z.string().optional().describe('Organization ID (defaults to first org of authenticated user)'),
      runnerLabel: z.string().optional().describe('ARC runner label to route work items to (e.g. "agents-kali-runc" for security work). Auto-detected from issue labels when omitted.'),
    },
    async ({ owner, repo, issueNumbers, org, runnerLabel }) => {
      try {
        const result = await apiClient.enqueueWorkItems({ owner, repo, issueNumbers, org, runnerLabel });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error enqueuing work items: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_set_queue_order ---
  server.tool(
    'gal_set_queue_order',
    'Replace the exact pending queue order for a workspace. Provide the full ordered list of pending work item IDs. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      itemIds: z.array(z.string().min(1)).min(1).describe('Full ordered array of pending work item IDs'),
    },
    async ({ orgName, itemIds }) => {
      try {
        const result = await apiClient.setQueueOrder({
          orgName: resolveWorkspace(orgName),
          itemIds,
        });
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error setting queue order: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_get_dispatch_rules ---
  server.tool(
    'gal_get_dispatch_rules',
    'Get background agent dispatch rules for a workspace. Returns which work categories are eligible for background dispatch. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
    },
    async ({ orgName }) => {
      try {
        const result = await apiClient.getDispatchRules(resolveWorkspace(orgName));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error getting dispatch rules: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_get_dispatch_health ---
  server.tool(
    'gal_get_dispatch_health',
    'Check the health and availability of background agent dispatch backends (Hive, Warm Pool, GHA). ' +
    'Returns pool statistics (idle VMs, active sessions) for each backend and a recommended backend. ' +
    'Use before dispatching to verify Hive is reachable or to choose the fastest available backend.',
    {},
    async () => {
      try {
        const health = await apiClient.getDispatchHealth();
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(health, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error checking dispatch health: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_get_session_output ---
  server.tool(
    'gal_get_session_output',
    'Fetch recent tool activity output from a background agent session (NATS JetStream primary, Firebase RTDB fallback). ' +
    'Always returns session metadata (status, errorMessage, logsTruncated) alongside output entries. ' +
    'Filters out tool_activity snapshot entries by default — set includeToolActivity=true to include them. ' +
    'By default, large text fields are truncated to 500 chars to prevent context window bloat. ' +
    'Use fullOutput=true to bypass truncation. ' +
    'Use streaming=true to get an SSE URL for real-time output streaming instead of polling.',
    {
      sessionId: z.string().describe('The session ID to fetch output for'),
      lastN: z.number().min(1).max(200).optional().describe('Number of most-recent output entries to return (default: 50)'),
      fullOutput: z.boolean().optional().describe('If true, return full output without truncation. Default: false (truncate large fields to 500 chars)'),
      streaming: z.boolean().optional().describe('If true, return an SSE stream URL instead of polling. The URL streams output, status_change, heartbeat, and done events via NATS (primary) or RTDB (fallback).'),
      includeToolActivity: z.boolean().optional().describe('If true, include tool_activity snapshot entries (cumulative in-flight tool lists). Default: false (filtered to reduce noise).'),
    },
    async ({ sessionId, lastN, fullOutput, streaming, includeToolActivity }) => {
      try {
        // When streaming=true, return an SSE URL for real-time output
        if (streaming) {
          const sseUrl = apiClient.getSessionStreamUrl(sessionId);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                sessionId,
                streaming: true,
                sseUrl,
                message: 'Connect to sseUrl with an EventSource or fetch to receive real-time session output. Events: connected, output, status_change, heartbeat, done.',
              }, null, 2),
            }],
          };
        }

        // Fetch output and metadata in parallel for richer diagnostics
        const [data, metadata] = await Promise.all([
          apiClient.getSessionOutput(sessionId, lastN ?? 50),
          apiClient.getSessionMetadata(sessionId),
        ]);

        // Build compact metadata summary included in every response
        const metaSummary = metadata ? {
          status: metadata.status,
          ...(metadata.logsTruncated ? { logsTruncated: true } : {}),
          ...(metadata.errorMessage ? { errorMessage: metadata.errorMessage } : {}),
          ...(metadata.branchName ? { branchName: metadata.branchName } : {}),
          ...(metadata.estimatedCost !== undefined ? { estimatedCost: metadata.estimatedCost } : {}),
          ...(metadata.messageCount !== undefined ? { messageCount: metadata.messageCount } : {}),
          ...(metadata.runnerMode ? { runnerMode: metadata.runnerMode } : {}),
        } : null;

          if (!data) {
          let message = 'No output found for this session.';
          const warnings: string[] = [];

          if (metadata) {
            const status = metadata.status as string | undefined;
            if (status === 'FAILED') {
              message = 'Session FAILED — no output was written.';
              if (metadata.errorMessage) {
                warnings.push(`Error: ${String(metadata.errorMessage)}`);
              }
            } else if (status === 'PENDING') {
              message = 'Session is PENDING — runner has not started yet. No output available.';
            } else if (status === 'TERMINATED' || status === 'COMPLETED') {
              message = `Session ${status} but no output entries found in RTDB/NATS.`;
              if (metadata.logsTruncated) {
                warnings.push('logsTruncated: output cap was hit — entries may have been discarded before any were read.');
              }
            }
          }

          return {
            content: [{ type: 'text' as const, text: JSON.stringify({
              sessionId,
              entries: [],
              message,
              ...(warnings.length > 0 ? { warnings } : {}),
              ...(metaSummary ? { metadata: metaSummary } : {}),
            }, null, 2) }],
          };
        }

        // Convert the RTDB object (keyed by push-id) to a sorted array
        let entries = Object.entries(data)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => ({ key, ...(value as Record<string, unknown>) }));

        // Filter out tool_activity snapshot entries by default — they are cumulative
        // duplicates of in-flight tool state and triple the entry count with redundant data.
        if (!includeToolActivity) {
          entries = entries.filter(e => (e as Record<string, unknown>).type !== 'tool_activity');
        }

        // Apply truncation unless fullOutput is explicitly true
        if (!fullOutput) {
          entries = entries.map(entry => truncateLargeFields(entry, 500));
        }

        const warnings: string[] = [];
        if (metadata?.logsTruncated) {
          warnings.push('logsTruncated: RTDB output cap was hit — oldest entries may have been dropped from RTDB. NATS JetStream preserves the full stream when available. Check GHA logs for full output.');
        }

        // Hard cap: enforce MAX_TOTAL_RESPONSE_CHARS even after per-field truncation.
        // Leave a 1000-char buffer for wrapper JSON, metadata, and warnings fields.
        let responseText: string;
        if (!fullOutput) {
          const WRAPPER_OVERHEAD = 1000;
          const entryBudget = MAX_TOTAL_RESPONSE_CHARS - WRAPPER_OVERHEAD;
          const cappedEntries: typeof entries = [];
          let usedChars = 0;
          let responseCapped = false;
          for (const entry of entries) {
            const entryJson = JSON.stringify(entry);
            if (usedChars + entryJson.length > entryBudget) {
              responseCapped = true;
              break;
            }
            cappedEntries.push(entry);
            usedChars += entryJson.length;
          }
          if (responseCapped) {
            warnings.push(`Response capped: showing ${cappedEntries.length}/${entries.length} entries. Reduce lastN or set fullOutput=true.`);
          }
          const payload = JSON.stringify({
            sessionId,
            count: cappedEntries.length,
            entries: cappedEntries,
            ...(warnings.length > 0 ? { warnings } : {}),
            ...(metaSummary ? { metadata: metaSummary } : {}),
          }, null, 2);
          // Final safety net: slice the serialized string at the hard cap.
          responseText = payload.length <= MAX_TOTAL_RESPONSE_CHARS
            ? payload
            : payload.slice(0, MAX_TOTAL_RESPONSE_CHARS);
        } else {
          responseText = JSON.stringify({
            sessionId,
            count: entries.length,
            entries,
            ...(warnings.length > 0 ? { warnings } : {}),
            ...(metaSummary ? { metadata: metaSummary } : {}),
          }, null, 2);
        }

        return {
          content: [{
            type: 'text' as const,
            text: responseText,
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error fetching session output: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_analyze_dispatch ---
  server.tool(
    'gal_analyze_dispatch',
    'Perform a pre-dispatch capability analysis without creating a real session. ' +
    'Detects permission/scope mismatches, validates credential status, and returns structured warnings and required capabilities.',
    {
      name: z.string().optional().describe('Session name to include in analysis'),
      prompt: z.string().optional().describe('Agent prompt / initial instructions to analyse'),
      project_context: z.string().optional().describe('Repository context, e.g. "owner/repo"'),
      agent: z.string().optional().describe('Agent type (claude, codex, gemini)'),
    },
    async ({ name, prompt, project_context, agent }) => {
      const analysis = runCapabilityAnalysis({ name, prompt, projectContext: project_context, agent });

      // Wire work-item qualification into analyze_dispatch.
      // Run pre-flight qualification on the prompt/session name to detect
      // human-required signals before dispatch.
      const qualification = qualifyWorkItemForDispatch({
        title: name || '',
        body: prompt || '',
      });

      if (!qualification.qualified) {
        analysis.hasWarnings = true;
        analysis.warnings.push({
          ruleId: 'HUMAN_REQUIRED',
          severity: 'warning',
          title: 'Human action may be required',
          message: qualification.reason || 'Prompt contains signals that typically require human involvement',
          recommendation: 'Review whether this task can be fully automated or needs human intervention before dispatching.',
        });
      }

      // Wire credential validation into analyze_dispatch.
      // If an agent is specified, validate credentials via the GAL API.
      // This catches expired tokens before a session is dispatched.
      let credentialStatus: {
        status: 'valid' | 'expired' | 'not_configured' | 'unknown';
        provider?: string;
        method?: string;
        issues?: string[];
        suggestions?: string[];
      } = { status: 'unknown' };

      const providerMap: Record<string, string> = { claude: 'claude', codex: 'codex', gemini: 'gemini' };
      const provider = agent ? providerMap[agent.toLowerCase()] : undefined;

      if (provider) {
        try {
          const result = await apiClient.validateCredentialForDispatch(provider);
          if (result.ready) {
            credentialStatus = {
              status: 'valid',
              provider: result.provider,
              method: result.method,
            };
          } else {
            // Determine if expired vs not_configured from issues
            const isExpired = result.issues.some(
              (i: string) => i.toLowerCase().includes('expired') || i.toLowerCase().includes('rejected'),
            );
            credentialStatus = {
              status: isExpired ? 'expired' : 'not_configured',
              provider: result.provider,
              method: result.method,
              issues: result.issues,
              suggestions: result.suggestions,
            };

            // Add credential error to warnings so hasErrors is set
            analysis.warnings.push({
              ruleId: 'CREDENTIALS_INVALID',
              severity: 'error',
              title: `${provider} credentials ${isExpired ? 'expired' : 'not configured'}`,
              message: result.issues.join('; '),
              recommendation: result.suggestions.join('; ') || `Run 'gal auth ${provider}' to configure credentials`,
            });
            analysis.hasErrors = true;
          }
        } catch {
          // API call failed (e.g., not authenticated, network error).
          // Don't block analysis — report as unknown.
          credentialStatus = {
            status: 'unknown',
            provider,
            issues: ['Unable to validate credentials (API unreachable)'],
          };
        }
      }

      const result = {
        ...analysis,
        credentialStatus,
        qualification,
        summary: credentialStatus.status === 'expired'
          ? `BLOCKED: ${provider} credentials are expired. ${credentialStatus.suggestions?.[0] || `Run: gal auth ${provider}`}`
          : credentialStatus.status === 'not_configured'
            ? `BLOCKED: ${provider} credentials not configured. ${credentialStatus.suggestions?.[0] || `Run: gal auth ${provider}`}`
            : analysis.summary,
      };

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    },
  );

  // --- gal_get_dispatch_health --- (duplicate removed — already registered above at line 780)

  // --- gal_set_dispatch_rules ---
  const dispatchRuleSchema = z.object({
    category: z.string().min(1).describe('Dispatch rule category key'),
    enabled: z.boolean().describe('Whether this rule is enabled'),
    backend: z.enum(['stratus']).optional().describe('Dispatch backend (stratus only)'),
    agent: z.string().optional().describe('Explicit agent override (optional)'),
    note: z.string().optional().describe('Optional notes for this rule'),
  });
  const legacyCategorySchema = z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    enabled: z.boolean(),
    promptHint: z.string().optional(),
  });
  type ProviderPoolConfig = NonNullable<SetDispatchRulesPayload['providerPools']>[number];
  type DispatchRulesResponse = {
    rules?: DispatchRule[];
    providerPools?: ProviderPoolConfig[];
  };

  const normalizeProviderPools = (value: unknown): ProviderPoolConfig[] => {
    if (!Array.isArray(value)) return [];

    return value.flatMap((pool) => {
      if (!pool || typeof pool !== 'object') return [];
      const candidate = pool as Record<string, unknown>;
      const provider = candidate.provider;
      if (provider !== 'claude' && provider !== 'codex' && provider !== 'gemini' && provider !== 'gal-code') {
        return [];
      }

      const normalized: ProviderPoolConfig = { provider };
      if (typeof candidate.maxConcurrent === 'number' && Number.isFinite(candidate.maxConcurrent)) {
        normalized.maxConcurrent = candidate.maxConcurrent;
      }
      if (typeof candidate.maxPending === 'number' && Number.isFinite(candidate.maxPending)) {
        normalized.maxPending = candidate.maxPending;
      }
      return [normalized];
    });
  };

  const mergeProviderPools = (
    existingPools: ProviderPoolConfig[],
    updates: ProviderPoolConfig[],
  ): ProviderPoolConfig[] => {
    const mergedByProvider = new Map<ProviderPoolConfig['provider'], ProviderPoolConfig>();

    for (const pool of existingPools) {
      mergedByProvider.set(pool.provider, { ...pool });
    }

    for (const update of updates) {
      const current = mergedByProvider.get(update.provider);
      const merged: ProviderPoolConfig = { provider: update.provider };

      if (update.maxConcurrent !== undefined) {
        merged.maxConcurrent = update.maxConcurrent;
      } else if (current?.maxConcurrent !== undefined) {
        merged.maxConcurrent = current.maxConcurrent;
      }

      if (update.maxPending !== undefined) {
        merged.maxPending = update.maxPending;
      } else if (current?.maxPending !== undefined) {
        merged.maxPending = current.maxPending;
      }

      mergedByProvider.set(update.provider, merged);
    }

    return Array.from(mergedByProvider.values());
  };

  server.tool(
    'gal_set_dispatch_rules',
    'Update background agent dispatch rules for a workspace. Admin only. Controls which work categories can be dispatched to background agents. If orgName is omitted, the active workspace set by gal_set_active_workspace is used.',
    {
      orgName: createWorkspaceParamSchema(),
      enabled: z.boolean().optional().describe('Master switch for background dispatch'),
      rules: z.array(dispatchRuleSchema).min(1).optional().describe('Dispatch rules (preferred payload)'),
      categories: z.array(legacyCategorySchema).optional().describe('Legacy categories payload (deprecated)'),
      customInstructions: z.string().optional().describe('Custom instructions appended to AGENTS.md'),
      maxConcurrentAgents: z.number().optional().describe('Max concurrent background agents'),
      reservedForManual: z.number().optional().describe('Global slots reserved for manual/verification dispatch'),
      maxPendingQueueItems: z.number().optional().describe('Max pending queue items before throttling dispatch'),
      preferredProvider: z.enum(['claude', 'codex', 'gemini', 'gal-code']).optional().describe('Preferred agent provider'),
      enabledCredentialOwners: z.array(z.string()).optional().describe('List of credential owners (github:<id>) allowed to dispatch agents'),
      preferredCredentialOwners: z.array(z.string()).optional().describe('Ordered list of preferred credential owners for dispatch'),
      providerPools: z.array(z.object({
        provider: z.enum(['claude', 'codex', 'gemini', 'gal-code']),
        maxConcurrent: z.number().min(0).optional(),
        maxPending: z.number().min(0).optional(),
      })).optional().describe('Provider pool configuration'),
    },
    async ({ orgName, enabled, rules, categories, customInstructions, maxConcurrentAgents, reservedForManual, maxPendingQueueItems, preferredProvider, enabledCredentialOwners, preferredCredentialOwners, providerPools }) => {
      try {
        const workspace = resolveWorkspace(orgName);
        let resolvedRules: DispatchRule[] | undefined = rules;
        let existingDispatchRules: DispatchRulesResponse | null = null;

        const getExistingDispatchRules = async (): Promise<DispatchRulesResponse> => {
          if (existingDispatchRules === null) {
            existingDispatchRules = ((await apiClient.getDispatchRules(workspace)) as DispatchRulesResponse | null) ?? {};
          }
          return existingDispatchRules;
        };

        if (!resolvedRules && categories?.length) {
          resolvedRules = categories.map((category) => ({
            category: category.id,
            enabled: category.enabled,
            note: category.description,
          }));
        }
        if (!resolvedRules || resolvedRules.length === 0) {
          const existing = await getExistingDispatchRules();
          const existingRules = existing?.rules;
          if (Array.isArray(existingRules) && existingRules.length > 0) {
            resolvedRules = existingRules;
          }
        }
        if (!resolvedRules || resolvedRules.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'Error setting dispatch rules: rules array is required. Provide rules or categories.' }],
            isError: true,
          };
        }

        const payload: SetDispatchRulesPayload = { rules: resolvedRules };
        if (enabled !== undefined) payload.enabled = enabled;
        if (customInstructions !== undefined) payload.customInstructions = customInstructions;
        if (maxConcurrentAgents !== undefined) payload.maxConcurrentAgents = maxConcurrentAgents;
        if (reservedForManual !== undefined) payload.reservedForManual = reservedForManual;
        if (maxPendingQueueItems !== undefined) payload.maxPendingQueueItems = maxPendingQueueItems;
        if (preferredProvider !== undefined) payload.preferredProvider = preferredProvider;
        if (enabledCredentialOwners !== undefined) payload.enabledCredentialOwners = enabledCredentialOwners;
        if (preferredCredentialOwners !== undefined) payload.preferredCredentialOwners = preferredCredentialOwners;
        if (providerPools !== undefined) {
          const hasInvalidPoolLimits = providerPools.some(
            (pool) =>
              (pool.maxConcurrent !== undefined && pool.maxConcurrent < 0) ||
              (pool.maxPending !== undefined && pool.maxPending < 0),
          );
          if (hasInvalidPoolLimits) {
            return {
              content: [{ type: 'text' as const, text: 'Error setting dispatch rules: providerPools maxConcurrent/maxPending must be >= 0.' }],
              isError: true,
            };
          }
          const existing = await getExistingDispatchRules();
          const existingPools = normalizeProviderPools(existing?.providerPools);
          payload.providerPools = mergeProviderPools(existingPools, providerPools);
        }

        const result = await apiClient.setDispatchRules(workspace, payload);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error setting dispatch rules: ${message}` }],
          isError: true,
        };
      }
    },
  );

  // --- gal_detect_processes ---
  server.tool(
    'gal_detect_processes',
    'Analyze session activity to detect repeatable operational processes. ' +
    'Scans session output for patterns (CI/CD, testing, deployment, etc.) and proposes ' +
    'operations map entries with automation potential classification. ' +
    'Provide a sessionId to analyze a specific session, or raw entries for local analysis.',
    {
      sessionId: z.string().optional().describe('Session ID to fetch and analyze output from (uses RTDB)'),
      entries: z.array(z.record(z.unknown())).optional().describe('Raw session output entries to analyze (alternative to sessionId)'),
      lastN: z.number().min(1).max(500).optional().describe('Number of most-recent entries to analyze when using sessionId (default: 50)'),
    },
    async ({ sessionId, entries: rawEntries, lastN }) => {
      try {
        let entriesToAnalyze: SessionEntry[];

        if (rawEntries && rawEntries.length > 0) {
          // Use provided entries directly
          entriesToAnalyze = rawEntries as SessionEntry[];
        } else if (sessionId) {
          // Fetch from RTDB
          const data = await apiClient.getSessionOutput(sessionId, lastN ?? 50);
          if (!data) {
            return {
              content: [{
                type: 'text' as const,
                text: JSON.stringify({
                  sessionId,
                  entriesAnalyzed: 0,
                  proposals: [],
                  summary: 'No session output found to analyze.',
                }, null, 2),
              }],
            };
          }
          entriesToAnalyze = Object.entries(data)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, value]) => ({ key, ...(value as Record<string, unknown>) }));
        } else {
          return {
            content: [{
              type: 'text' as const,
              text: 'Error: Provide either sessionId or entries to analyze.',
            }],
            isError: true,
          };
        }

        const result = detectProcesses(entriesToAnalyze);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              ...(sessionId ? { sessionId } : {}),
              ...result,
            }, null, 2),
          }],
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text' as const, text: `Error detecting processes: ${message}` }],
          isError: true,
        };
      }
    },
  );
}
