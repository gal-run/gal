/**
 * Pre-seeded demo data for the live demo environment (NEXT_PUBLIC_DEMO_MODE=true).
 *
 * Pages that fetch data from the API should check isDemoMode() and return
 * these stubs instead, so the demo works without a real backend session.
 */

import type {
  Organization,
  GitHubInstallationStatus,
  DiscoveredConfigGroup,
  ApprovedConfigResponse,
  TeamMembersLiveResponse,
  AuditLogEntryResponse,
  AuditLogsResponse,
  AuditSummaryResponse,
  AuditAlertResponse,
  ProjectOverride,
  AgentSecurityPolicyItem,
  ComplianceStatusResponse,
  BillingStatus,
  SdlcComplianceStatus,
  SdlcDriftReport,
  DomainStatsResponse,
  DomainAlertsResponse,
  DomainAnomaliesResponse,
  DomainRepoBreakdownResponse,
  DomainExceptionsResponse,
  ToolComplianceStatusResponse,
  ToolExceptionsResponse,
  SystemPolicyItem,
  SystemPolicyRuleItem,
  EnforcementEventsResponse,
  EnforcementEventItem,
  DomainExceptionItem,
  EnforcementHookItem,
  SdlcStateItem,
  SdlcGateConfig,
  SdlcComplianceStatusResponse,
  SecurityStandardItem,
  ToolPolicyItem,
  DeveloperStatusSummary,
} from '@/lib/api'
import type { Session } from '@gal/types'
import type { ConfigProposal } from '@gal/types'

export const DEMO_ORG = 'acme-corp'

// ---------------------------------------------------------------------------
// Demo organization (matches Organization interface from api.ts)
// ---------------------------------------------------------------------------

export const DEMO_ORGANIZATION: Organization = {
  name: DEMO_ORG,
  installationId: 9999,
  accountType: 'Organization',
  settings: { storageUrl: '', versions: 2 },
  commands: { storageUrl: '', count: 5 },
  hooks: { storageUrl: '', count: 3 },
  totalRepos: 12,
  totalCommands: 5,
  totalHooks: 3,
  totalConfigs: 10,
  lastScanAt: { _seconds: 1741597200, _nanoseconds: 0 },
  createdAt: { _seconds: 1741564800, _nanoseconds: 0 },
  updatedAt: { _seconds: 1741564800, _nanoseconds: 0 },
}

// ---------------------------------------------------------------------------
// Demo agents (display-only, not tied to a real type)
// ---------------------------------------------------------------------------

export const DEMO_AGENTS = [
  {
    id: 'agent-1',
    name: 'Claude Code',
    provider: 'anthropic',
    status: 'active',
    runs: 24,
    model: 'claude-sonnet-4-6',
  },
  {
    id: 'agent-2',
    name: 'Gemini CLI',
    provider: 'google',
    status: 'active',
    runs: 6,
    model: 'gemini-2.5-pro',
  },
  {
    id: 'agent-3',
    name: 'Codex',
    provider: 'openai',
    status: 'idle',
    runs: 3,
    model: 'gpt-4o',
  },
  {
    id: 'agent-4',
    name: 'GitHub Copilot',
    provider: 'github',
    status: 'idle',
    runs: 4,
    model: 'copilot',
  },
] as const

// ---------------------------------------------------------------------------
// Demo sessions (matches Session interface from @gal/types)
// ---------------------------------------------------------------------------

export const DEMO_SESSIONS: Session[] = [
  {
    id: 'session-1',
    organizationId: DEMO_ORG,
    userId: 'demo-user-0000',
    agent: 'claude',
    status: 'TERMINATED',
    name: 'Implement user authentication flow',
    projectContext: 'acme-corp/web-app',
    createdAt: '2026-03-10T09:00:00Z',
    startedAt: '2026-03-10T09:00:00Z',
    terminatedAt: '2026-03-10T09:14:02Z',
  },
  {
    id: 'session-2',
    organizationId: DEMO_ORG,
    userId: 'demo-user-0000',
    agent: 'claude',
    status: 'ACTIVE',
    name: 'Fix navigation bug in dashboard',
    projectContext: 'acme-corp/web-app',
    createdAt: '2026-03-10T10:30:00Z',
    startedAt: '2026-03-10T10:30:00Z',
  },
  {
    id: 'session-3',
    organizationId: DEMO_ORG,
    userId: 'demo-user-0000',
    agent: 'gemini',
    status: 'TERMINATED',
    name: 'Write unit tests for billing module',
    projectContext: 'acme-corp/web-app',
    createdAt: '2026-03-10T08:15:00Z',
    startedAt: '2026-03-10T08:15:00Z',
    terminatedAt: '2026-03-10T08:22:00Z',
  },
  {
    id: 'session-4',
    organizationId: DEMO_ORG,
    userId: 'demo-user-0000',
    agent: 'claude',
    status: 'TERMINATED',
    name: 'Refactor API client to TypeScript',
    projectContext: 'acme-corp/api',
    createdAt: '2026-03-09T16:45:00Z',
    startedAt: '2026-03-09T16:45:00Z',
    terminatedAt: '2026-03-09T17:05:03Z',
  },
  {
    id: 'session-5',
    organizationId: DEMO_ORG,
    userId: 'demo-user-0000',
    agent: 'codex',
    status: 'FAILED',
    name: 'Migrate database schema to v3',
    projectContext: 'acme-corp/api',
    createdAt: '2026-03-09T14:20:00Z',
    startedAt: '2026-03-09T14:20:00Z',
    terminatedAt: '2026-03-09T14:21:38Z',
    errorMessage: 'Schema migration blocked: missing permissions',
  },
  {
    id: 'session-6',
    organizationId: DEMO_ORG,
    userId: 'demo-user-0000',
    agent: 'claude',
    status: 'TERMINATED',
    name: 'Add dark mode support to all components',
    projectContext: 'acme-corp/web-app',
    createdAt: '2026-03-09T11:00:00Z',
    startedAt: '2026-03-09T11:00:00Z',
    terminatedAt: '2026-03-09T11:10:54Z',
  },
  {
    id: 'session-7',
    organizationId: DEMO_ORG,
    userId: 'demo-user-0000',
    agent: 'copilot',
    status: 'TERMINATED',
    name: 'Generate API documentation',
    projectContext: 'acme-corp/api',
    createdAt: '2026-03-09T09:30:00Z',
    startedAt: '2026-03-09T09:30:00Z',
    terminatedAt: '2026-03-09T09:35:21Z',
  },
  {
    id: 'session-8',
    organizationId: DEMO_ORG,
    userId: 'demo-user-0000',
    agent: 'claude',
    status: 'TERMINATED',
    name: 'Implement role-based access control',
    projectContext: 'acme-corp/web-app',
    createdAt: '2026-03-08T15:00:00Z',
    startedAt: '2026-03-08T15:00:00Z',
    terminatedAt: '2026-03-08T15:16:27Z',
  },
  {
    id: 'session-9',
    organizationId: DEMO_ORG,
    userId: 'demo-user-0000',
    agent: 'gemini',
    status: 'TERMINATED',
    name: 'Optimize Firestore indexes for team page',
    projectContext: 'acme-corp/api',
    createdAt: '2026-03-08T13:15:00Z',
    startedAt: '2026-03-08T13:15:00Z',
    terminatedAt: '2026-03-08T13:24:27Z',
  },
  {
    id: 'session-10',
    organizationId: DEMO_ORG,
    userId: 'demo-user-0000',
    agent: 'claude',
    status: 'TERMINATED',
    name: 'Build CSV export for audit logs',
    projectContext: 'acme-corp/web-app',
    createdAt: '2026-03-08T10:00:00Z',
    startedAt: '2026-03-08T10:00:00Z',
    terminatedAt: '2026-03-08T10:24:16Z',
  },
]

// ---------------------------------------------------------------------------
// Demo proposals (matches ConfigProposal interface from @gal/types)
// ---------------------------------------------------------------------------

export const DEMO_PROPOSALS: ConfigProposal[] = [
  {
    id: 'prop-1',
    scope: 'org',
    scopeId: DEMO_ORG,
    proposedBy: 'james-okonkwo',
    proposedAt: new Date('2026-03-09T14:00:00Z'),
    basedOnVersion: 2,
    content: {} as ConfigProposal['content'],
    status: 'pending',
  },
  {
    id: 'prop-2',
    scope: 'org',
    scopeId: DEMO_ORG,
    proposedBy: 'david-nguyen',
    proposedAt: new Date('2026-03-08T10:30:00Z'),
    basedOnVersion: 2,
    content: {} as ConfigProposal['content'],
    status: 'approved',
    reviewedBy: 'sarah-chen',
    reviewedAt: new Date('2026-03-08T11:15:00Z'),
    reviewComment: 'WebFetch is needed for the frontend team — approved.',
  },
  {
    id: 'prop-3',
    scope: 'project',
    scopeId: 'acme-corp/web-app',
    proposedBy: 'maya-patel',
    proposedAt: new Date('2026-03-07T09:00:00Z'),
    basedOnVersion: 1,
    content: {} as ConfigProposal['content'],
    status: 'approved',
    reviewedBy: 'alex-kim',
    reviewedAt: new Date('2026-03-07T10:30:00Z'),
    reviewComment: 'LGTM — the new /review-pr command follows our security guidelines.',
  },
  {
    id: 'prop-4',
    scope: 'org',
    scopeId: DEMO_ORG,
    proposedBy: 'priya-sharma',
    proposedAt: new Date('2026-03-06T16:45:00Z'),
    basedOnVersion: 1,
    content: {} as ConfigProposal['content'],
    status: 'rejected',
    reviewedBy: 'sarah-chen',
    reviewedAt: new Date('2026-03-06T17:20:00Z'),
    reviewComment: 'pypi.org and crates.io need InfoSec sign-off first. Please file a ticket.',
  },
  {
    id: 'prop-5',
    scope: 'org',
    scopeId: DEMO_ORG,
    proposedBy: 'alex-kim',
    proposedAt: new Date('2026-03-10T08:00:00Z'),
    basedOnVersion: 3,
    content: {} as ConfigProposal['content'],
    status: 'pending',
  },
]

// ---------------------------------------------------------------------------
// Demo GitHub installation status (used by Discovery and Approved Config pages)
// ---------------------------------------------------------------------------

export const DEMO_GITHUB_STATUS: GitHubInstallationStatus = {
  installed: true,
  organizations: ['acme-corp'],
  installations: [
    {
      organization: 'acme-corp',
      installed: true,
      installationId: 9999,
      installedAt: '2025-11-15T10:00:00Z',
      permissions: { contents: 'read', metadata: 'read', pull_requests: 'read' },
      repositorySelection: 'all',
    },
  ],
  hasInstallations: true,
  totalInstalled: 12,
  totalOrgs: 1,
}

// ---------------------------------------------------------------------------
// Demo platform stats (used by Discovery page)
// ---------------------------------------------------------------------------

export const DEMO_PLATFORM_STATS = {
  claude: 45,
  cursor: 12,
  copilot: 8,
  windsurf: 3,
  gemini: 6,
  codex: 4,
}

// ---------------------------------------------------------------------------
// Demo discovered config groups (used by Discovery page)
// ---------------------------------------------------------------------------

const _DEMO_NOW = '2026-03-10T09:00:00Z'

export const DEMO_DISCOVERED_CONFIG_GROUPS: DiscoveredConfigGroup[] = [
  {
    name: 'CLAUDE.md',
    type: 'instructions',
    platform: 'claude',
    instances: [
      { repo: 'acme-corp/web-app', path: 'CLAUDE.md', content: '# Acme Corp Web App\n\nAlways follow our security policy. Use TypeScript strictly.', lastModified: _DEMO_NOW, hash: 'hash-a1' },
      { repo: 'acme-corp/api', path: 'CLAUDE.md', content: '# Acme Corp API\n\nFollow REST conventions. Validate all inputs.', lastModified: _DEMO_NOW, hash: 'hash-a2' },
      { repo: 'acme-corp/infra', path: 'CLAUDE.md', content: '# Acme Corp Infra\n\nTerraform only. No manual cloud console changes.', lastModified: _DEMO_NOW, hash: 'hash-a3' },
    ],
    approvedStatus: 'org',
  },
  {
    name: 'review-pr',
    type: 'command',
    platform: 'claude',
    instances: [
      { repo: 'acme-corp/web-app', path: '.claude/commands/review-pr.md', content: '# Review PR\n\nAnalyze for security issues, test coverage, and code quality.', lastModified: _DEMO_NOW, hash: 'hash-b1' },
      { repo: 'acme-corp/api', path: '.claude/commands/review-pr.md', content: '# Review PR\n\nCheck API routes for input validation and authentication.', lastModified: _DEMO_NOW, hash: 'hash-b2' },
    ],
    approvedStatus: 'org',
  },
  {
    name: 'commit',
    type: 'command',
    platform: 'claude',
    instances: [
      { repo: 'acme-corp/web-app', path: '.claude/commands/commit.md', content: '# Commit\n\nCreate a conventional commit with semantic versioning.', lastModified: _DEMO_NOW, hash: 'hash-c1' },
    ],
    approvedStatus: 'none',
  },
  {
    name: 'pre-commit',
    type: 'hook',
    platform: 'claude',
    instances: [
      { repo: 'acme-corp/web-app', path: '.claude/hooks/pre-commit.json', content: '{"event":"PreCommit","command":"npm run lint && npm run test:unit"}', lastModified: _DEMO_NOW, hash: 'hash-d1' },
      { repo: 'acme-corp/api', path: '.claude/hooks/pre-commit.json', content: '{"event":"PreCommit","command":"pnpm lint && pnpm test:unit"}', lastModified: _DEMO_NOW, hash: 'hash-d2' },
    ],
    approvedStatus: 'org',
  },
  {
    name: 'settings',
    type: 'settings',
    platform: 'claude',
    instances: [
      { repo: 'acme-corp/web-app', path: '.claude/settings.json', content: '{"permissions":{"allow":["Read","Edit","Bash"],"deny":["WebFetch"]}}', lastModified: _DEMO_NOW, hash: 'hash-e1' },
      { repo: 'acme-corp/api', path: '.claude/settings.json', content: '{"permissions":{"allow":["Read","Edit","Bash"],"deny":["WebFetch","WebSearch"]}}', lastModified: _DEMO_NOW, hash: 'hash-e2' },
      { repo: 'acme-corp/infra', path: '.claude/settings.json', content: '{"permissions":{"allow":["Read"],"deny":["Edit","Bash","WebFetch"]}}', lastModified: _DEMO_NOW, hash: 'hash-e3' },
    ],
    approvedStatus: 'org',
  },
  {
    name: '.cursorrules',
    type: 'cursorRules',
    platform: 'cursor',
    instances: [
      { repo: 'acme-corp/web-app', path: '.cursorrules', content: 'Always use TypeScript. Prefer functional components. Follow Acme Corp style guide.', lastModified: _DEMO_NOW, hash: 'hash-f1' },
    ],
    approvedStatus: 'none',
  },
  {
    name: 'mcp-servers',
    type: 'mcp',
    platform: 'claude',
    instances: [
      { repo: 'acme-corp/web-app', path: '.mcp.json', content: '{"mcpServers":{"github":{"command":"npx","args":["-y","@modelcontextprotocol/server-github"]}}}', lastModified: _DEMO_NOW, hash: 'hash-g1' },
    ],
    approvedStatus: 'none',
  },
  {
    name: 'code-review',
    type: 'subagent',
    platform: 'claude',
    instances: [
      { repo: 'acme-corp/api', path: '.claude/agents/code-review.md', content: '# Code Review Agent\n\nSpecialized agent for reviewing backend API code.', lastModified: _DEMO_NOW, hash: 'hash-h1' },
    ],
    approvedStatus: 'none',
  },
]

// ---------------------------------------------------------------------------
// Demo approved config response (used by Approved Config page)
// ---------------------------------------------------------------------------

export const DEMO_APPROVED_CONFIG_RESPONSE: ApprovedConfigResponse = {
  approved: true,
  hash: 'demo-approved-hash-v3',
  version: '3',
  platform: 'claude',
  policyName: 'security-baseline',
  approvedBy: 'sarah.chen',
  approvedAt: '2026-03-08T11:00:00Z',
  updatedAt: '2026-03-08T11:00:00Z',
  instructions: {
    content: `# Acme Corp AI Governance Policy

All AI agents operating within Acme Corp repositories must adhere to the following guidelines:

## Security
- Never expose secrets, API keys, or credentials
- Do not access external URLs unless explicitly approved
- Always validate inputs and sanitize outputs

## Code Quality
- Follow TypeScript strict mode
- All changes must include unit tests
- Use conventional commits

## Scope Restrictions
- Do not modify CI/CD pipeline files without approval
- Infrastructure changes require human review

_Policy version 3 — approved by Security Team_`,
    sourceRepo: 'acme-corp/governance',
    sourcePath: 'policies/claude-policy.md',
    hash: 'policy-hash-v3',
  },
  commands: [
    {
      name: 'review-pr',
      content: `# Review Pull Request

Analyze this pull request for:
1. Security vulnerabilities (injection, XSS, auth bypass)
2. Test coverage (minimum 80% for new code)
3. TypeScript type safety
4. Performance regressions

Report findings with severity: critical / high / medium / low`,
      sourceRepo: 'acme-corp/governance',
      sourcePath: 'commands/review-pr.md',
      hash: 'cmd-review-hash',
    },
    {
      name: 'commit',
      content: `# Commit

Create a semantic commit message following Conventional Commits:
- feat: new feature
- fix: bug fix
- chore: maintenance
- docs: documentation only

Include the ticket number if applicable.`,
      sourceRepo: 'acme-corp/governance',
      sourcePath: 'commands/commit.md',
      hash: 'cmd-commit-hash',
    },
    {
      name: 'security-scan',
      content: `# Security Scan

Perform a security audit of the current changes:
1. Check for hardcoded credentials
2. Validate dependency versions against CVE database
3. Review authentication and authorization logic`,
      sourceRepo: 'acme-corp/governance',
      sourcePath: 'commands/security-scan.md',
      hash: 'cmd-security-hash',
    },
  ],
  hooks: [
    {
      name: 'pre-commit',
      content: '{"event":"PreCommit","command":"pnpm lint && pnpm test:unit"}',
      sourceRepo: 'acme-corp/governance',
      sourcePath: 'hooks/pre-commit.json',
      hash: 'hook-precommit-hash',
    },
    {
      name: 'post-tool-use',
      content: '{"event":"PostToolUse","command":"gal audit --tool $TOOL_NAME"}',
      sourceRepo: 'acme-corp/governance',
      sourcePath: 'hooks/post-tool-use.json',
      hash: 'hook-posttool-hash',
    },
  ],
  settings: {
    content: JSON.stringify({
      permissions: {
        allow: ['Read', 'Edit', 'Bash', 'Glob', 'Grep'],
        deny: ['WebFetch', 'WebSearch'],
      },
    }, null, 2),
    sourceRepo: 'acme-corp/governance',
    sourcePath: 'settings/claude-settings.json',
    hash: 'settings-hash',
  },
  subagents: [
    {
      name: 'code-reviewer',
      content: `---
name: code-reviewer
description: Specialized agent for security-focused code reviews
---
# Code Reviewer Agent

You are a security-focused code review specialist for Acme Corp.
Focus on authentication, authorization, input validation, and data exposure.`,
      sourceRepo: 'acme-corp/governance',
      sourcePath: 'agents/code-reviewer.md',
      hash: 'agent-reviewer-hash',
    },
  ],
}

// ---------------------------------------------------------------------------
// Demo team members (used by Team page)
// ---------------------------------------------------------------------------

export const DEMO_TEAM_LIVE_RESPONSE: TeamMembersLiveResponse = {
  members: [
    { userId: 'user-sarah-001', githubLogin: 'sarah-chen', githubId: 10001, name: 'Sarah Chen', email: 'sarah.chen@acme-corp.com', avatarUrl: 'https://avatars.githubusercontent.com/u/10001', githubOrgRole: 'admin', galRole: 'owner' },
    { userId: 'user-alex-002', githubLogin: 'alex-kim', githubId: 10002, name: 'Alex Kim', email: 'alex.kim@acme-corp.com', avatarUrl: 'https://avatars.githubusercontent.com/u/10002', githubOrgRole: 'admin', galRole: 'admin', roleAssignedBy: 'sarah-chen', roleAssignedAt: new Date('2025-12-01') },
    { userId: 'user-maya-003', githubLogin: 'maya-patel', githubId: 10003, name: 'Maya Patel', email: 'maya.patel@acme-corp.com', avatarUrl: 'https://avatars.githubusercontent.com/u/10003', githubOrgRole: 'admin', galRole: 'admin', roleAssignedBy: 'sarah-chen', roleAssignedAt: new Date('2025-12-15') },
    { userId: 'user-james-004', githubLogin: 'james-okonkwo', githubId: 10004, name: 'James Okonkwo', email: 'james.okonkwo@acme-corp.com', avatarUrl: 'https://avatars.githubusercontent.com/u/10004', githubOrgRole: 'member', galRole: 'developer' },
    { userId: 'user-priya-005', githubLogin: 'priya-sharma', githubId: 10005, name: 'Priya Sharma', email: 'priya.sharma@acme-corp.com', avatarUrl: 'https://avatars.githubusercontent.com/u/10005', githubOrgRole: 'member', galRole: 'developer' },
    { userId: 'user-david-006', githubLogin: 'david-nguyen', githubId: 10006, name: 'David Nguyen', email: 'david.nguyen@acme-corp.com', avatarUrl: 'https://avatars.githubusercontent.com/u/10006', githubOrgRole: 'member', galRole: 'developer' },
    { userId: 'user-lisa-007', githubLogin: 'lisa-rodriguez', githubId: 10007, name: 'Lisa Rodriguez', email: 'lisa.rodriguez@acme-corp.com', avatarUrl: 'https://avatars.githubusercontent.com/u/10007', githubOrgRole: 'member', galRole: 'developer' },
    { userId: 'user-tom-008', githubLogin: 'tom-wilson', githubId: 10008, name: 'Tom Wilson', email: 'tom.wilson@acme-corp.com', avatarUrl: 'https://avatars.githubusercontent.com/u/10008', githubOrgRole: 'member', galRole: 'developer' },
  ],
  totalMembers: 8,
  lastSyncedAt: '2026-03-10T09:00:00Z',
  syncedBy: 'github-app',
  cacheStatus: 'fresh',
  owners: 1,
  admins: 2,
  developers: 5,
}

// ---------------------------------------------------------------------------
// Demo developer status summary (used by Team page — matches local interface)
// ---------------------------------------------------------------------------

export const DEMO_DEVELOPER_STATUS: DeveloperStatusSummary = {
  organization: DEMO_ORG,
  totalDevelopers: 8,
  cliInstalled: 7,
  authenticated: 6,
  authExpired: 1,
  syncedToLatest: 5,
  outOfSync: 2,
  neverSynced: 1,
  developers: [
    {
      githubLogin: 'sarah-chen',
      cliInstalled: true,
      authenticated: true,
      lastSyncAt: '2026-03-10T08:00:00Z',
      syncStatus: 'synced' as const,
      syncedPlatforms: ['claude', 'cursor', 'codex'],
      platformSync: {
        claude: { syncStatus: 'synced' as const, lastSyncAt: '2026-03-10T08:00:00Z', syncedConfigVersion: '3' },
        cursor: { syncStatus: 'synced' as const, lastSyncAt: '2026-03-10T07:58:00Z', syncedConfigVersion: '3' },
        codex: { syncStatus: 'synced' as const, lastSyncAt: '2026-03-10T07:57:00Z', syncedConfigVersion: '3' },
      },
    },
    {
      githubLogin: 'alex-kim',
      cliInstalled: true,
      authenticated: true,
      lastSyncAt: '2026-03-10T08:30:00Z',
      syncStatus: 'synced' as const,
      syncedPlatforms: ['claude', 'gemini'],
      platformSync: {
        claude: { syncStatus: 'synced' as const, lastSyncAt: '2026-03-10T08:30:00Z', syncedConfigVersion: '3' },
        gemini: { syncStatus: 'synced' as const, lastSyncAt: '2026-03-10T08:25:00Z', syncedConfigVersion: '3' },
      },
    },
    {
      githubLogin: 'maya-patel',
      cliInstalled: true,
      authenticated: true,
      lastSyncAt: '2026-03-09T17:00:00Z',
      syncStatus: 'synced' as const,
      syncedPlatforms: ['claude', 'cursor'],
      platformSync: {
        claude: { syncStatus: 'synced' as const, lastSyncAt: '2026-03-09T17:00:00Z', syncedConfigVersion: '3' },
        cursor: { syncStatus: 'synced' as const, lastSyncAt: '2026-03-09T16:58:00Z', syncedConfigVersion: '3' },
      },
    },
    {
      githubLogin: 'james-okonkwo',
      cliInstalled: true,
      authenticated: true,
      lastSyncAt: '2026-03-08T16:00:00Z',
      syncStatus: 'outdated' as const,
      syncedPlatforms: ['claude', 'cursor'],
      platformSync: {
        claude: { syncStatus: 'outdated' as const, lastSyncAt: '2026-03-08T16:00:00Z', syncedConfigVersion: '2' },
        cursor: { syncStatus: 'outdated' as const, lastSyncAt: '2026-03-08T15:55:00Z', syncedConfigVersion: '2' },
      },
    },
    {
      githubLogin: 'priya-sharma',
      cliInstalled: true,
      authenticated: true,
      lastSyncAt: '2026-03-10T07:00:00Z',
      syncStatus: 'synced' as const,
      syncedPlatforms: ['claude', 'copilot'],
      platformSync: {
        claude: { syncStatus: 'synced' as const, lastSyncAt: '2026-03-10T07:00:00Z', syncedConfigVersion: '3' },
        copilot: { syncStatus: 'synced' as const, lastSyncAt: '2026-03-10T06:57:00Z', syncedConfigVersion: '3' },
      },
    },
    {
      githubLogin: 'david-nguyen',
      cliInstalled: true,
      authenticated: false,
      lastSyncAt: '2026-03-07T14:00:00Z',
      syncStatus: 'outdated' as const,
      syncedPlatforms: ['claude'],
      platformSync: {
        claude: { syncStatus: 'outdated' as const, lastSyncAt: '2026-03-07T14:00:00Z', syncedConfigVersion: '2' },
      },
    },
    {
      githubLogin: 'lisa-rodriguez',
      cliInstalled: true,
      authenticated: true,
      lastSyncAt: null,
      syncStatus: 'never_synced' as const,
      syncedPlatforms: [],
      platformSync: {},
    },
    {
      githubLogin: 'tom-wilson',
      cliInstalled: false,
      authenticated: false,
      lastSyncAt: null,
      syncStatus: 'never_synced' as const,
      syncedPlatforms: [],
      platformSync: {},
    },
  ],
}

// ---------------------------------------------------------------------------
// Demo provider usage (used by Team page — matches local interface)
// ---------------------------------------------------------------------------

export const DEMO_PROVIDER_USAGE = {
  developers: [
    {
      userId: 'user-sarah-001',
      githubLogin: 'sarah-chen',
      providers: [{ provider: 'anthropic', currentUsage: 42000, limit: 100000, usagePercent: 42, healthState: 'ok' as const, lastUpdatedAt: _DEMO_NOW }],
      overallHealthState: 'ok' as const,
    },
    {
      userId: 'user-alex-002',
      githubLogin: 'alex-kim',
      providers: [
        { provider: 'anthropic', currentUsage: 78000, limit: 100000, usagePercent: 78, healthState: 'warning' as const, lastUpdatedAt: _DEMO_NOW },
        { provider: 'google', currentUsage: 12000, limit: 50000, usagePercent: 24, healthState: 'ok' as const, lastUpdatedAt: _DEMO_NOW },
      ],
      overallHealthState: 'warning' as const,
    },
    {
      userId: 'user-maya-003',
      githubLogin: 'maya-patel',
      providers: [{ provider: 'anthropic', currentUsage: 25000, limit: 100000, usagePercent: 25, healthState: 'ok' as const, lastUpdatedAt: _DEMO_NOW }],
      overallHealthState: 'ok' as const,
    },
    {
      userId: 'user-james-004',
      githubLogin: 'james-okonkwo',
      providers: [{ provider: 'anthropic', currentUsage: 91000, limit: 100000, usagePercent: 91, healthState: 'critical' as const, lastUpdatedAt: _DEMO_NOW }],
      overallHealthState: 'critical' as const,
    },
    {
      userId: 'user-priya-005',
      githubLogin: 'priya-sharma',
      providers: [{ provider: 'openai', currentUsage: 8000, limit: 50000, usagePercent: 16, healthState: 'ok' as const, lastUpdatedAt: _DEMO_NOW }],
      overallHealthState: 'ok' as const,
    },
    {
      userId: 'user-david-006',
      githubLogin: 'david-nguyen',
      providers: [{ provider: 'anthropic', currentUsage: 33000, limit: 100000, usagePercent: 33, healthState: 'ok' as const, lastUpdatedAt: _DEMO_NOW }],
      overallHealthState: 'ok' as const,
    },
    {
      userId: 'user-lisa-007',
      githubLogin: 'lisa-rodriguez',
      providers: [{ provider: 'anthropic', currentUsage: 61000, limit: 100000, usagePercent: 61, healthState: 'warning' as const, lastUpdatedAt: _DEMO_NOW }],
      overallHealthState: 'warning' as const,
    },
    {
      userId: 'user-tom-008',
      githubLogin: 'tom-wilson',
      providers: [{ provider: 'anthropic', currentUsage: 15000, limit: 100000, usagePercent: 15, healthState: 'ok' as const, lastUpdatedAt: _DEMO_NOW }],
      overallHealthState: 'ok' as const,
    },
  ],
}

// ---------------------------------------------------------------------------
// Audit Logs
// ---------------------------------------------------------------------------

export const DEMO_AUDIT_LOG_ENTRIES: AuditLogEntryResponse[] = [
  {
    id: 'audit-001',
    orgName: DEMO_ORG,
    userId: 'user-sarah-001',
    userName: 'sarah-chen',
    sessionType: 'cli',
    action: 'config_change',
    details: { field: 'model', from: 'claude-3-opus', to: 'claude-sonnet-4-5' },
    severity: 'info',
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    projectId: 'acme-corp/backend-api',
  },
  {
    id: 'audit-002',
    orgName: DEMO_ORG,
    userId: 'user-alex-002',
    userName: 'alex-kim',
    sessionType: 'vscode',
    action: 'policy_violation',
    details: { policy: 'no-write-outside-project', path: '/etc/hosts' },
    severity: 'critical',
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    projectId: 'acme-corp/frontend',
    sessionId: 'sess-alex-456',
  },
  {
    id: 'audit-003',
    orgName: DEMO_ORG,
    userId: 'user-maya-003',
    userName: 'maya-patel',
    sessionType: 'background-agent',
    action: 'bash_command',
    details: { command: 'npm run test', exitCode: 0 },
    severity: 'info',
    timestamp: new Date(Date.now() - 1000 * 60 * 62).toISOString(),
    projectId: 'acme-corp/data-pipeline',
    sessionId: 'sess-maya-789',
  },
  {
    id: 'audit-004',
    orgName: DEMO_ORG,
    userId: 'user-james-004',
    userName: 'james-okonkwo',
    sessionType: 'cli',
    action: 'file_edit',
    details: { file: 'src/auth/token.ts', linesChanged: 42 },
    severity: 'warning',
    timestamp: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    projectId: 'acme-corp/auth-service',
  },
  {
    id: 'audit-005',
    orgName: DEMO_ORG,
    userId: 'user-priya-005',
    userName: 'priya-sharma',
    sessionType: 'dashboard',
    action: 'tool_call',
    details: { tool: 'Bash', input: 'git status' },
    severity: 'info',
    timestamp: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    projectId: 'acme-corp/infra',
  },
]

export const DEMO_AUDIT_SUMMARY: AuditSummaryResponse = {
  totalEntries: 847,
  byAction: { tool_call: 312, file_edit: 245, bash_command: 189, config_change: 67, policy_violation: 34 },
  byUser: { 'sarah-chen': 198, 'alex-kim': 221, 'maya-patel': 176, 'james-okonkwo': 152, 'priya-sharma': 100 },
  bySessionType: { cli: 401, vscode: 233, 'background-agent': 148, dashboard: 65 },
  bySeverity: { info: 712, warning: 101, critical: 34 },
  period: {
    start: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    end: _DEMO_NOW,
  },
}

export const DEMO_AUDIT_ALERTS: AuditAlertResponse[] = [
  {
    id: 'alert-001',
    auditLogId: 'audit-002',
    orgName: DEMO_ORG,
    userId: 'user-alex-002',
    userName: 'alex-kim',
    sessionType: 'vscode',
    action: 'policy_violation',
    severity: 'critical',
    details: { policy: 'no-write-outside-project', path: '/etc/hosts' },
    timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    projectId: 'acme-corp/frontend',
    sessionId: 'sess-alex-456',
    status: 'open',
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
  },
  {
    id: 'alert-002',
    auditLogId: 'audit-006',
    orgName: DEMO_ORG,
    userId: 'user-james-004',
    userName: 'james-okonkwo',
    sessionType: 'cli',
    action: 'policy_violation',
    severity: 'warning',
    details: { policy: 'require-approved-model', model: 'gpt-4o' },
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    projectId: 'acme-corp/auth-service',
    status: 'acknowledged',
    createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
  },
]

// ---------------------------------------------------------------------------
// Project Overrides (Enforcement)
// ---------------------------------------------------------------------------

export const DEMO_PROJECT_OVERRIDES: ProjectOverride[] = [
  {
    id: 'override-001',
    projectName: 'acme-corp/frontend',
    policyType: 'domain-allowlist',
    definition: { domains: ['api.stripe.com', 'cdn.jsdelivr.net'] },
    status: 'approved',
    reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    reviewedBy: 'sarah-chen',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    createdBy: 'alex-kim',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
  {
    id: 'override-002',
    projectName: 'acme-corp/data-pipeline',
    policyType: 'tool-allowlist',
    definition: { tools: ['Bash', 'Read', 'Write', 'WebFetch'] },
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    createdBy: 'maya-patel',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'override-003',
    projectName: 'acme-corp/auth-service',
    policyType: 'model-allowlist',
    definition: { models: ['claude-3-5-sonnet-20241022'] },
    status: 'rejected',
    rejectionReason: 'Non-approved model requested. Use claude-sonnet-4-5 instead.',
    reviewedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    reviewedBy: 'sarah-chen',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    createdBy: 'james-okonkwo',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
]

// ---------------------------------------------------------------------------
// Agent Security Policies (Enforcement)
// ---------------------------------------------------------------------------

export const DEMO_AGENT_SECURITY_POLICIES: AgentSecurityPolicyItem[] = [
  {
    id: 'policy-001',
    orgName: DEMO_ORG,
    name: 'Production Baseline',
    description: 'Baseline policy for all production repositories. Restricts network access and dangerous tools.',
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep'],
    blockedTools: ['WebSearch', 'computer'],
    allowedFilePatterns: ['src/**', 'tests/**', 'docs/**'],
    blockedFilePatterns: ['.env', '*.pem', '*.key', 'secrets/**'],
    networkRestrictions: {
      allowedDomains: ['api.github.com', 'registry.npmjs.org', 'pypi.org'],
      blockedDomains: ['*.onion', 'pastebin.com'],
    },
    enabled: true,
    priority: 1,
    createdBy: 'sarah-chen',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
  {
    id: 'policy-002',
    orgName: DEMO_ORG,
    name: 'Data Engineering Override',
    description: 'Extended permissions for the data engineering team to access external data sources.',
    allowedTools: ['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'WebFetch'],
    blockedTools: ['computer'],
    allowedFilePatterns: ['pipelines/**', 'notebooks/**', 'data/**'],
    blockedFilePatterns: ['.env', '*.pem'],
    networkRestrictions: {
      allowedDomains: ['api.github.com', 'storage.googleapis.com', 's3.amazonaws.com', 'data.acme.internal'],
      blockedDomains: [],
    },
    enabled: true,
    priority: 2,
    createdBy: 'maya-patel',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 14).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
]

// ---------------------------------------------------------------------------
// Enforcement Compliance Status
// ---------------------------------------------------------------------------

export const DEMO_ENFORCEMENT_COMPLIANCE: ComplianceStatusResponse = {
  repos: [
    { name: 'acme-corp/backend-api', hasSettingsFile: true, missingDenyRules: [], status: 'compliant' },
    { name: 'acme-corp/frontend', hasSettingsFile: true, missingDenyRules: [], status: 'compliant' },
    { name: 'acme-corp/data-pipeline', hasSettingsFile: true, missingDenyRules: ['deny_bash_network'], status: 'non-compliant' },
    { name: 'acme-corp/auth-service', hasSettingsFile: true, missingDenyRules: [], status: 'compliant' },
    { name: 'acme-corp/infra', hasSettingsFile: false, missingDenyRules: [], status: 'missing-file' },
    { name: 'acme-corp/docs', hasSettingsFile: true, missingDenyRules: [], status: 'compliant' },
  ],
  summary: { total: 6, compliant: 4, nonCompliant: 1, missingFile: 1 },
}

// ---------------------------------------------------------------------------
// Enforcement Settings
// ---------------------------------------------------------------------------

export const DEMO_ENFORCEMENT_SETTINGS = {
  enabled: true,
  enforcementLevel: 'warn' as const,
  platforms: [
    { id: 'claude', label: 'Claude', enabled: true },
    { id: 'cursor', label: 'Cursor', enabled: true },
    { id: 'copilot', label: 'Copilot', enabled: false },
    { id: 'gemini', label: 'Gemini', enabled: true },
    { id: 'codex', label: 'Codex', enabled: false },
    { id: 'windsurf', label: 'Windsurf', enabled: false },
  ],
  gracePeriodDays: 14,
  notificationsEnabled: true,
}

// ---------------------------------------------------------------------------
// Developer Compliance (compliance/developers)
// ---------------------------------------------------------------------------

export const DEMO_DEVELOPER_COMPLIANCE = {
  organization: DEMO_ORG,
  totalDevelopers: 5,
  compliant: 4,
  nonCompliant: 1,
  neverSynced: 0,
  compliancePercent: 80,
  developers: [
    {
      developerId: 'sarah-chen',
      settingsHash: 'a1b2c3d4',
      orgHash: 'a1b2c3d4',
      lastSyncTime: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      driftDetected: false,
      lastReportedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      cliVersion: '1.4.2',
      hostname: 'sarah-mbp.local',
      reportCount: 47,
    },
    {
      developerId: 'alex-kim',
      settingsHash: 'e5f6g7h8',
      orgHash: 'a1b2c3d4',
      lastSyncTime: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      driftDetected: true,
      lastReportedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      cliVersion: '1.4.1',
      hostname: 'alex-dev.local',
      reportCount: 83,
    },
    {
      developerId: 'maya-patel',
      settingsHash: 'a1b2c3d4',
      orgHash: 'a1b2c3d4',
      lastSyncTime: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      driftDetected: false,
      lastReportedAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      cliVersion: '1.4.2',
      hostname: 'maya-pro.local',
      reportCount: 62,
    },
    {
      developerId: 'james-okonkwo',
      settingsHash: 'a1b2c3d4',
      orgHash: 'a1b2c3d4',
      lastSyncTime: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      driftDetected: false,
      lastReportedAt: new Date(Date.now() - 1000 * 60 * 60).toISOString(),
      cliVersion: '1.4.2',
      hostname: 'james-workstation.local',
      reportCount: 38,
    },
    {
      developerId: 'priya-sharma',
      settingsHash: 'a1b2c3d4',
      orgHash: 'a1b2c3d4',
      lastSyncTime: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
      driftDetected: false,
      lastReportedAt: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
      cliVersion: '1.4.2',
      hostname: 'priya-m1.local',
      reportCount: 29,
    },
  ],
  lastUpdated: _DEMO_NOW,
}

// ---------------------------------------------------------------------------
// SDLC Compliance
// ---------------------------------------------------------------------------

export const DEMO_SDLC_COMPLIANCE_STATUS: SdlcComplianceStatus = {
  orgName: DEMO_ORG,
  totalProjects: 12,
  compliantProjects: 10,
  driftedProjects: 2,
  projects: [
    { projectId: 'backend-api-341', currentPhase: 7, lastTransition: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(), skippedPhases: [], isCompliant: true },
    { projectId: 'frontend-512', currentPhase: 5, lastTransition: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(), skippedPhases: [], isCompliant: true },
    { projectId: 'data-pipeline-287', currentPhase: 4, lastTransition: new Date(Date.now() - 1000 * 60 * 60 * 1).toISOString(), skippedPhases: [3], isCompliant: false },
    { projectId: 'auth-service-199', currentPhase: 6, lastTransition: new Date(Date.now() - 1000 * 60 * 30).toISOString(), skippedPhases: [], isCompliant: true },
    { projectId: 'infra-tooling-88', currentPhase: 3, lastTransition: new Date(Date.now() - 1000 * 60 * 45).toISOString(), skippedPhases: [2], isCompliant: false },
    { projectId: 'docs-site-64', currentPhase: 7, lastTransition: new Date(Date.now() - 1000 * 60 * 60 * 10).toISOString(), skippedPhases: [], isCompliant: true },
  ],
}

export const DEMO_SDLC_DRIFT_REPORT: SdlcDriftReport = {
  orgName: DEMO_ORG,
  driftDetected: true,
  driftItems: [
    {
      projectId: 'data-pipeline-287',
      issueNumber: 287,
      skippedPhases: [3],
      fromPhase: 2,
      toPhase: 4,
      actor: 'maya-patel',
      detectedAt: new Date(Date.now() - 1000 * 60 * 60 * 1).toISOString(),
    },
    {
      projectId: 'infra-tooling-88',
      issueNumber: 88,
      skippedPhases: [2],
      fromPhase: 1,
      toPhase: 3,
      actor: 'james-okonkwo',
      detectedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    },
  ],
  summary: {
    totalTransitions: 34,
    compliantTransitions: 32,
    driftedTransitions: 2,
    complianceRate: 0.941,
  },
}

// ---------------------------------------------------------------------------
// Domain Compliance
// ---------------------------------------------------------------------------

export const DEMO_DOMAIN_STATS: DomainStatsResponse = {
  stats: [
    { domain: 'api.github.com', totalRequests: 1842, blockedRequests: 0, lastAccessed: new Date(Date.now() - 1000 * 60 * 5).toISOString() },
    { domain: 'registry.npmjs.org', totalRequests: 934, blockedRequests: 0, lastAccessed: new Date(Date.now() - 1000 * 60 * 12).toISOString() },
    { domain: 'api.stripe.com', totalRequests: 287, blockedRequests: 0, lastAccessed: new Date(Date.now() - 1000 * 60 * 45).toISOString() },
    { domain: 'pastebin.com', totalRequests: 12, blockedRequests: 12, lastAccessed: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString() },
    { domain: 'storage.googleapis.com', totalRequests: 642, blockedRequests: 0, lastAccessed: new Date(Date.now() - 1000 * 60 * 20).toISOString() },
    { domain: 'raw.githubusercontent.com', totalRequests: 523, blockedRequests: 0, lastAccessed: new Date(Date.now() - 1000 * 60 * 8).toISOString() },
  ],
  period: { days: 7 },
  repo: null,
}

export const DEMO_DOMAIN_ALERTS: DomainAlertsResponse = {
  alerts: [
    {
      sessionId: 'sess-alex-456',
      blockedCount: 12,
      domains: ['pastebin.com'],
      repoName: 'acme-corp/frontend',
      lastSeen: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    },
  ],
  threshold: 5,
}

export const DEMO_DOMAIN_ANOMALIES: DomainAnomaliesResponse = {
  anomalies: [
    {
      sessionId: 'sess-maya-789',
      distinctDomains: 18,
      domains: ['api1.acme.internal', 'api2.acme.internal', 'data.acme.internal', 'storage.acme.internal'],
      repoName: 'acme-corp/data-pipeline',
      totalRequests: 342,
      lastSeen: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
      type: 'excessive-domain-count',
    },
  ],
  threshold: 15,
}

export const DEMO_DOMAIN_REPO_BREAKDOWN: DomainRepoBreakdownResponse = {
  repos: [
    { repoName: 'acme-corp/backend-api', totalRequests: 1124, blockedRequests: 0, distinctDomains: 6 },
    { repoName: 'acme-corp/frontend', totalRequests: 789, blockedRequests: 12, distinctDomains: 8 },
    { repoName: 'acme-corp/data-pipeline', totalRequests: 1532, blockedRequests: 0, distinctDomains: 18 },
    { repoName: 'acme-corp/auth-service', totalRequests: 423, blockedRequests: 0, distinctDomains: 4 },
    { repoName: 'acme-corp/infra', totalRequests: 372, blockedRequests: 0, distinctDomains: 5 },
  ],
  period: { days: 7 },
}

export const DEMO_DOMAIN_EXCEPTIONS: DomainExceptionsResponse = {
  exceptions: [
    {
      id: 'domain-exc-001',
      domain: 'api.stripe.com',
      orgName: DEMO_ORG,
      repoName: 'acme-corp/frontend',
      approvedBy: 'sarah-chen',
      approvedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
      justification: 'Payment integration requires direct Stripe API access for webhook validation.',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 25).toISOString(),
      expired: false,
    },
  ],
}

// ---------------------------------------------------------------------------
// Tool Compliance
// ---------------------------------------------------------------------------

export const DEMO_TOOL_COMPLIANCE_STATUS: ToolComplianceStatusResponse = {
  repos: [
    { repo: 'acme-corp/backend-api', status: 'compliant', missingRules: [], lastSyncHash: 'a1b2c3d4', currentHash: 'a1b2c3d4', drifted: false, exceptionCount: 0 },
    { repo: 'acme-corp/frontend', status: 'has_exceptions', missingRules: [], lastSyncHash: 'e5f6g7h8', currentHash: 'e5f6g7h8', drifted: false, exceptionCount: 1 },
    { repo: 'acme-corp/data-pipeline', status: 'missing_deny_rules', missingRules: ['deny_bash_network', 'deny_web_search'], lastSyncHash: null, currentHash: null, drifted: false, exceptionCount: 0 },
    { repo: 'acme-corp/auth-service', status: 'compliant', missingRules: [], lastSyncHash: 'i9j0k1l2', currentHash: 'i9j0k1l2', drifted: false, exceptionCount: 0 },
    { repo: 'acme-corp/infra', status: 'missing_file', missingRules: [], lastSyncHash: null, currentHash: null, drifted: false, exceptionCount: 0 },
    { repo: 'acme-corp/docs', status: 'drifted', missingRules: [], lastSyncHash: 'm3n4o5p6', currentHash: 'q7r8s9t0', drifted: true, exceptionCount: 0 },
  ],
  summary: { total: 6, compliant: 2, missingFile: 1, missingDenyRules: 1, hasExceptions: 1, drifted: 1 },
}

export const DEMO_TOOL_EXCEPTIONS: ToolExceptionsResponse = {
  exceptions: [
    {
      id: 'tool-exc-001',
      repo: 'acme-corp/frontend',
      rule: 'deny_web_search',
      approvedBy: 'sarah-chen',
      approvedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString(),
      reviewDeadline: new Date(Date.now() + 1000 * 60 * 60 * 24 * 26).toISOString(),
      justification: 'Frontend team needs web search for competitor analysis tooling. Scoped to non-production sessions.',
    },
  ],
  total: 1,
}

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const DEMO_BILLING_STATUS: BillingStatus = {
  planTier: 'enforcement',
  status: 'active',
  currentPeriodEnd: new Date(Date.now() + 1000 * 60 * 60 * 24 * 22).toISOString(),
  cancelAtPeriodEnd: false,
  seatLimit: 25,
  seatsUsed: 5,
}

// ---------------------------------------------------------------------------
// Audit Logs response wrapper (reuses existing DEMO_AUDIT_LOG_ENTRIES)
// ---------------------------------------------------------------------------

export const DEMO_AUDIT_LOGS: AuditLogsResponse = {
  entries: DEMO_AUDIT_LOG_ENTRIES,
  total: DEMO_AUDIT_LOG_ENTRIES.length,
  limit: 50,
  offset: 0,
}

// ---------------------------------------------------------------------------
// System Policies & Enforcement Events
// ---------------------------------------------------------------------------

const DEMO_SYSTEM_POLICY_RULES_NO_SECRET: SystemPolicyRuleItem[] = [
  { type: 'path_pattern', pattern: '**/.env*', action: 'block', message: 'Writing to .env files is not allowed' },
  { type: 'path_pattern', pattern: '**/secrets/**', action: 'block', message: 'Writing to secrets directories is not allowed' },
]

const DEMO_SYSTEM_POLICY_RULES_REQUIRE_TESTS: SystemPolicyRuleItem[] = [
  { type: 'tool_name', pattern: 'Bash', action: 'allow' },
]

const DEMO_SYSTEM_POLICY_RULES_NO_EXTERNAL_COMMITS: SystemPolicyRuleItem[] = [
  { type: 'tool_name', pattern: 'Bash', action: 'block', message: 'Commits to external repositories require approval' },
]

export const DEMO_SYSTEM_POLICIES: SystemPolicyItem[] = [
  {
    id: 'sys-policy-001',
    orgName: DEMO_ORG,
    name: 'no-secret-write',
    scope: 'organization',
    enforcementLevel: 'block',
    rules: DEMO_SYSTEM_POLICY_RULES_NO_SECRET,
    enabled: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
  },
  {
    id: 'sys-policy-002',
    orgName: DEMO_ORG,
    name: 'require-tests',
    scope: 'repository',
    enforcementLevel: 'warn',
    rules: DEMO_SYSTEM_POLICY_RULES_REQUIRE_TESTS,
    enabled: true,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
  {
    id: 'sys-policy-003',
    orgName: DEMO_ORG,
    name: 'no-external-commits',
    scope: 'organization',
    enforcementLevel: 'audit',
    rules: DEMO_SYSTEM_POLICY_RULES_NO_EXTERNAL_COMMITS,
    enabled: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
  },
]

const DEMO_ENFORCEMENT_EVENT_ITEMS: EnforcementEventItem[] = [
  {
    id: 'event-001',
    orgName: DEMO_ORG,
    sessionId: 'sess-vs-003',
    userId: 'user-carol',
    tool: 'Write',
    input: { file_path: '.env.production' },
    decision: {
      allowed: false,
      enforcementLevel: 'block',
      matchedPolicies: [{ policyId: 'sys-policy-001', policyName: 'no-secret-write', ruleIndex: 0, message: 'Writing to .env files is not allowed' }],
      timestamp: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 34).toISOString(),
  },
  {
    id: 'event-002',
    orgName: DEMO_ORG,
    sessionId: 'sess-ba-007',
    userId: 'user-bob',
    tool: 'Bash',
    input: { command: 'npm run test:e2e' },
    decision: {
      allowed: true,
      enforcementLevel: 'warn',
      matchedPolicies: [{ policyId: 'sys-policy-002', policyName: 'require-tests', ruleIndex: 0 }],
      timestamp: new Date(Date.now() - 1000 * 60 * 145).toISOString(),
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 145).toISOString(),
  },
  {
    id: 'event-003',
    orgName: DEMO_ORG,
    sessionId: 'sess-cli-002',
    userId: 'user-bob',
    tool: 'Bash',
    input: { command: 'git push origin main' },
    decision: {
      allowed: true,
      enforcementLevel: 'audit',
      matchedPolicies: [],
      timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    },
    timestamp: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
  },
]

export const DEMO_ENFORCEMENT_EVENTS: EnforcementEventsResponse = {
  events: DEMO_ENFORCEMENT_EVENT_ITEMS,
  total: DEMO_ENFORCEMENT_EVENT_ITEMS.length,
  limit: 50,
}

// ---------------------------------------------------------------------------
// Demo Queue data (used by Sessions > Queue tab)
// ---------------------------------------------------------------------------

export const DEMO_QUEUE_STATUS = {
  pending: 3,
  active: 2,
  completed_today: 14,
  failed_today: 1,
  health: 'healthy' as const,
  orphaned_claimed_count: 0,
}

export const DEMO_QUEUE_STATS = {
  pending: 3,
  active: 2,
  maxActive: 5,
  completed: 14,
  failed: 1,
  consumerPaused: false,
  lastPollAt: new Date(Date.now() - 45 * 1000).toISOString(),
}

export const DEMO_PENDING_WORK_ITEMS = [
  {
    id: 'witem-001',
    priority: 1,
    source: { type: 'github_issue', issueNumber: 142, repository: 'acme-corp/web-app' },
    command: '/sdlc:4-implement:run',
    createdAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
  },
  {
    id: 'witem-002',
    priority: 2,
    source: { type: 'github_pr', prNumber: 87, repository: 'acme-corp/api-service' },
    command: '/review',
    createdAt: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
  },
  {
    id: 'witem-003',
    priority: 2,
    source: { type: 'github_issue', issueNumber: 138, repository: 'acme-corp/data-pipeline' },
    command: '/bug-fix 138',
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
]

export const DEMO_CONSUMER_HEALTH = {
  status: 'healthy',
  metrics: {
    isRunning: true,
    hasLease: true,
    paused: false,
    lastHeartbeatAt: new Date(Date.now() - 30 * 1000).toISOString(),
    lastDispatchAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    dispatched: 16,
    dispatchFailures: 1,
    retries: 2,
    capacitySkips: 0,
  },
}

// ---------------------------------------------------------------------------
// Demo Supervisor/Worker metrics (Sessions > Observability tab)
// ---------------------------------------------------------------------------

export const DEMO_SUPERVISOR_METRICS = {
  supervisor: {
    isRunning: true,
    isPaused: false,
    activeSessions: 2,
    uptimeMs: 8 * 60 * 60 * 1000, // 8 hours
    lastDecisionAt: new Date(Date.now() - 45 * 1000).toISOString(),
  },
  workers: {
    totalActive: 2,
    totalCapacity: 5,
    occupancyPct: 40,
    byProvider: [
      { provider: 'claude', active: 2, max: 3, occupancyPct: 67, avgLatencyMs: 1240, failureRate: 0.04 },
      { provider: 'gemini', active: 0, max: 2, occupancyPct: 0, avgLatencyMs: 980, failureRate: 0.02 },
    ],
  },
  queue: {
    depth: 3,
    pressurePct: 60,
    oldestItemAge: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  dispatch: {
    totalDispatched: 16,
    totalRetries: 2,
    totalFailures: 1,
    avgDispatchLatencyMs: 1120,
    lastDispatchAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  recentEvents: [
    { id: 'ev-1', type: 'session_started', message: 'Session started: acme-corp/web-app #142', timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString() },
    { id: 'ev-2', type: 'session_started', message: 'Session started: acme-corp/api-service PR#87', timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString() },
    { id: 'ev-3', type: 'session_completed', message: 'Session completed successfully: acme-corp/data-pipeline #130', timestamp: new Date(Date.now() - 22 * 60 * 1000).toISOString() },
    { id: 'ev-4', type: 'session_completed', message: 'Session completed successfully: acme-corp/web-app #138', timestamp: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
    { id: 'ev-5', type: 'dispatch_retry', message: 'Dispatch retry (1/3): acme-corp/cli #97', timestamp: new Date(Date.now() - 90 * 60 * 1000).toISOString() },
  ],
  fetchedAt: new Date().toISOString(),
}

// ---------------------------------------------------------------------------
// Enforcement: Domain access stats + exceptions
// ---------------------------------------------------------------------------

export const DEMO_DOMAIN_ACCESS_STATS: DomainStatsResponse = {
  stats: [
    { domain: 'github.com', totalRequests: 142, blockedRequests: 0, lastAccessed: new Date(Date.now() - 5 * 60 * 1000).toISOString() },
    { domain: 'api.anthropic.com', totalRequests: 89, blockedRequests: 0, lastAccessed: new Date(Date.now() - 12 * 60 * 1000).toISOString() },
    { domain: 'registry.npmjs.org', totalRequests: 34, blockedRequests: 0, lastAccessed: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
    { domain: 'pastebin.com', totalRequests: 3, blockedRequests: 3, lastAccessed: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() },
    { domain: 'docs.python.org', totalRequests: 18, blockedRequests: 0, lastAccessed: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
  ],
  period: { days: 7 },
  repo: null,
}

export const DEMO_DOMAIN_EXCEPTION_ITEMS: DomainExceptionItem[] = [
  {
    id: 'exc-1',
    domain: 'internal-metrics.acme-corp.com',
    orgName: 'acme-corp',
    repoName: 'web-app',
    approvedBy: 'sarah-chen',
    approvedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    justification: 'Internal observability endpoint — required for health checks',
    expiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
    expired: false,
  },
  {
    id: 'exc-2',
    domain: 'legacy-api.acme-corp.com',
    orgName: 'acme-corp',
    approvedBy: 'alex-kim',
    approvedAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
    justification: 'Legacy service migration — deprecation planned Q2',
    expiresAt: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString(),
    expired: false,
  },
]

// ---------------------------------------------------------------------------
// Enforcement: Hooks
// ---------------------------------------------------------------------------

export const DEMO_ENFORCEMENT_HOOKS: EnforcementHookItem[] = [
  {
    id: 'hook-1',
    name: 'Validate approved config signature',
    type: 'pre-commit',
    policy: 'Ensure CLAUDE.md matches org-approved config SHA',
    enabled: true,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'hook-2',
    name: 'Block unapproved tool access',
    type: 'ci-check',
    policy: 'Deny commits if session used tools outside allowlist',
    enabled: true,
    createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'hook-3',
    name: 'Require SDLC phase comment',
    type: 'pre-push',
    policy: 'Commit message must reference SDLC phase tag',
    enabled: false,
    createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

// ---------------------------------------------------------------------------
// Enforcement: SDLC states, gates, compliance
// ---------------------------------------------------------------------------

export const DEMO_SDLC_STATES: SdlcStateItem[] = [
  {
    issueId: 'acme-corp/web-app#142',
    orgName: 'acme-corp',
    currentPhase: '4-implement',
    transitions: [
      { id: 'tr-1', from: null, to: '1-specify', timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), actor: 'sarah-chen' },
      { id: 'tr-2', from: '1-specify', to: '2-design', timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), actor: 'sarah-chen' },
      { id: 'tr-3', from: '2-design', to: '3-test', timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), actor: 'alex-kim' },
      { id: 'tr-4', from: '3-test', to: '4-implement', timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), actor: 'maya-patel' },
    ],
    createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    issueId: 'acme-corp/api-service#87',
    orgName: 'acme-corp',
    currentPhase: '6-review',
    transitions: [
      { id: 'tr-5', from: null, to: '1-specify', timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(), actor: 'james-okonkwo' },
      { id: 'tr-6', from: '5-deploy', to: '6-review', timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), actor: 'priya-sharma' },
    ],
    createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
]

export const DEMO_SDLC_GATES: SdlcGateConfig = {
  gates: [
    { from: '1-specify', to: '2-design', conditions: [{ type: 'file_exists', description: 'spec.md must be present' }, { type: 'review_approved', description: 'Spec approved by CISO or tech lead' }] },
    { from: '3-test', to: '4-implement', conditions: [{ type: 'tests_failing', description: 'Tests must be in RED state (TDD)' }] },
    { from: '4-implement', to: '5-deploy', conditions: [{ type: 'tests_passing', description: 'All tests must pass' }, { type: 'no_lint_errors', description: 'No lint or type errors' }] },
    { from: '5-deploy', to: '6-review', conditions: [{ type: 'preview_deployed', description: 'Preview URL must be accessible' }] },
    { from: '6-review', to: '7-merge', conditions: [{ type: 'ci_passing', description: 'All CI checks green' }, { type: 'pr_approved', description: 'At least 1 approver' }] },
  ],
  updatedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
  updatedBy: 'sarah-chen',
}

export const DEMO_SDLC_ENFORCEMENT = {
  orgName: 'acme-corp',
  config: {
    enabled: true,
    level: 'block' as const,
    updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedBy: 'sarah-chen',
    reason: 'Native SDLC gate is enabled for all background agent sessions.',
  },
}

export const DEMO_SDLC_COMPLIANCE: SdlcComplianceStatusResponse = {
  orgName: 'acme-corp',
  totalProjects: 4,
  compliantProjects: 3,
  driftedProjects: 1,
  projects: [
    { projectId: 'acme-corp/web-app#142', currentPhase: 4, lastTransition: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), skippedPhases: [], isCompliant: true },
    { projectId: 'acme-corp/api-service#87', currentPhase: 6, lastTransition: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), skippedPhases: [], isCompliant: true },
    { projectId: 'acme-corp/data-pipeline#130', currentPhase: 7, lastTransition: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), skippedPhases: [], isCompliant: true },
    { projectId: 'acme-corp/cli#97', currentPhase: 3, lastTransition: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), skippedPhases: [2], isCompliant: false },
  ],
}

// ---------------------------------------------------------------------------
// Enforcement: Security standards
// ---------------------------------------------------------------------------

export const DEMO_SECURITY_STANDARDS: SecurityStandardItem[] = [
  {
    id: 'std-1',
    name: 'No secrets in prompts',
    description: 'Prevent API keys, tokens, and credentials from appearing in agent prompts or outputs',
    rules: [
      { type: 'pattern_block', target: 'prompt', description: 'Block prompts matching secret patterns', value: '(sk-|ghp_|Bearer |password=)' },
      { type: 'pattern_block', target: 'output', description: 'Redact secrets from agent output', value: '(sk-[a-zA-Z0-9]{32,})' },
    ],
    severity: 'critical',
    orgName: 'acme-corp',
    createdBy: 'sarah-chen',
    createdAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'std-2',
    name: 'Approved tools only',
    description: 'Agents may only use tools from the org-approved tool allowlist',
    rules: [
      { type: 'tool_allowlist', target: 'tools', description: 'Allowed: Read, Write, Edit, Bash, Grep, Glob' },
      { type: 'tool_denylist', target: 'tools', description: 'Blocked: computer, browser automation without approval' },
    ],
    severity: 'high',
    orgName: 'acme-corp',
    createdBy: 'alex-kim',
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'std-3',
    name: 'Data residency — EU repos',
    description: 'Agent sessions on EU repos must not transfer data outside EEA',
    rules: [
      { type: 'network_restriction', target: 'outbound', description: 'Block non-EU API endpoints for EU-tagged repos' },
    ],
    severity: 'medium',
    orgName: 'acme-corp',
    createdBy: 'sarah-chen',
    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
  },
]

// ---------------------------------------------------------------------------
// Enforcement: Tool policies
// ---------------------------------------------------------------------------

export const DEMO_TOOL_POLICIES: ToolPolicyItem[] = [
  {
    id: 'tp-1',
    orgName: 'acme-corp',
    name: 'Standard developer policy',
    description: 'Default tool access for all developers — read/write to owned repos, no system modification',
    rules: [
      { tool: 'Read', action: 'allow' },
      { tool: 'Write', action: 'allow', conditions: { pathPattern: 'apps/**' } },
      { tool: 'Edit', action: 'allow', conditions: { pathPattern: 'apps/**' } },
      { tool: 'Bash', action: 'audit', conditions: { commandPattern: 'rm|sudo|chmod' } },
      { tool: 'Bash', action: 'deny', conditions: { commandPattern: 'curl.*pastebin|wget.*external' } },
    ],
    createdBy: 'sarah-chen',
    createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    enabled: true,
  },
  {
    id: 'tp-2',
    orgName: 'acme-corp',
    name: 'Restricted — data-pipeline repo',
    description: 'Tighter restrictions for the data pipeline — no external network, read-only prod configs',
    rules: [
      { tool: 'Read', action: 'allow' },
      { tool: 'Write', action: 'allow', conditions: { pathPattern: 'src/**' } },
      { tool: 'Bash', action: 'deny', conditions: { commandPattern: 'curl|wget|fetch' } },
    ],
    createdBy: 'alex-kim',
    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    enabled: true,
  },
]
