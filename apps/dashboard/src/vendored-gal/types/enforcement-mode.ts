/**
 * Enforcement Mode Types (#4702)
 *
 * Org-level enforcement modes that control how developers interact with
 * AI coding agents. The primary use case is "background agents only" mode,
 * which restricts local sessions to orchestration activities and requires
 * all implementation work to go through the background agent queue.
 */

/**
 * Enforcement mode determines what local sessions are allowed to do.
 *
 * - `off`               — No restrictions. Developers can work locally or via queue.
 * - `warn`              — Local implementation triggers a warning suggesting queue usage,
 *                         but does not block the action.
 * - `background-only`   — Local sessions are restricted to orchestration activities.
 *                         Implementation tools (Edit, Write, Bash with git push, etc.)
 *                         are blocked with a message directing to the queue.
 */
export type WorkflowEnforcementMode = 'off' | 'warn' | 'background-only';

/**
 * Session role determines what the current session is allowed to do
 * based on how it was launched.
 *
 * - `orchestrator` — Local session used for coordination, review, and dispatch.
 * - `worker`       — Background agent session executing implementation work.
 */
export type SessionRole = 'orchestrator' | 'worker';

/**
 * Org-level enforcement settings stored alongside dispatch rules.
 */
export interface WorkflowEnforcementSettings {
  /** The enforcement mode for the organization */
  mode: WorkflowEnforcementMode;

  /** Whether the enforcement is currently active (master switch) */
  enabled: boolean;

  /**
   * Tools that are blocked for local (orchestrator) sessions
   * when mode is 'background-only'.
   * If not specified, uses the DEFAULT_BLOCKED_TOOLS list.
   */
  blockedTools?: string[];

  /**
   * Custom message shown to developers when an action is blocked.
   * Supports {tool} and {org} placeholders.
   */
  blockMessage?: string;

  /**
   * Exempt users (GitHub logins) who can bypass enforcement.
   * Typically org admins who need emergency local access.
   */
  exemptUsers?: string[];

  /** When enforcement settings were last updated */
  updatedAt?: string;

  /** Who last updated the enforcement settings */
  updatedBy?: string;
}

/**
 * Default tools blocked in 'background-only' mode for orchestrator sessions.
 *
 * These are implementation tools that modify code or push changes.
 * Orchestration tools (MCP calls, issue management, PR review) remain allowed.
 */
export const DEFAULT_BLOCKED_TOOLS: string[] = [
  'Edit',
  'Write',
  'MultiEdit',
  'NotebookEdit',
];

/**
 * Bash command patterns blocked in 'background-only' mode.
 * These patterns are checked when the Bash tool is used.
 */
export const BLOCKED_BASH_PATTERNS: string[] = [
  'git push',
  'git commit',
  'git add',
  'git stash',
  'git rebase',
  'git merge',
  'git cherry-pick',
  'npm publish',
  'pnpm publish',
  'make deploy',
  'make release',
];

/**
 * Tools that are always allowed regardless of enforcement mode.
 * These are orchestration/read-only tools.
 */
export const ALWAYS_ALLOWED_TOOLS: string[] = [
  'Read',
  'Glob',
  'Grep',
  'LSP',
  'WebFetch',
  'WebSearch',
  'AskUserQuestion',
  'TodoWrite',
  'Task',
  'Skill',
  'EnterPlanMode',
  'ExitPlanMode',
];

/**
 * Default enforcement settings when none are configured.
 */
export const DEFAULT_ENFORCEMENT_MODE_SETTINGS: WorkflowEnforcementSettings = {
  mode: 'off',
  enabled: false,
};

/**
 * Default block message template.
 */
export const DEFAULT_BLOCK_MESSAGE =
  '🚫 This action is blocked by your organization\'s enforcement policy.\n' +
  'Your org ({org}) requires all implementation work to go through the background agent queue.\n\n' +
  'To proceed:\n' +
  '  1. Create a GitHub issue describing the work\n' +
  '  2. Use `gal dispatch` or the dashboard to queue a background agent\n' +
  '  3. Monitor and review the agent\'s output\n\n' +
  'Blocked tool: {tool}';

/**
 * Result of an enforcement check for a tool call.
 */
export interface EnforcementCheckResult {
  /** Whether the tool call is allowed */
  allowed: boolean;

  /** The enforcement mode that was applied */
  mode: WorkflowEnforcementMode;

  /** The session role that was detected */
  sessionRole: SessionRole;

  /** Human-readable reason if blocked or warned */
  reason?: string;

  /** Whether this is a warning (allowed but flagged) vs a hard block */
  isWarning: boolean;
}

/**
 * Checks whether a tool call should be allowed based on enforcement settings.
 *
 * @param toolName - The name of the tool being invoked
 * @param toolInput - The input to the tool (used for Bash command inspection)
 * @param settings - The org's enforcement settings
 * @param sessionRole - The role of the current session
 * @param userLogin - The GitHub login of the current user (for exemption check)
 * @returns The enforcement decision
 */
export function checkEnforcement(
  toolName: string,
  toolInput: Record<string, unknown>,
  settings: WorkflowEnforcementSettings,
  sessionRole: SessionRole,
  userLogin?: string,
): EnforcementCheckResult {
  // If enforcement is disabled or mode is off, always allow
  if (!settings.enabled || settings.mode === 'off') {
    return {
      allowed: true,
      mode: settings.mode,
      sessionRole,
      isWarning: false,
    };
  }

  // Workers (background agents) are never restricted by this enforcement
  if (sessionRole === 'worker') {
    return {
      allowed: true,
      mode: settings.mode,
      sessionRole,
      isWarning: false,
    };
  }

  // Check if user is exempt
  if (
    userLogin &&
    settings.exemptUsers &&
    settings.exemptUsers.includes(userLogin)
  ) {
    return {
      allowed: true,
      mode: settings.mode,
      sessionRole,
      isWarning: false,
    };
  }

  // Check if tool is always allowed
  if (ALWAYS_ALLOWED_TOOLS.includes(toolName)) {
    return {
      allowed: true,
      mode: settings.mode,
      sessionRole,
      isWarning: false,
    };
  }

  // Determine blocked tools list
  const blockedTools = settings.blockedTools && settings.blockedTools.length > 0
    ? settings.blockedTools
    : DEFAULT_BLOCKED_TOOLS;

  // Check direct tool blocking
  const isBlockedTool = blockedTools.includes(toolName);

  // Check Bash command patterns
  let isBlockedBash = false;
  if (toolName === 'Bash') {
    const command = String(toolInput?.command || '');
    isBlockedBash = BLOCKED_BASH_PATTERNS.some((pattern) =>
      command.includes(pattern),
    );
  }

  const isBlocked = isBlockedTool || isBlockedBash;

  if (!isBlocked) {
    return {
      allowed: true,
      mode: settings.mode,
      sessionRole,
      isWarning: false,
    };
  }

  // Build the reason message
  const org = 'your organization';
  const blockMessage = (settings.blockMessage || DEFAULT_BLOCK_MESSAGE)
    .replace(/\{tool\}/g, toolName)
    .replace(/\{org\}/g, org);

  if (settings.mode === 'warn') {
    return {
      allowed: true,
      mode: settings.mode,
      sessionRole,
      reason: `⚠️ WARNING: ${blockMessage}`,
      isWarning: true,
    };
  }

  // mode === 'background-only'
  return {
    allowed: false,
    mode: settings.mode,
    sessionRole,
    reason: blockMessage,
    isWarning: false,
  };
}
