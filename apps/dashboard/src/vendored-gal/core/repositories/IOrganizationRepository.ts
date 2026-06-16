import type { Organization, HookSettings } from '../domain/organization'
import type { ConfigStats } from '../domain/organization'
import type { TeamMember } from '../domain/team-member'
import type { GalRole, MultiPlatformScanResult, TeamMemberCache, RoleOverride } from '@gal/types'

/**
 * Organization policy for enterprise-tier policy distribution (#2515)
 * Firestore path: organizations/{orgName}/policies/{policyId}
 */
export interface OrgPolicy {
  id: string
  orgName: string
  name: string
  type: 'tool-allowlist' | 'domain-allowlist' | 'model-restriction' | 'custom'
  policy: Record<string, unknown>
  status: 'draft' | 'active' | 'archived'
  version: number
  createdBy: string
  createdAt: Date
  updatedAt: Date
  distributedAt?: Date
}

/**
 * Storage URLs for organization config files
 */
export interface OrganizationStorageUrls {
  settings: string
  commands: string
  hooks: string
}

/**
 * A file that has drifted from the approved configuration.
 */
export interface DriftedFile {
  path: string
  type: string
  changeType: 'modified' | 'missing' | 'extra'
}

/**
 * Drift report submitted by the CLI for a project.
 */
export interface DriftReport {
  projectId: string
  status: 'in-sync' | 'drifted' | 'unknown'
  driftedFiles: DriftedFile[]
  lastChecked: string
}

// ─────────────────────────────────────────────────────────────────
// Audit Log Types (Enterprise Tier)
// ─────────────────────────────────────────────────────────────────

export type AuditSessionType = 'background-agent' | 'cli' | 'vscode' | 'dashboard'
export type AuditAction = 'tool_call' | 'file_edit' | 'bash_command' | 'config_change' | 'policy_violation'
export type AuditSeverity = 'info' | 'warning' | 'critical'

export interface AuditLogEntry {
  id: string
  orgName: string
  userId: string
  userName: string
  sessionType: AuditSessionType
  action: AuditAction
  details: Record<string, unknown>
  severity: AuditSeverity
  timestamp: Date
  projectId?: string | null
  sessionId?: string | null
}

export interface AuditLogQuery {
  startDate?: Date
  endDate?: Date
  userId?: string
  sessionType?: string
  action?: string
  severity?: string
  limit?: number
  offset?: number
}

export interface AuditSummary {
  totalEntries: number
  byAction: Record<string, number>
  byUser: Record<string, number>
  bySessionType: Record<string, number>
  bySeverity: Record<string, number>
  period: { start: Date; end: Date }
}

/**
 * Enforcement hook definition for CI policy checks.
 * Firestore path: organizations/{orgName}/enforcement-hooks/{hookId}
 * Part of the Enforcement tier ($25/dev/month) - Issue #181.
 */
export interface EnforcementHook {
  id: string
  name: string
  type: 'pre-commit' | 'pre-push' | 'ci-check'
  policy: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Organization repository interface
 * Implementations: FirestoreOrganizationRepository (API), HttpOrganizationRepository (CLI/Dashboard)
 */
export interface IOrganizationRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Find organization by name
   */
  findByName(name: string): Promise<Organization | null>

  /**
   * Find all organizations
   */
  findAll(): Promise<Organization[]>

  /**
   * Find organization by GitHub installation ID
   */
  findByInstallationId(installationId: number): Promise<Organization | null>

  /**
   * Find organizations accessible by a user
   */
  findByUser(userId: string): Promise<Organization[]>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a new organization
   */
  create(organization: Organization): Promise<void>

  /**
   * Update an existing organization
   */
  update(organization: Organization): Promise<void>

  /**
   * Delete an organization
   */
  delete(name: string): Promise<void>

  /**
   * Create or update organization document
   * Used when syncing from GitHub App installation
   */
  upsert(
    orgName: string,
    installationId: number,
    storageUrls: OrganizationStorageUrls,
    accountType?: 'User' | 'Organization',
    totalRepos?: number,
    options?: {
      touchLastScan?: boolean
    }
  ): Promise<void>

  /**
   * Update organization stats after a scan
   */
  updateStats(name: string, stats: ConfigStats): Promise<void>

  /**
   * Update organization statistics from multi-platform scan results
   * Aggregates stats across all platforms (claude, cursor, copilot, etc.)
   */
  updateMultiPlatformStats(
    orgName: string,
    scanResults: MultiPlatformScanResult[],
    storageUrlBase: string,
    totalReposScanned?: number
  ): Promise<void>

  // ─────────────────────────────────────────────────────────────────
  // Team Management
  // ─────────────────────────────────────────────────────────────────

  /**
   * Add a team member to an organization
   */
  addTeamMember(orgName: string, member: TeamMember): Promise<void>

  /**
   * Remove a team member from an organization
   */
  removeTeamMember(orgName: string, userId: string): Promise<void>

  /**
   * Update a team member's role
   */
  updateTeamMemberRole(
    orgName: string,
    userId: string,
    newRole: GalRole
  ): Promise<void>

  /**
   * Get all team members for an organization
   */
  getTeamMembers(orgName: string): Promise<TeamMember[]>

  /**
   * Get a specific team member
   */
  getTeamMember(orgName: string, userId: string): Promise<TeamMember | null>

  /**
   * Check if a user is a member of an organization
   */
  isMember(orgName: string, userId: string): Promise<boolean>

  // ─────────────────────────────────────────────────────────────────
  // Team Cache (Live GitHub Sync)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get cached team member list
   * Firestore path: organizations/{orgName}/team-cache/members
   */
  getTeamMemberCache(orgName: string): Promise<TeamMemberCache | null>

  /**
   * Set (create or update) team member cache
   */
  setTeamMemberCache(orgName: string, cache: TeamMemberCache): Promise<void>

  /**
   * Get all role overrides for an organization
   * Firestore path: organizations/{orgName}/role-overrides/{githubId}
   */
  getRoleOverrides(orgName: string): Promise<RoleOverride[]>

  /**
   * Set (create or update) a role override for a member
   */
  setRoleOverride(orgName: string, override: RoleOverride): Promise<void>

  /**
   * Delete a role override for a member
   */
  deleteRoleOverride(orgName: string, githubId: number): Promise<void>

  /**
   * Delete role overrides for multiple members (batch)
   * Used for cleaning up overrides for departed members
   */
  deleteRoleOverridesForMembers(orgName: string, githubIds: number[]): Promise<void>

  // ─────────────────────────────────────────────────────────────────
  // Seat Counting (Unified)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get the canonical seat count for an organization.
   * Counts documents in the "developers" subcollection — the single
   * source of truth used by both the Team page and Billing.
   *
   * @returns number of seats (at least 1)
   */
  getSeatCount(orgName: string): Promise<number>

  // ─────────────────────────────────────────────────────────────────
  // Hook Settings
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get hook settings for an organization
   */
  getHookSettings(orgName: string): Promise<HookSettings | null>

  /**
   * Update hook settings for an organization
   */
  updateHookSettings(
    orgName: string,
    settings: HookSettings,
    updatedBy: string
  ): Promise<void>

  // ─────────────────────────────────────────────────────────────────
  // Drift Reports
  // ─────────────────────────────────────────────────────────────────

  saveDriftReport(orgName: string, projectId: string, report: DriftReport): Promise<void>
  getDriftReport(orgName: string, projectId: string): Promise<DriftReport | null>
  listDriftReports(orgName: string): Promise<DriftReport[]>

  // ─────────────────────────────────────────────────────────────────
  // Audit Logs (Enterprise)
  // ─────────────────────────────────────────────────────────────────

  createAuditLogEntry(orgName: string, entry: AuditLogEntry): Promise<void>
  queryAuditLogs(orgName: string, query: AuditLogQuery): Promise<{ entries: AuditLogEntry[]; total: number }>
  getAuditLogEntry(orgName: string, logId: string): Promise<AuditLogEntry | null>
  getAuditSummary(orgName: string, query: Pick<AuditLogQuery, 'startDate' | 'endDate'>): Promise<AuditSummary>

  // ─────────────────────────────────────────────────────────────────
  // Partial Updates
  // ─────────────────────────────────────────────────────────────────

  /**
   * Update specific fields on an organization document
   * Used for partial updates (e.g., configRepoEnabled, configRepoUrl)
   */
  updateFields(
    orgName: string,
    fields: Record<string, unknown>
  ): Promise<void>
}
