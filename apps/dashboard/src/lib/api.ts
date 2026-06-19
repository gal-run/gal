import { auth as firebaseAuth } from './firebase'
import { shouldUseBrowserBearerFallback } from './auth-hosts'
import type {
  LearningCategory,
  LearningListResponse,
  LearningStatus,
} from '@gal/types'
import type { EnforcementSettings } from '@gal/types'
import type {
  GalSwarmProvider,
  GalSwarmRunCreateResponse,
  GalSwarmRunMode,
  GalSwarmRunPlan,
  GalSwarmRunRequest,
  GalSwarmRunStatusResponse,
} from '@gal-run/swarm'

const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const FAST_STATUS_TIMEOUT_MS = 10_000

export function isCrossOriginFallback(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return shouldUseBrowserBearerFallback(
      window.location.origin,
      new URL(API_BASE_URL).origin,
    )
  } catch {
    return false
  }
}

const AI_BASE_URL = process.env['NEXT_PUBLIC_AI_URL'] || 'http://localhost:3000'

// Re-export auth types for convenience
export type { User, AuthStatus } from './auth-types'
import type { User, AuthStatus } from './auth-types'

import type { PlatformId } from '@gal/types'
// Supported AI coding agent platforms — use PlatformId to stay in sync with platform-registry.ts
export type AgentPlatform = PlatformId

export type {
  GalSwarmProvider,
  GalSwarmRunMode,
  GalSwarmRunPlan,
  GalSwarmRunRequest,
}
export type GalSwarmRunApiResponse = GalSwarmRunCreateResponse
export type GalSwarmRunStatus = GalSwarmRunStatusResponse
export type GalSwarmLaunchProfileSource = 'compute-profile' | 'runner-label' | 'serverless-fallback'
export type GalSwarmLaunchProfileTier = 'smoke' | 'burst' | 'fallback' | 'breakglass'
export type GalSwarmCapacityState = 'ready' | 'low_capacity' | 'blocked' | 'premium_only'
export type GalSwarmStorageClass = 'ephemeral-container-disk' | 'persistent-workspace' | 'shared-network-volume'
export type GalSwarmNetworkingMode = 'isolated' | 'private-swarm' | 'public-ingress'
export type GalSwarmIsolationMode = 'kata' | 'runc'
export type GalSwarmSupportLevel = 'supported' | 'planned' | 'not_supported' | 'breakglass_only'
export type GalSwarmDoctorStatus = 'pass' | 'warn' | 'fail' | 'unknown'
export type GalSwarmDoctorCategory =
  | 'auth'
  | 'control-plane'
  | 'network'
  | 'runtime'
  | 'rbac'
  | 'reservation'
  | 'capacity'
  | 'storage'
  | 'transport'
export type GalSwarmCapabilityPoolLimitDimension =
  | 'pods'
  | 'cpu'
  | 'memory'
  | 'ephemeralStorage'
export type GalSwarmCapabilityPoolAvailabilityState =
  | 'ready'
  | 'low_capacity'
  | 'blocked'

export interface GalSwarmLifecycleSemantics {
  stopPreservesWorkspace: boolean
  restartRequiresFreshReservation: boolean
  updateClearsEphemeralState: boolean
  terminateDeletesEphemeralState: boolean
  notes: string[]
}

export interface GalSwarmLaunchProfileResources {
  cpuCores?: number
  memoryGb?: number
  diskGb?: number
  gpuType?: string
  gpuCount?: number
}

export interface GalSwarmCostHints {
  currency: 'USD'
  maxHourlyUsd?: number
  maxRunSpendUsd?: number
  inputTokensUsdPer1M?: number
  outputTokensUsdPer1M?: number
  agentUsdPerTask?: number
  notes: string[]
}

export interface GalSwarmLaunchProfile {
  id: string
  label: string
  source: GalSwarmLaunchProfileSource
  tier: GalSwarmLaunchProfileTier
  supportLevel: GalSwarmSupportLevel
  capacityState: GalSwarmCapacityState
  approvalRequired: boolean
  maxSupportedWorkers: number
  maxValidatedWorkers: number
  sandboxProvider?: string
  aiProviders: string[]
  computeProfileId?: string
  runnerLabels: string[]
  capacityPolicyProfile?: string
  isolationMode: GalSwarmIsolationMode
  storageClass: GalSwarmStorageClass
  networkingMode: GalSwarmNetworkingMode
  lifecycle: GalSwarmLifecycleSemantics
  resources: GalSwarmLaunchProfileResources
  costHints: GalSwarmCostHints
  notes: string[]
}

export interface GalSwarmArchitectureCapability {
  canonicalMode: string
  supportLevel: GalSwarmSupportLevel
  family: string
  publicAliases: string[]
  batchReady: boolean
  supportsStreaming: boolean
  recommendedFor: string[]
  notes: string[]
}

export interface GalSwarmRateLimitSummary {
  tierName: string
  requestsPerMinute?: number
  requestsPerHour?: number
  requestsPerDay?: number
  maxBatchItems?: number
  tokensPerWorkerRequest?: number
  endpoint?: string
  notes: string[]
}

export interface GalSwarmPricingSummary {
  currency: 'USD'
  pricingEndpoint?: string
  inputTokensUsdPer1M?: number
  outputTokensUsdPer1M?: number
  agentUsdPerTask?: number
  notes: string[]
}

export interface GalSwarmTransportCapabilities {
  api: GalSwarmSupportLevel
  cli: GalSwarmSupportLevel
  mcp: GalSwarmSupportLevel
  dashboard: GalSwarmSupportLevel
  streaming: GalSwarmSupportLevel
  responseCompression: GalSwarmSupportLevel
  responseCompressionEncodings: string[]
  notes: string[]
}

export interface GalSwarmCapabilityCatalog {
  schemaVersion: string
  generatedAt: string
  maxSupportedWorkers: number
  maxValidatedWorkers: number
  launchProfiles: GalSwarmLaunchProfile[]
  architectures: GalSwarmArchitectureCapability[]
  rateLimits: GalSwarmRateLimitSummary
  pricing: GalSwarmPricingSummary
  transport: GalSwarmTransportCapabilities
}

export interface GalSwarmDoctorCheck {
  id: string
  title: string
  category: GalSwarmDoctorCategory
  required: boolean
  status: GalSwarmDoctorStatus
  evidence?: string
  remediation?: string
  maxSafeWorkers?: number
}

export interface GalSwarmDoctorReport {
  schemaVersion: string
  generatedAt: string
  targetWorkerCount: number
  overallStatus: Exclude<GalSwarmDoctorStatus, 'unknown'>
  readyForWorkerTest: boolean
  maxRecommendedWorkers: number
  blockers: string[]
  warnings: string[]
  checks: GalSwarmDoctorCheck[]
  notes: string[]
}

export interface GalSwarmCapacityQuota {
  pods?: number
  cpuMilli?: number
  memoryMi?: number
  ephemeralStorageMi?: number
}

export interface GalSwarmCapabilityLivePool {
  id: string
  label: string
  runnerLabel: string
  supportLevel: GalSwarmSupportLevel
  isolationMode: GalSwarmIsolationMode
  approvalRequired: boolean
  availabilityState: GalSwarmCapabilityPoolAvailabilityState
  maxSupportedWorkers: number
  maxValidatedWorkers: number
  maxAdmissible: number
  maxRecommendedWorkers: number
  limitingResources: GalSwarmCapabilityPoolLimitDimension[]
  effectiveMaxWorkersByResource?: Partial<Record<GalSwarmCapabilityPoolLimitDimension, number>>
  reasons: string[]
  runtimeClass?: string
  resourceProfile?: string
  resources?: Record<string, unknown>
  totals?: GalSwarmCapacityQuota
  quotaAvailable?: GalSwarmCapacityQuota
  error?: string
}

export interface GalSwarmCapabilityLiveSnapshot {
  generatedAt: string
  validatedWorkerCeiling: number
  pools: GalSwarmCapabilityLivePool[]
}

export interface GalSwarmCapabilityCatalogResponse {
  orgName: string
  catalog: GalSwarmCapabilityCatalog
  live?: GalSwarmCapabilityLiveSnapshot
}

export interface GalSwarmDoctorResponse extends GalSwarmDoctorReport {
  orgName: string
  runnerLabel?: string
}

export interface PlatformStats {
  storageUrl: string
  settingsCount: number
  commandsCount: number
  hooksCount: number
  subagentsCount: number
  totalConfigs: number
}

// Organization data from GAL API (matches actual API response)
export interface Organization {
  name: string
  installationId: number
  accountType?: 'User' | 'Organization' | 'Enterprise' // GitHub account type (personal, org, or enterprise)
  enterpriseSlug?: string // Enterprise account this org belongs to (e.g. "example-enterprise")
  canDelete?: boolean
  installedByGithubId?: number
  installedByLogin?: string
  settings: {
    storageUrl: string
    versions: number
  }
  commands: {
    storageUrl: string
    count: number
  }
  hooks: {
    storageUrl: string
    count: number
  }
  totalRepos: number
  totalCommands: number
  totalHooks: number
  totalConfigs: number
  platforms?: Record<AgentPlatform, PlatformStats>
  lastScanAt: { _seconds: number; _nanoseconds: number } | null
  createdAt: { _seconds: number; _nanoseconds: number }
  updatedAt: { _seconds: number; _nanoseconds: number }
}

// Repository data derived from organization scans
export interface Repository {
  id: string
  name: string
  owner: string
  fullName: string
  hasAgentConfigs: boolean
  configCount: number
}

export interface AgentConfig {
  id: string
  repository: string
  path: string
  type: 'claude'
  content: string
  lastUpdated: Date
}

export interface SecurityIssue {
  severity: 'low' | 'medium' | 'high' | 'critical'
  title: string
  description: string
  location?: string
}

export interface AnalysisResult {
  configId: string
  securityIssues: SecurityIssue[]
  recommendations: string[]
  score: number
}

export interface AnalysisResponse {
  analysis: string
  model: string
}

// GitHub App installation types
export interface GitHubInstallation {
  organization: string
  installed: boolean
  installationId: number | null
  installedAt: string | null
  permissions: Record<string, string> | null
  repositorySelection: 'all' | 'selected' | null
}

export interface GitHubInstallationStatus {
  installed: boolean
  organizations: string[]
  installations: GitHubInstallation[]
  hasInstallations: boolean
  totalInstalled?: number
  totalOrgs?: number
}

export interface GitHubSyncResult {
  success: boolean
  organization?: string
  installationId?: number
  installedAt?: string
  scannedRepos?: number
  totalConfigs?: number
  byPlatform?: Record<AgentPlatform, number>
  error?: string
  installUrl?: string
}

export interface PersonalGitHubStatus {
  connected: boolean
  username: string | undefined
}

export interface GitHubRateLimitScope {
  scope: string
  limit: number
  remaining: number
  reset: number
  used?: number
  resource?: string
  retryAfter?: number
  updatedAt: string
  lastLabel: string
}

// Workspace types (GAL-569: Unified Auth)
export type WorkspaceType = 'organization' | 'personal'
export type WorkspaceRole = 'admin' | 'member'

export interface WorkspaceWithRole {
  id: string
  type: WorkspaceType
  name: string
  slug: string
  avatarUrl?: string
  role: WorkspaceRole
  isOwner: boolean
  canApprove: boolean
  canManageSettings: boolean
}

export interface WorkspacePermission {
  workspaceId: string
  userId: string
  role: WorkspaceRole
  canApprove: boolean
  canManageSettings: boolean
  isOwner: boolean
}

export interface DeveloperPlatformSyncStatus {
  syncStatus: 'synced' | 'outdated' | 'never_synced'
  lastSyncAt?: string | null
  syncedConfigVersion?: string | null
}

export interface DeveloperStatusSummary {
  organization: string
  totalDevelopers: number
  cliInstalled: number
  authenticated: number
  authExpired: number
  syncedToLatest: number
  outOfSync: number
  neverSynced: number
  developers: Array<{
    githubLogin: string
    cliInstalled: boolean
    authenticated: boolean
    lastSyncAt?: string | null
    syncStatus: 'synced' | 'outdated' | 'never_synced'
    syncedPlatforms?: AgentPlatform[]
    platformSync?: Partial<Record<AgentPlatform, DeveloperPlatformSyncStatus>>
  }>
}

// Slash command type for AI Session
export interface SlashCommand {
  id: string
  name: string
  description: string
  category: string
  enabled: boolean
}

// Supervisor/Worker metrics (Issue #2140)
export interface SupervisorMetricsResponse {
  supervisor: {
    isRunning: boolean
    isPaused: boolean
    activeSessions: number
    uptimeMs: number
    lastDecisionAt: string | null
  }
  workers: {
    totalActive: number
    totalCapacity: number
    occupancyPct: number
    byProvider: Array<{
      provider: string
      active: number
      max: number
      occupancyPct: number
      avgLatencyMs: number
      failureRate: number
    }>
  }
  queue: {
    depth: number
    pressurePct: number
    oldestItemAge: string | null
  }
  dispatch: {
    totalDispatched: number
    totalRetries: number
    totalFailures: number
    avgDispatchLatencyMs: number
    lastDispatchAt: string | null
  }
  recentEvents: Array<{
    id: string
    type: string
    message: string
    timestamp: string
    metadata?: Record<string, unknown>
  }>
  fetchedAt: string
}

export type AgentNetworkTaskState =
  | 'submitted'
  | 'accepted'
  | 'working'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'canceled'

export interface AgentNetworkActorRef {
  type?: string
  id?: string
  displayName?: string
  serviceId?: string
  agentId?: string
  githubActor?: string
}

export interface AgentNetworkTaskEvent {
  id: string
  orgName: string
  taskId: string
  parentTaskId?: string
  correlationId: string
  requestId?: string
  traceparent?: string
  sequence: number
  state: AgentNetworkTaskState
  reason: string
  at: string
  agentId: string
  taskType: string
  runtime?: {
    kind?: string
    status?: string
    bridge?: string
  }
  caller?: AgentNetworkActorRef
  callee?: AgentNetworkActorRef
  authorization?: {
    methods?: string[]
    scopes?: string[]
    policyDecisionId?: string
    approvedConfigId?: string
  }
  error?: {
    code: string
    retryable: boolean
  }
  artifacts?: {
    count: number
    names: string[]
  }
  delegatedTaskId?: string
  delegatedAgentId?: string
}

export interface AgentNetworkEventSummary {
  count: number
  states: Record<string, number>
  agents: Record<string, number>
  taskTypes: Record<string, number>
  failures: number
  latestAt?: string
}

export interface AgentNetworkEventsResponse {
  orgName: string
  taskId?: string
  count: number
  summary: AgentNetworkEventSummary
  events: AgentNetworkTaskEvent[]
}

export type ManagedAgentGateStatus = 'not_run' | 'passed' | 'failed'
export type ManagedAgentVersionStatus = 'draft' | 'evaluating' | 'ready' | 'blocked' | 'promoted'
export type ManagedAgentEvalRunStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface ManagedAgentDefinition {
  id: string
  orgName: string
  displayName: string
  description?: string
  taskType: string
  agentCardRef: string
  requiredEvalSuites: string[]
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface ManagedAgentVersion {
  agentId: string
  version: string
  orgName: string
  runtimeRef: string
  executionTargetRef?: string
  runnerRefs: string[]
  connectorRefs: Array<Record<string, unknown>>
  vaultRefIds: string[]
  evalSuites: string[]
  policyRef?: string
  status: ManagedAgentVersionStatus
  latestGateStatus: ManagedAgentGateStatus
  createdBy?: string
  createdAt: string
  updatedAt: string
  promotedAt?: string
}

export interface GalEvalReportSnapshot {
  schemaVersion: 'gal.evals.report.v1'
  suiteId: string
  passed: boolean
  score?: number
  subject?: Record<string, unknown>
  metrics?: Array<Record<string, unknown>>
  cases?: Array<Record<string, unknown>>
  suggestions?: string[]
  [key: string]: unknown
}

export interface ManagedAgentEvalRun {
  runId: string
  orgName: string
  agentId: string
  version: string
  suiteId: string
  status: ManagedAgentEvalRunStatus
  gateStatus: ManagedAgentGateStatus
  reportSnapshot?: GalEvalReportSnapshot
  createdBy?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
}

export interface ManagedAgentEvalWorkPacket {
  schemaVersion: 'gal.managed_agents.eval_work_packet.v1'
  agent: ManagedAgentDefinition
  version: ManagedAgentVersion
  evalRun: ManagedAgentEvalRun
  submission: {
    method: 'POST'
    path: string
    reportSchemaVersion: 'gal.evals.report.v1'
  }
}

export interface CreateManagedAgentRequest {
  id?: string
  displayName: string
  description?: string
  taskType: string
  agentCardRef: string
  requiredEvalSuites?: string[]
}

export interface CreateManagedAgentVersionRequest {
  version?: string
  runtimeRef: string
  executionTargetRef?: string
  runnerRefs?: string[]
  connectorRefs?: Array<Record<string, unknown>>
  vaultRefIds?: string[]
  evalSuites?: string[]
  policyRef?: string
}

export interface CreateManagedAgentEvalRunRequest {
  suiteId: string
  reportSnapshot?: GalEvalReportSnapshot
}

export interface SubmitManagedAgentEvalReportRequest {
  reportSnapshot: GalEvalReportSnapshot
}

class APIClient {
  private apiBaseUrl: string
  private aiBaseUrl: string

  constructor() {
    this.apiBaseUrl = API_BASE_URL
    this.aiBaseUrl = AI_BASE_URL
  }

  // Public getter for base URL (used for OAuth redirects)
  get baseUrl(): string {
    return this.apiBaseUrl
  }

  // Auth methods - now using httpOnly cookies (set by server)
  // These methods are kept for backward compatibility but localStorage is no longer used
  setAuthToken(_token: string | null) {
    // No-op: tokens are now managed via httpOnly cookies
    // This method is kept for backward compatibility during migration
  }

  getAuthToken(): string | null {
    // Tokens are now in httpOnly cookies, not accessible via JavaScript
    // Return null - auth is handled automatically via cookies
    return null
  }

  private getAuthHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    }

    // Fallback: If localStorage has a token, send it as Bearer.
    // This is only allowed on explicit local/preview hosts where cookies can
    // be unreliable.
    if (isCrossOriginFallback()) {
      let localToken: string | null = null
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          localToken = localStorage.getItem('gal_auth_token')
        }
      } catch {
        // Ignore localStorage errors
      }

      if (localToken) {
        headers['Authorization'] = `Bearer ${localToken}`
      }
    }

    return headers
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    const controller = !options.signal && timeoutMs > 0 ? new AbortController() : undefined
    const timeoutId = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined

    try {
      return await fetch(url, {
        ...options,
        signal: controller?.signal ?? options.signal,
      })
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timeout: ${url} did not respond within ${timeoutMs / 1000} seconds`)
      }
      throw error
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }

  // All fetch calls include credentials for cookie-based auth.
  // A Bearer-token fallback is only enabled on explicit local/preview hosts.
  async fetchWithAuth(
    url: string,
    options: RequestInit & { timeoutMs?: number; _isRetry?: boolean } = {},
  ): Promise<Response> {
    const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...requestOptions } = options
    const headers = {
      ...this.getAuthHeaders(),
      ...requestOptions.headers,
    }

    const response = await this.fetchWithTimeout(url, {
      ...requestOptions,
      headers,
      credentials: 'include', // Send cookies with request
    }, timeoutMs)

    // 401 retry: refresh session token.
    // Skip auth endpoints — they return 401 legitimately (e.g. bad credentials).
    const isAuthEndpoint = url.includes('/auth/')
    if (isCrossOriginFallback() && response.status === 401 && !isAuthEndpoint && !requestOptions._isRetry) {
      // Strategy 1: Firebase/Google users — refresh via getIdToken + /auth/google/verify
      if (firebaseAuth?.currentUser) {
        try {
          const freshIdToken = await firebaseAuth.currentUser.getIdToken(true)
          const verifyResponse = await this.fetchWithTimeout(`${this.apiBaseUrl}/auth/google/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken: freshIdToken }),
            credentials: 'include',
          }, timeoutMs)

          if (verifyResponse.ok) {
            const data = await verifyResponse.json()
            if (data.sessionToken) {
              try {
                localStorage.setItem('gal_auth_token', data.sessionToken)
              } catch {
                // Ignore localStorage errors
              }
            }

            // Retry original request with fresh token
            return this.fetchWithAuth(url, { ...requestOptions, _isRetry: true })
          }
        } catch {
          // Strategy 1 failed — fall through to Strategy 2
        }
      }

      // Strategy 2: Universal fallback — refresh via POST /auth/session/refresh
      // Works for all auth providers (GitHub, Google, email) using the expired session token.
      try {
        const refreshResponse = await fetch(`${this.apiBaseUrl}/auth/session/refresh`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders(),
          },
          credentials: 'include',
        })

        if (refreshResponse.ok) {
          const data = await refreshResponse.json()
          if (data.sessionToken) {
            try {
              localStorage.setItem('gal_auth_token', data.sessionToken)
            } catch {
              // Ignore localStorage errors
            }
          }

          // Retry original request with fresh token
          return this.fetchWithAuth(url, { ...requestOptions, _isRetry: true })
        }
      } catch {
        // Both strategies failed — fall through and return original 401
      }
    }

    return response
  }

  // ========================================================================
  // Orphan Detection Operations (#4830)
  // ========================================================================

  /**
   * Get count of orphaned approved config items.
   * Used by the dashboard to show a warning banner.
   */
  async getOrphanedItemsCount(orgName: string): Promise<{ total: number; byPlatform: Record<string, number> }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/orphaned-items/count`
      )
      if (!response.ok) {
        return { total: 0, byPlatform: {} }
      }
      return response.json()
    } catch {
      return { total: 0, byPlatform: {} }
    }
  }

  /**
   * Get detailed list of all orphaned approved config items.
   */
  async getOrphanedItems(orgName: string): Promise<{
    items: Array<{
      platform: string
      field: string
      name: string
      content: string
      sourceRepo: string
      sourcePath: string
      sourceDeletedAt: string
    }>
    total: number
  }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/orphaned-items`
      )
      if (!response.ok) {
        return { items: [], total: 0 }
      }
      return response.json()
    } catch {
      return { items: [], total: 0 }
    }
  }

  /**
   * Resolve an orphaned config item.
   * @param action - "keep" to retain as standalone policy, "re-source" to point to new source
   */
  async resolveOrphanedItem(
    orgName: string,
    request: {
      platform: string
      field: string
      name: string
      action: 'keep' | 're-source'
      newSourceRepo?: string
      newSourcePath?: string
    }
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/orphaned-items/resolve`,
        {
          method: 'POST',
          body: JSON.stringify(request),
        }
      )
      if (!response.ok) {
        const err = await response.json()
        return { success: false, error: err.error || 'Failed to resolve orphaned item' }
      }
      return response.json()
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  // ========================================================================
  // Environment Management Operations (#5629)
  // ========================================================================

  async listEnvironments(): Promise<EnvironmentConfig[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/environments`)
      if (!response.ok) return []
      return response.json()
    } catch {
      return []
    }
  }

  async createEnvironment(payload: UpsertEnvironmentPayload): Promise<EnvironmentConfig | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/environments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  async updateEnvironment(id: string, payload: UpsertEnvironmentPayload): Promise<EnvironmentConfig | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/environments/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  async deleteEnvironment(id: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/environments/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      return response.ok
    } catch {
      return false
    }
  }

  // ========================================================================
  // Queue Management Operations (#5629)
  // ========================================================================

  async moveQueueWorkItem(orgName: string, id: string, position: number): Promise<void> {
    await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/queue/order/move?org=${encodeURIComponent(orgName)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: id, position }),
      }
    )
  }

  async getFailedWorkItems(orgName: string): Promise<Array<{
    id: string
    priority: number
    source: { type: string; url?: string; issueNumber?: number; prNumber?: number; repository?: string }
    command: string
    createdAt: string
    updatedAt?: string
    completedAt?: string
    status: 'failed' | 'blocked'
    result?: { message?: string; failureCategory?: string; workflowRunUrl?: string; failedStep?: string; details?: Record<string, unknown> }
    dispatchReadiness?: { failure?: { type?: string; message?: string }; providerCredentials?: { provider?: string; status?: string; userId?: string; error?: string | null } }
  }>> {
    try {
      const params = new URLSearchParams({ org: orgName, status: 'failed', limit: '25' })
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/work-items?${params}`)
      if (!response.ok) return []
      const data = await response.json()
      return data.workItems ?? data ?? []
    } catch {
      return []
    }
  }

  async getAutonomyOverview(orgName: string, limit?: number): Promise<import('@gal/types').AutonomyOverviewResponse> {
    const url = new URL(`${this.apiBaseUrl}/api/autonomy/${encodeURIComponent(orgName)}/autonomy-overview`)
    if (limit !== undefined) url.searchParams.set('limit', String(limit))
    const response = await this.fetchWithAuth(url.toString())
    if (!response.ok) throw new Error('Failed to fetch autonomy overview')
    return response.json()
  }

  async logAutonomyIntervention(orgName: string, payload: import('@gal/types').AutonomyInterventionCreateRequest): Promise<void> {
    await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/autonomy/${encodeURIComponent(orgName)}/autonomy-interventions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )
  }

  async getAuthStatus(): Promise<AuthStatus> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/auth/status`)
      if (!response.ok) {
        return { configured: false, user: null }
      }
      return response.json()
    } catch {
      return { configured: false, user: null }
    }
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/auth/me`)
      if (!response.ok) return null
      const data = await response.json()
      return data.user
    } catch {
      return null
    }
  }

  getLoginUrl(redirect?: string, forceSelect?: boolean): string {
    const url = new URL(`${this.apiBaseUrl}/auth/github`)
    if (redirect) {
      url.searchParams.set('redirect', redirect)
    }
    if (forceSelect) {
      url.searchParams.set('force_select', 'true')
    }
    return url.toString()
  }

  async logout(): Promise<void> {
    await this.fetchWithAuth(`${this.apiBaseUrl}/auth/logout`, {
      method: 'POST',
    })
  }

  // ==========================================================================
  // Email/Password Authentication (User Story 3)
  // ==========================================================================

  /**
   * Register a new user with email and password
   * @returns Success/error info, userId on success
   */
  async registerWithEmail(email: string, password: string): Promise<{
    success: boolean;
    message?: string;
    userId?: string;
    error?: string;
    errorCode?: string;
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/auth/email/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      return response.json()
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
        errorCode: 'network_error',
      }
    }
  }

  /**
   * Login with email and password
   * @returns Session user info on success
   */
  async loginWithEmail(email: string, password: string): Promise<{
    success: boolean;
    user?: User;
    error?: string;
    errorCode?: string;
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/auth/email/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()

      // Store session token in localStorage for cross-origin fallback
      if (isCrossOriginFallback() && data.sessionToken) {
        try {
          localStorage.setItem('gal_auth_token', data.sessionToken)
        } catch {
          // Ignore localStorage errors
        }
      }

      return data
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
        errorCode: 'network_error',
      }
    }
  }

  /**
   * Request password reset email
   * Note: Always returns success to prevent email enumeration
   */
  async requestPasswordReset(email: string): Promise<{
    success: boolean;
    message?: string;
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/auth/email/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      return response.json()
    } catch {
      // Always return success to prevent enumeration
      return { success: true, message: 'If an account exists, a password reset link has been sent.' }
    }
  }

  /**
   * Resend email verification link
   */
  async resendVerificationEmail(email: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
    errorCode?: string;
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/auth/email/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      return response.json()
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resend verification',
        errorCode: 'network_error',
      }
    }
  }

  // Workspace operations (GAL-569: Unified Auth)
  async getWorkspaces(): Promise<WorkspaceWithRole[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/workspaces`)
      if (!response.ok) throw new Error('Failed to fetch workspaces')
      const data = await response.json()
      return data.workspaces || []
    } catch {
      return []
    }
  }

  async getWorkspace(workspaceId: string): Promise<WorkspaceWithRole | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}`)
      if (!response.ok) return null
      const data = await response.json()
      return data.workspace || null
    } catch {
      return null
    }
  }

  async getWorkspaceByOrg(orgSlug: string): Promise<WorkspaceWithRole | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/workspaces/by-org/${encodeURIComponent(orgSlug)}`)
      if (!response.ok) return null
      const data = await response.json()
      return data.workspace || null
    } catch {
      return null
    }
  }

  async getWorkspaceRole(workspaceId: string): Promise<WorkspacePermission | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/workspaces/${encodeURIComponent(workspaceId)}/role`)
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  async createPersonalWorkspace(): Promise<WorkspaceWithRole | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/workspaces/personal`, {
        method: 'POST',
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.workspace || null
    } catch {
      return null
    }
  }

  // Health checks (no auth required)
  async checkAPIHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/health`)
      return response.ok
    } catch {
      return false
    }
  }

  async checkAIHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.aiBaseUrl}/health`)
      return response.ok
    } catch {
      return false
    }
  }

  // ==========================================================================
  // Feedback (Issue #1111: Proactive Feedback Collection)
  // ==========================================================================

  async submitFeedback(payload: {
    rating: 'positive' | 'negative'
    reason?: string
    comment?: string
    product: string
    productVersion?: string
    context?: {
      action?: string
      location?: string
      errorType?: string
      errorMessage?: string
      metadata?: Record<string, string>
    }
  }): Promise<{ success: boolean; id?: string; message?: string }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      return response.json()
    } catch {
      return { success: false, message: 'Network error' }
    }
  }

  // Organization operations (maps to GAL API)
  async getOrganizations(options?: { throwOnError?: boolean }): Promise<Organization[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations`)
      if (!response.ok) {
        // #6234: Surface the real server error message so callers can distinguish
        // "empty list" (200 + empty array) from "service failure" (503/500).
        let serverMessage: string | undefined
        try {
          const errBody = await response.json()
          serverMessage = errBody?.message || errBody?.error
        } catch { /* ignore parse errors */ }

        if (response.status === 429) {
          throw new Error('rate limit exceeded')
        }
        if (response.status >= 500) {
          throw new Error(
            serverMessage
              ? `Service unavailable: ${serverMessage}`
              : 'Service unavailable: unable to load workspaces'
          )
        }
        throw new Error(serverMessage || 'Failed to fetch organizations')
      }
      const data = await response.json()
      return data.organizations || []
    } catch (error) {
      if (options?.throwOnError) {
        throw error
      }
      return []
    }
  }

  async syncOrganizations(): Promise<{ success: boolean; synced: number; organizations: string[] }> {
    const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/sync`, {
      method: 'POST',
    })
    if (!response.ok) {
      throw new Error('Failed to sync organizations')
    }
    return response.json()
  }

  /**
   * Refresh the JWT session cookie by re-checking GitHub org memberships.
   * #2917: Called after sync so newly-installed workspaces appear without re-login.
   */
  async refreshSession(): Promise<{ success: boolean; organizations?: string[] }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/auth/refresh`, {
        method: 'POST',
      })
      if (!response.ok) return { success: false }
      return response.json()
    } catch {
      return { success: false }
    }
  }

  async quickSyncOrganizations(): Promise<{ success: boolean; synced: number; organizations: string[] }> {
    // #6234: Apply a client-side timeout so the dashboard never waits indefinitely
    // when the API endpoint is hung (e.g. GCP ADC missing causing Firestore to block).
    const QUICK_SYNC_CLIENT_TIMEOUT_MS = 15_000
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), QUICK_SYNC_CLIENT_TIMEOUT_MS)

    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/quick-sync`, {
        method: 'POST',
        signal: controller.signal,
      })
      if (!response.ok) {
        let serverMessage: string | undefined
        try {
          const errBody = await response.json()
          serverMessage = errBody?.message || errBody?.error
        } catch { /* ignore parse errors */ }
        throw new Error(serverMessage || 'Failed to quick-sync organizations')
      }
      return response.json()
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Quick sync timed out. The service may be temporarily unavailable.')
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  async getOrganization(orgName: string): Promise<Organization | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}`)
      if (!response.ok) return null
      const data = await response.json()
      return data.organization || null
    } catch {
      return null
    }
  }

  async getLearnings(
    orgName: string,
    filters: {
      repo?: string
      category?: LearningCategory
      status?: LearningStatus
      limit?: number
    } = {},
  ): Promise<LearningListResponse> {
    try {
      const url = new URL(`${this.apiBaseUrl}/api/orgs/${encodeURIComponent(orgName)}/learnings`)
      if (filters.repo) url.searchParams.set('repo', filters.repo)
      if (filters.category) url.searchParams.set('category', filters.category)
      if (filters.status) url.searchParams.set('status', filters.status)
      if (typeof filters.limit === 'number') {
        url.searchParams.set('limit', String(filters.limit))
      }

      const response = await this.fetchWithAuth(url.toString())
      if (!response.ok) {
        return { learnings: [], totalCount: 0 }
      }

      const data = (await response.json()) as Partial<LearningListResponse> & {
        learnings?: LearningListResponse['learnings']
      }

      return {
        learnings: Array.isArray(data.learnings) ? data.learnings : [],
        totalCount:
          typeof data.totalCount === 'number'
            ? data.totalCount
            : Array.isArray(data.learnings)
              ? data.learnings.length
              : 0,
      }
    } catch {
      return { learnings: [], totalCount: 0 }
    }
  }

  async deleteOrganization(orgName: string): Promise<{
    success: boolean
    error?: string
    completionUrl?: string
    completionMessage?: string
    uninstallStatus?: string
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        let errorMessage = 'Failed to remove organization'
        try {
          const error = await response.json()
          errorMessage = error.error || errorMessage
        } catch {
          const errorText = await response.text()
          if (errorText) {
            errorMessage = errorText
          }
        }
        return { success: false, error: errorMessage }
      }
      return response.json()
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Get slash commands from an organization's discovered configs
   */
  async getSlashCommands(orgName: string): Promise<SlashCommand[]> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/commands`
      )
      if (!response.ok) {
        console.warn(`Failed to fetch commands for ${orgName}:`, response.status)
        return []
      }
      const data = await response.json()
      return data.commands || []
    } catch (error) {
      console.error(`Error fetching commands for ${orgName}:`, error)
      return []
    }
  }

  /**
   * Execute a slash command by triggering a GitHub Actions workflow
   */
  async executeCommand(
    orgName: string,
    command: string,
    args?: string,
    targetRepo?: string
  ): Promise<{ success: boolean; runId?: number; runUrl?: string; error?: string }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/commands/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command, args, targetRepo }),
        }
      )
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to execute command' }
      }
      const data = await response.json()
      return { success: true, runId: data.runId, runUrl: data.runUrl }
    } catch (error) {
      console.error(`Error executing command:`, error)
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Get the status of a workflow run
   */
  async getWorkflowStatus(
    orgName: string,
    runId: number
  ): Promise<{ status: string; conclusion: string | null } | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/commands/workflow/${runId}`
      )
      if (!response.ok) {
        return null
      }
      const data = await response.json()
      return { status: data.status, conclusion: data.conclusion }
    } catch (error) {
      console.error(`Error getting workflow status:`, error)
      return null
    }
  }

  /**
   * List workflow runs for AI Session commands
   */
  async listWorkflowRuns(
    orgName: string,
    options?: {
      status?: 'queued' | 'in_progress' | 'completed';
      limit?: number;
      page?: number;
    }
  ): Promise<{
    runs: Array<{
      id: number;
      status: string;
      conclusion: string | null;
      htmlUrl: string;
      createdAt: string;
      updatedAt: string;
      command?: string;
      args?: string;
      triggeredBy?: string;
    }>;
    totalCount: number;
    hasMore: boolean;
  }> {
    try {
      const params = new URLSearchParams();
      if (options?.status) params.set('status', options.status);
      if (options?.limit) params.set('limit', options.limit.toString());
      if (options?.page) params.set('page', options.page.toString());

      const url = `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/commands/workflow-runs${params.toString() ? `?${params}` : ''}`;
      const response = await this.fetchWithAuth(url);

      if (!response.ok) {
        throw new Error('Failed to fetch workflow runs');
      }

      return response.json();
    } catch (error) {
      console.error('Error listing workflow runs:', error);
      return { runs: [], totalCount: 0, hasMore: false };
    }
  }

  /**
   * Get jobs for a specific workflow run
   */
  async getWorkflowRunJobs(
    orgName: string,
    runId: number
  ): Promise<{
    jobs: Array<{
      id: number;
      name: string;
      status: string;
      conclusion: string | null;
      startedAt?: string;
      completedAt?: string;
      steps: Array<{
        name: string;
        status: string;
        conclusion: string | null;
        number: number;
      }>;
    }>;
  }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/commands/workflow/${runId}/jobs`
      );

      if (!response.ok) {
        throw new Error('Failed to fetch workflow jobs');
      }

      return response.json();
    } catch (error) {
      console.error('Error getting workflow jobs:', error);
      return { jobs: [] };
    }
  }

  /**
   * Cancel a running workflow
   */
  async cancelWorkflowRun(
    orgName: string,
    runId: number
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/commands/workflow/${runId}/cancel`,
        {
          method: 'POST',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to cancel workflow');
      }

      return response.json();
    } catch (error) {
      console.error('Error cancelling workflow:', error);
      return { success: false, message: 'Failed to cancel workflow' };
    }
  }

  // Repository operations (derived from organizations)
  async getRepositories(): Promise<Repository[]> {
    try {
      // Get organizations and derive repositories from their stats
      const organizations = await this.getOrganizations()
      const repos: Repository[] = []

      for (const org of organizations) {
        // Each organization represents a GitHub org/user with installed app
        // We show it as a "repository" in the UI for now
        const configCount = (org.settings?.versions || 0) + (org.commands?.count || 0) + (org.hooks?.count || 0)
        repos.push({
          id: org.name,
          name: org.name,
          owner: org.name,
          fullName: org.name,
          hasAgentConfigs: configCount > 0,
          configCount,
        })
      }

      return repos
    } catch {
      return []
    }
  }

  async getRepository(fullName: string): Promise<Repository | null> {
    try {
      const org = await this.getOrganization(fullName)
      if (!org) return null

      const configCount = (org.settings?.versions || 0) + (org.commands?.count || 0) + (org.hooks?.count || 0)
      return {
        id: org.name,
        name: org.name,
        owner: org.name,
        fullName: org.name,
        hasAgentConfigs: configCount > 0,
        configCount,
      }
    } catch {
      return null
    }
  }

  // Get branches for a repository
  async getBranches(owner: string, repo: string): Promise<{ name: string; protected: boolean }[]> {
    try {
      const response = await this.fetchWithAuth(`${this.baseUrl}/api/repos/${owner}/${repo}/branches`)
      if (!response.ok) {
        console.warn(`Failed to fetch branches for ${owner}/${repo}:`, response.status)
        return []
      }
      const data = await response.json()
      return data.branches || []
    } catch (error) {
      console.error(`Error fetching branches for ${owner}/${repo}:`, error)
      return []
    }
  }

  // Agent config operations (placeholder - needs storage integration)
  async getConfigs(_repositoryFullName?: string): Promise<AgentConfig[]> {
    // TODO: Integrate with Firebase Storage to fetch actual config files
    // For now, return empty array
    return []
  }

  // AI Analysis
  async analyzeConfigs(configs: { file: string; content: string }[]): Promise<AnalysisResponse | null> {
    try {
      const response = await this.fetchWithAuth(`${this.aiBaseUrl}/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ configs }),
      })
      if (!response.ok) throw new Error('Analysis failed')
      return response.json()
    } catch {
      return null
    }
  }

  // GitHub App installation status - queries GitHub API directly
  async getGitHubAppStatus(options?: { refresh?: boolean; throwOnError?: boolean }): Promise<GitHubInstallationStatus> {
    // Query GitHub API for real installation status (auth is via cookie)
    try {
      const url = options?.refresh
        ? `${this.apiBaseUrl}/github/installation-status?refresh=true`
        : `${this.apiBaseUrl}/github/installation-status`
      const response = await this.fetchWithAuth(url, { timeoutMs: FAST_STATUS_TIMEOUT_MS })

      if (!response.ok) {
        if (options?.throwOnError) {
          throw new Error(response.status === 429 ? 'rate limit exceeded' : 'Failed to fetch GitHub App status')
        }
        // Fallback to database check
        const organizations = await this.getOrganizations()
        return {
          installed: organizations.length > 0,
          organizations: organizations.map(org => org.name),
          installations: [],
          hasInstallations: organizations.length > 0,
        }
      }

      const data = await response.json()
      return {
        installed: data.hasInstallations,
        organizations: data.installations?.filter((i: GitHubInstallation) => i.installed).map((i: GitHubInstallation) => i.organization) || [],
        installations: data.installations || [],
        hasInstallations: data.hasInstallations,
        totalInstalled: data.totalInstalled,
        totalOrgs: data.totalOrgs,
      }
    } catch (error) {
      if (options?.throwOnError) {
        throw error
      }
      return { installed: false, organizations: [], installations: [], hasInstallations: false }
    }
  }

  // Sync GitHub App installation for an organization
  async syncGitHubInstallation(orgName: string): Promise<GitHubSyncResult | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/github/sync-installation/${encodeURIComponent(orgName)}`, {
        method: 'POST',
      })

      if (!response.ok) {
        const error = await response.json()
        return {
          success: false,
          error: error.message || error.error,
          installUrl: error.installUrl,
        }
      }

      return response.json()
    } catch (error: unknown) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  // Trigger manual scan for an organization
  // Returns immediately with 202 — poll GET /scan/:org/progress for status
  async triggerScan(orgName: string): Promise<{
    success: boolean
    jobId?: string
    message: string
    totalConfigs?: number
    byPlatform?: Record<AgentPlatform, number>
  }> {
    const response = await this.fetchWithAuth(`${this.apiBaseUrl}/scan/${encodeURIComponent(orgName)}`, {
      method: 'POST',
    })
    if (!response.ok && response.status !== 202) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Scan failed with status ${response.status}`)
    }
    return response.json()
  }

  // Get discovered repos for Approved Config page
  // Required by: 04-approved-config.md Integration Points (Discovery → Approved Config)
  async getDiscoveredRepos(orgName: string): Promise<{
    organization: string
    repos: {
      name: string
      configCount: number
      configTypes: string[]
      lastScanned: string
    }[]
    totalRepos: number
    lastScanAt: string
  }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/discovered-repos`,
        {}
      )
      if (!response.ok) {
        return { organization: orgName, repos: [], totalRepos: 0, lastScanAt: '' }
      }
      return response.json()
    } catch {
      return { organization: orgName, repos: [], totalRepos: 0, lastScanAt: '' }
    }
  }

  // Get discovered configs with content for Config Browser
  // Required by: 03-auto-discovery.md Integration Points (Discovery → Approved Config)
  // Enables: Config Browser (AC13-20), Approval actions (AC18-21)
  // Note: Supports all platform config types including rules
  async getDiscoveredConfigs(
    orgName: string,
    options?: { groupBy?: 'name'; type?: 'command' | 'rule' | 'hook' | 'settings' | 'subagent' | 'instructions' | 'mcp' | 'skill' | 'policy' | 'workflow' | 'prompt' | 'agent' }
  ): Promise<DiscoveredConfigsResponse> {
    try {
      const params = new URLSearchParams()
      if (options?.groupBy) params.set('groupBy', options.groupBy)
      if (options?.type) params.set('type', options.type)

      const url = `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/discovered-configs${params.toString() ? `?${params}` : ''}`
      const response = await this.fetchWithAuth(url, { cache: 'no-store' as RequestCache })

      if (!response.ok) {
        return { organization: orgName, configs: [], totalConfigs: 0 }
      }
      return response.json()
    } catch {
      return { organization: orgName, configs: [], totalConfigs: 0 }
    }
  }

  /**
   * Get content for a specific config file from GitHub
   * Used when cache only has metadata (for large orgs)
   */
  async getConfigContent(
    orgName: string,
    repo: string,
    path: string
  ): Promise<{ content: string; sha: string } | null> {
    try {
      const params = new URLSearchParams({ repo, path })
      const url = `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/config-content?${params}`
      const response = await this.fetchWithAuth(url, {})

      if (!response.ok) {
        return null
      }
      return response.json()
    } catch {
      return null
    }
  }

  async getConfigContentBatchDetailed(
    orgName: string,
    items: { repo: string; path: string }[],
  ): Promise<ConfigContentBatchFetchResponse> {
    try {
      const url = `${this.apiBaseUrl}/workspaces/${encodeURIComponent(orgName)}/config-content-batch`
      const response = await this.fetchWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      })

      if (!response.ok) {
        return {
          status: response.status,
          contentLength: Number(response.headers.get('content-length')) || null,
          results: {},
        }
      }
      const data = await response.json()
      return {
        status: response.status,
        contentLength: Number(response.headers.get('content-length')) || null,
        results: data.results || {},
      }
    } catch {
      return {
        status: 0,
        contentLength: null,
        results: {},
      }
    }
  }

  async getConfigContentBatch(
    orgName: string,
    items: { repo: string; path: string }[],
  ): Promise<Record<string, ConfigContentBatchResultEntry>> {
    const response = await this.getConfigContentBatchDetailed(orgName, items)
    return response.results
  }

  /**
   * Pick best config instance using Gemini AI (#2837)
   * Part of the Discover → Pick by AI → Auto-Approve → Sync governance loop.
   */
  async pickConfigByAi(
    orgName: string,
    data: {
      configName: string
      configType: string
      instances: Array<{
        repo: string
        path: string
        content: string
        commitDate?: string
        commitCount30d?: number
      }>
      intention?: string
    },
  ): Promise<{
    selectedRepo: string
    selectedPath: string
    selectedContent: string
    reasoning: string
    confidence: number
    modelInfo: { name: string; provider: string }
  }> {
    const url = `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/discovery/pick-by-ai`
    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      throw new Error(`Pick by AI failed (${response.status}): ${text}`)
    }
    return response.json()
  }

  // Pick configs by AI using the compact manifest approach (#4032 — agents.md reference)
  // One Vertex AI call instead of ~895 individual calls.
  async pickConfigsByAiManifest(
    orgName: string,
    data: {
      groups: Array<{
        id: string
        configName: string
        configType: string
        repo: string
        description?: string
        commitDate?: string
        commitCount30d?: number
      }>
      intention?: string
    },
  ): Promise<{
    approvedIds: string[]
    reasoning: string
    confidence: number
    source: 'governance-model' | 'deterministic-fallback'
    modelInfo: { name: string; provider: string }
  }> {
    const url = `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/discovery/pick-by-ai-manifest`
    const response = await this.fetchWithAuth(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      throw new Error(`Pick-by-AI manifest failed (${response.status}): ${text}`)
    }
    return response.json()
  }

  // Get scan progress for an organization
  async getScanProgress(orgName: string): Promise<{
    status: 'idle' | 'scanning' | 'complete' | 'error'
    totalRepos: number
    scannedRepos: number
    percentage: number
    currentRepo: string
    elapsedSeconds: number
    error?: string
    /** Set when GitHub App lacks Repository > Contents: Read permission. Issue #5675 */
    permissionError?: string
  }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/scan/${encodeURIComponent(orgName)}/progress`,
        {}
      )
      if (!response.ok) throw new Error('Failed to get scan progress')
      return response.json()
    } catch {
      return { status: 'idle', totalRepos: 0, scannedRepos: 0, percentage: 0, currentRepo: '', elapsedSeconds: 0 }
    }
  }

  // ========================================================================
  // Approved Config Operations
  // ========================================================================

  /**
   * Get approved config for an organization and platform
   * Public endpoint - no auth required
   */
  async getApprovedConfig(orgName: string, platform: AgentPlatform): Promise<ApprovedConfigResponse> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/approved-config?platform=${platform}`,
        {}
      )
      if (!response.ok) {
        return { approved: false, message: 'Failed to fetch approved config' }
      }
      return response.json()
    } catch {
      return { approved: false, message: 'Network error' }
    }
  }

  /**
   * Get approved configs for all platforms for an organization.
   * Used by Discovery so the browser can show published state and manage policy
   * lifecycle from the discovered-config surface.
   */
  async getApprovedConfigsByPlatform(orgName: string): Promise<ApprovedConfigsByPlatformResponse> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/approved-config?platform=all`,
        {}
      )
      if (!response.ok) {
        return { configs: {}, availablePlatforms: [] }
      }

      const data = await response.json()
      const configs = Object.fromEntries(
        Object.entries(data.configs || {}).map(([platform, config]) => [
          platform,
          { approved: true, ...(config as Record<string, unknown>) },
        ])
      ) as Partial<Record<AgentPlatform, ApprovedConfigResponse>>

      return {
        configs,
        availablePlatforms: Array.isArray(data.available_platforms) ? data.available_platforms : [],
      }
    } catch {
      return { configs: {}, availablePlatforms: [] }
    }
  }

  async updateApprovedConfigEnforcementSettings(
    orgName: string,
    platform: AgentPlatform,
    enforcementSettings: EnforcementSettings,
  ): Promise<{ success: boolean; message?: string; enforcementSettings?: EnforcementSettings }> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/approved-config/enforcement`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          enforcementSettings,
        }),
      },
    )
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error((body as Record<string, string>).error || `HTTP ${response.status}`)
    }
    return response.json()
  }

  /**
   * Set approved config for an organization (admin only)
   */
  async setApprovedConfig(
    orgName: string,
    platform: AgentPlatform,
    config: {
      hash: string
      policyName?: string  // Custom policy name (e.g., "production-safe")
      configContent?: string
      instructions?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
      commands?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
      hooks?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
      settings?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
      subagents?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
      // Cursor-specific fields (GAL-395)
      rules?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
      cursorRules?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
      // Copilot-specific fields (GAL-395)
      copilotInstructions?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
      copilotPathInstructions?: Array<{ name: string; content: string; applyTo: string; excludeAgent?: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
      copilotAgents?: Array<{ name: string; description: string; content: string; tools?: string[] | '*'; target?: 'vscode' | 'github-copilot'; infer?: boolean; sourceRepo?: string; sourcePath?: string; hash?: string }>
      copilotSkills?: Array<{ name: string; description: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
    }
  ): Promise<SetApprovedConfigResult> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/approved-config`,
        {
          method: 'PUT',
          
          body: JSON.stringify({ platform, ...config }),
        }
      )
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to set approved config' }
      }
      return response.json()
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Generate approved config proposal draft (model-assisted, no auto-publish)
   */
  async generateApprovedConfigProposal(
    orgName: string,
    request: GenerateApprovedConfigProposalRequest
  ): Promise<GenerateApprovedConfigProposalResult> {
    try {
      const requestWithSurface: GenerateApprovedConfigProposalRequest = {
        clientSurface: "dashboard",
        ...request,
      }
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/approved-config/proposals/generate`,
        {
          method: 'POST',
          body: JSON.stringify(requestWithSurface),
        }
      )

      if (!response.ok) {
        let message = 'Failed to generate proposal draft'
        try {
          const error = await response.json()
          message = error.error || message
        } catch {
          // keep default message
        }
        return { success: false, error: message }
      }

      const data = await response.json()
      return {
        success: true,
        proposal: data.proposal,
        generation: data.generation,
      }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Get all approved configs for an organization (admin only)
   */
  async getAllApprovedConfigs(orgName: string): Promise<ApprovedConfig[]> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/approved-configs`,
        {}
      )
      if (!response.ok) return []
      const data = await response.json()
      return data.configs || []
    } catch {
      return []
    }
  }

  /**
   * Delete approved config for an organization (clear all)
   */
  async deleteApprovedConfig(
    orgName: string,
    platform: AgentPlatform
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/approved-config?platform=${platform}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to delete approved config' }
      }
      return response.json()
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Remove specific items from approved config
   */
  async removeFromApprovedConfig(
    orgName: string,
    platform: AgentPlatform,
    items: {
      commands?: string[]
      commandRefs?: Array<{ name?: string; sourceRepo?: string; sourcePath?: string }>
      subagents?: string[]
      subagentRefs?: Array<{ name?: string; sourceRepo?: string; sourcePath?: string }>
      hooks?: string[]
      hookRefs?: Array<{ name?: string; sourceRepo?: string; sourcePath?: string }>
      rules?: string[]
      ruleRefs?: Array<{ name?: string; sourceRepo?: string; sourcePath?: string }>
      skills?: string[]
      clearInstructions?: boolean
      clearSettings?: boolean
      clearMcp?: boolean
    }
  ): Promise<{
    success: boolean
    removed?: { commands: number; subagents: number; hooks: number; rules: number; skills: number }
    remaining?: { commands: number; subagents: number; hooks: number; rules: number; skills: number }
    hash?: string
    error?: string
  }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/approved-config/remove`,
        {
          method: 'PATCH',
          body: JSON.stringify({ platform, ...items }),
        }
      )
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to remove items' }
      }
      return response.json()
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Bulk approve multiple discovered configs at once (Issue #2274)
   */
  async bulkApproveConfigs(
    orgName: string,
    platform: AgentPlatform,
    request: {
      configSelections?: Array<{
        type: string
        name: string
        platform?: string
        preferredInstance?: { repo: string; path: string }
      }>
      approveAll?: {
        filter?: { platform?: AgentPlatform; type?: string }
        conflictResolutions?: Array<{
          type: string; name: string; preferredRepo: string; preferredPath: string
        }>
      }
      policyName?: string
    }
  ): Promise<{
    success: boolean
    version?: string
    hash?: string
    summary?: { total: number; byType: Record<string, number>; conflictsResolved: number }
    error?: string
  }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/approved-config/bulk-approve`,
        {
          method: 'POST',
          body: JSON.stringify({ platform, ...request }),
        }
      )
      if (!response.ok) {
        const err = await response.json()
        return { success: false, error: err.error || 'Failed to bulk approve configs' }
      }
      return response.json()
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  // ========================================================================
  // Policy Management Operations (#3029)
  // ========================================================================

  /**
   * List all policies for an organization
   */
  async listPolicies(orgName: string): Promise<{ policies: ConfigPolicyItem[] }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/policies`
      )
      if (!response.ok) return { policies: [] }
      return response.json()
    } catch {
      return { policies: [] }
    }
  }

  /**
   * Create a new policy
   */
  async createPolicy(
    orgName: string,
    request: { name: string; description?: string; config?: Record<string, unknown>; duplicateFromId?: string }
  ): Promise<{ policy?: ConfigPolicyItem; error?: string }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/policies`,
        { method: 'POST', body: JSON.stringify(request) }
      )
      if (!response.ok) {
        const err = await response.json()
        return { error: err.error || 'Failed to create policy' }
      }
      return response.json()
    } catch {
      return { error: 'Network error' }
    }
  }

  /**
   * Get a specific policy
   */
  async getPolicy(orgName: string, policyId: string): Promise<{ policy?: ConfigPolicyItem; error?: string }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/policies/${encodeURIComponent(policyId)}`
      )
      if (!response.ok) {
        const err = await response.json()
        return { error: err.error || 'Policy not found' }
      }
      return response.json()
    } catch {
      return { error: 'Network error' }
    }
  }

  /**
   * Update a policy
   */
  async updatePolicy(
    orgName: string,
    policyId: string,
    updates: { name?: string; description?: string; config?: Record<string, unknown> }
  ): Promise<{ success?: boolean; error?: string }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/policies/${encodeURIComponent(policyId)}`,
        { method: 'PUT', body: JSON.stringify(updates) }
      )
      if (!response.ok) {
        const err = await response.json()
        return { success: false, error: err.error || 'Failed to update policy' }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Delete a policy
   */
  async deletePolicy(orgName: string, policyId: string): Promise<{ success?: boolean; error?: string }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/policies/${encodeURIComponent(policyId)}`,
        { method: 'DELETE' }
      )
      if (!response.ok) {
        const err = await response.json()
        return { success: false, error: err.error || 'Failed to delete policy' }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Activate a policy (makes it the active config for gal sync --pull)
   */
  async activatePolicy(orgName: string, policyId: string): Promise<{ success?: boolean; error?: string }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/policies/${encodeURIComponent(policyId)}/activate`,
        { method: 'POST' }
      )
      if (!response.ok) {
        const err = await response.json()
        return { success: false, error: err.error || 'Failed to activate policy' }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  // ========================================================================
  // Config Repo Operations (Git PR Workflow)
  // ========================================================================

  /**
   * Get config repo status for an organization
   */
  async getConfigRepoStatus(orgName: string): Promise<ConfigRepoStatus> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/config-repo`,
        {}
      )
      if (!response.ok) {
        return { enabled: false, repoUrl: null }
      }
      return response.json()
    } catch {
      return { enabled: false, repoUrl: null }
    }
  }

  /**
   * Create config repo for an organization (enables Git PR workflow)
   */
  async createConfigRepo(orgName: string): Promise<CreateConfigRepoResult> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/config-repo/create`,
        {
          method: 'POST',
          
        }
      )
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to create config repo' }
      }
      return response.json()
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  // Get platform stats for all organizations (Claude Code only)
  async getPlatformStats(options?: { throwOnError?: boolean }): Promise<Record<AgentPlatform, number>> {
    try {
      const organizations = await this.getOrganizations(
        options?.throwOnError ? { throwOnError: true } : undefined,
      )
      const stats: Record<AgentPlatform, number> = {
        claude: 0,
        cursor: 0,
        copilot: 0,
        gemini: 0,
        codex: 0,
        'codex-cloud': 0,
        windsurf: 0,
        antigravity: 0,
        amp: 0,
        'ai-studio': 0,
        kling: 0,
        higgsfield: 0,
        jules: 0,
        'gal-code': 0,
      }

      for (const org of organizations) {
        if (org.platforms) {
          for (const [platform, platformStats] of Object.entries(org.platforms)) {
            if (platform in stats) {
              stats[platform as AgentPlatform] += platformStats.totalConfigs
            }
          }
        }
      }

      return stats
    } catch (error) {
      if (options?.throwOnError) {
        throw error
      }
      return { claude: 0, cursor: 0, copilot: 0, gemini: 0, codex: 0, 'codex-cloud': 0, windsurf: 0, antigravity: 0, amp: 0, 'ai-studio': 0, kling: 0, higgsfield: 0, jules: 0, 'gal-code': 0 }
    }
  }

  // CLI sessions (placeholder for future implementation)
  async getCLISessions(): Promise<{ id: string; startTime: Date; status: string }[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/cli/sessions`)
      if (!response.ok) throw new Error('Failed to fetch CLI sessions')
      return response.json()
    } catch {
      return []
    }
  }

  // GAL-53: LLM Analysis
  async runLLMAnalysis(
    orgName: string,
    repositoryName: string,
    platform: AgentPlatform,
    configurations: { type: string; fileName: string; content: string }[]
  ): Promise<LLMAnalysisReport | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/llm-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repositoryName, platform, configurations }),
      })
      if (!response.ok) throw new Error('LLM analysis failed')
      const data = await response.json()
      return data.report
    } catch {
      return null
    }
  }

  async compareLLMVersions(
    orgName: string,
    fileName: string,
    platform: AgentPlatform,
    versions: { repoName: string; version: number; content: string }[]
  ): Promise<ConfigComparisonResult | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/llm-analysis/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, platform, versions }),
      })
      if (!response.ok) throw new Error('Version comparison failed')
      const data = await response.json()
      return data.comparison
    } catch {
      return null
    }
  }

  // GAL-54: Workflow Testing
  async testWorkflow(
    orgName: string,
    request: WorkflowTestRequest
  ): Promise<WorkflowTestResult | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/workflow-test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
      if (!response.ok) throw new Error('Workflow test failed')
      const data = await response.json()
      return data.result
    } catch {
      return null
    }
  }

  async testWorkflowBatch(
    orgName: string,
    requests: WorkflowTestRequest[]
  ): Promise<WorkflowTestReport | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/workflow-test/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      })
      if (!response.ok) throw new Error('Batch workflow test failed')
      const data = await response.json()
      return data.report
    } catch {
      return null
    }
  }

  // Billing methods
  async getBillingStatus(orgName: string): Promise<BillingStatus | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/billing/status`, {
        
      })
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  async createCheckoutSession(
    orgName: string,
    planTier: 'convenience' | 'enforcement',
    billingInterval: 'monthly' | 'yearly',
    couponCode?: string
  ): Promise<CheckoutResult> {
    const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/billing/checkout`, {
      method: 'POST',

      body: JSON.stringify({
        planTier,
        billingInterval,
        successUrl: `${window.location.origin}/billing?success=true`,
        cancelUrl: `${window.location.origin}/billing?canceled=true`,
        ...(couponCode && { couponCode }),
      }),
    })
    if (!response.ok) {
      let message = 'Failed to start checkout. Please try again or contact support.'
      try {
        const error = await response.json()
        if (error.error) {
          message = error.error
        }
      } catch {
        // Response body not JSON — use default message
      }
      throw new Error(message)
    }
    return response.json()
  }

  async createPortalSession(orgName: string): Promise<PortalResult> {
    const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/billing/portal`, {
      method: 'POST',

      body: JSON.stringify({ returnUrl: window.location.href }),
    })
    if (!response.ok) {
      let message = 'Failed to open billing portal. Please try again or contact support.'
      try {
        const error = await response.json()
        if (error.error) {
          message = error.error
        }
      } catch {
        // Response body not JSON — use default message
      }
      throw new Error(message)
    }
    return response.json()
  }

  async validateCoupon(code: string): Promise<CouponValidationResult> {
    const response = await this.fetchWithAuth(`${this.apiBaseUrl}/billing/validate-coupon`, {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
    if (!response.ok) {
      return {
        valid: false,
        code,
        error: 'Failed to validate coupon code',
      }
    }
    return response.json()
  }

  async cancelSubscription(orgName: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/billing/cancel`, {
        method: 'POST',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  async resumeSubscription(orgName: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/billing/resume`, {
        method: 'POST',

      })
      return response.ok
    } catch {
      return false
    }
  }

  // ========================================================================
  // TAL: Workflow Events & Rules
  // ========================================================================

  async getWorkflowEvents(orgName: string, limit = 50): Promise<WorkflowEvent[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/workflow/events?limit=${limit}`, {
        
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.events || []
    } catch {
      return []
    }
  }

  async createWorkflowEvent(orgName: string, event: Omit<WorkflowEvent, 'id' | 'orgName' | 'timestamp' | 'status'>): Promise<WorkflowEvent | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/workflow/events`, {
        method: 'POST',
        
        body: JSON.stringify(event),
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.event
    } catch {
      return null
    }
  }

  async getWorkflowRules(orgName: string): Promise<WorkflowRule[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/workflow/rules`, {
        
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.rules || []
    } catch {
      return []
    }
  }

  async createWorkflowRule(orgName: string, rule: Omit<WorkflowRule, 'id' | 'orgName' | 'triggerCount'>): Promise<WorkflowRule | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/workflow/rules`, {
        method: 'POST',
        
        body: JSON.stringify(rule),
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.rule
    } catch {
      return null
    }
  }

  async updateWorkflowRule(orgName: string, ruleId: string, updates: Partial<WorkflowRule>): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/workflow/rules/${ruleId}`, {
        method: 'PATCH',
        
        body: JSON.stringify(updates),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async deleteWorkflowRule(orgName: string, ruleId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/workflow/rules/${ruleId}`, {
        method: 'DELETE',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  // ========================================================================
  // TAL: Quality Metrics
  // ========================================================================

  async getQualityMetrics(orgName: string): Promise<QualityMetrics | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/quality`, {
        
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.metrics
    } catch {
      return null
    }
  }

  async runQualityScan(orgName: string, scanData: Partial<QualityMetrics>): Promise<QualityMetrics | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/quality/scan`, {
        method: 'POST',
        
        body: JSON.stringify(scanData),
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.metrics
    } catch {
      return null
    }
  }

  // ========================================================================
  // TAL: Test Runner
  // ========================================================================

  async getTestRuns(orgName: string, limit = 10): Promise<TestRun[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/tests?limit=${limit}`, {
        
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.runs || []
    } catch {
      return []
    }
  }

  async createTestRun(orgName: string, repoName?: string): Promise<TestRun | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/tests`, {
        method: 'POST',
        
        body: JSON.stringify({ repoName }),
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.run
    } catch {
      return null
    }
  }

  async updateTestRun(orgName: string, runId: string, updates: Partial<TestRun>): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/tests/${runId}`, {
        method: 'PATCH',
        
        body: JSON.stringify(updates),
      })
      return response.ok
    } catch {
      return false
    }
  }

  // ========================================================================
  // TAL: Time Tracking
  // ========================================================================

  async getTimeSessions(orgName: string, limit = 20): Promise<TimeSession[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/time?limit=${limit}`, {
        
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.sessions || []
    } catch {
      return []
    }
  }

  async getActiveTimeSession(orgName: string): Promise<TimeSession | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/time/active`, {
        
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.session
    } catch {
      return null
    }
  }

  async startTimeSession(orgName: string, ticketKey: string, ticketSummary?: string): Promise<TimeSession | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/time/start`, {
        method: 'POST',
        
        body: JSON.stringify({ ticketKey, ticketSummary }),
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.session
    } catch {
      return null
    }
  }

  async stopTimeSession(orgName: string, sessionId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/time/${sessionId}/stop`, {
        method: 'POST',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  async pauseTimeSession(orgName: string, sessionId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/time/${sessionId}/pause`, {
        method: 'POST',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  async resumeTimeSession(orgName: string, sessionId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/time/${sessionId}/resume`, {
        method: 'POST',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  // ========================================================================
  // SAL: Sandboxes
  // ========================================================================

  async getSandboxes(orgName: string): Promise<Sandbox[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/sandboxes`, {
        
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.sandboxes || []
    } catch {
      return []
    }
  }

  async createSandbox(orgName: string, sandbox: Omit<Sandbox, 'id' | 'orgName' | 'createdAt' | 'status'>): Promise<Sandbox | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/sandboxes`, {
        method: 'POST',
        
        body: JSON.stringify(sandbox),
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.sandbox
    } catch {
      return null
    }
  }

  async startSandbox(orgName: string, sandboxId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/sandboxes/${sandboxId}/start`, {
        method: 'POST',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  async stopSandbox(orgName: string, sandboxId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/sandboxes/${sandboxId}/stop`, {
        method: 'POST',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  async deleteSandbox(orgName: string, sandboxId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/sandboxes/${sandboxId}`, {
        method: 'DELETE',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  // ========================================================================
  // SAL: Maintenance
  // ========================================================================

  async getMaintenanceData(orgName: string): Promise<{ tasks: MaintenanceTask[]; dependencies: Dependency[] }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/maintenance`, {
        
      })
      if (!response.ok) return { tasks: [], dependencies: [] }
      return response.json()
    } catch {
      return { tasks: [], dependencies: [] }
    }
  }

  async createMaintenanceTask(orgName: string, task: Omit<MaintenanceTask, 'id' | 'orgName' | 'status'>): Promise<MaintenanceTask | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/maintenance/tasks`, {
        method: 'POST',
        
        body: JSON.stringify(task),
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.task
    } catch {
      return null
    }
  }

  async runMaintenanceTask(orgName: string, taskId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/maintenance/tasks/${taskId}/run`, {
        method: 'POST',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  // ========================================================================
  // GAL: Templates
  // ========================================================================

  async getTemplates(category?: string): Promise<Template[]> {
    try {
      const url = category && category !== 'all'
        ? `${this.apiBaseUrl}/templates?category=${category}`
        : `${this.apiBaseUrl}/templates`
      const response = await this.fetchWithAuth(url)
      if (!response.ok) return []
      const data = await response.json()
      return data.templates || []
    } catch {
      return []
    }
  }

  async getOrgTemplates(orgName: string): Promise<OrgTemplate[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/templates`, {
        
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.templates || []
    } catch {
      return []
    }
  }

  async installTemplate(orgName: string, templateId: string): Promise<OrgTemplate | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/templates/${templateId}/install`, {
        method: 'POST',
        
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.template
    } catch {
      return null
    }
  }

  async uninstallTemplate(orgName: string, orgTemplateId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/templates/${orgTemplateId}`, {
        method: 'DELETE',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  // ========================================================================
  // GAL: Security/Protection
  // ========================================================================

  async getSecurityRules(orgName: string): Promise<SecurityRule[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/security/rules`, {
        
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.rules || []
    } catch {
      return []
    }
  }

  async createSecurityRule(orgName: string, rule: Omit<SecurityRule, 'id' | 'orgName' | 'triggered'>): Promise<SecurityRule | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/security/rules`, {
        method: 'POST',
        
        body: JSON.stringify(rule),
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.rule
    } catch {
      return null
    }
  }

  async updateSecurityRule(orgName: string, ruleId: string, updates: Partial<SecurityRule>): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/security/rules/${ruleId}`, {
        method: 'PATCH',
        
        body: JSON.stringify(updates),
      })
      return response.ok
    } catch {
      return false
    }
  }

  async deleteSecurityRule(orgName: string, ruleId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/security/rules/${ruleId}`, {
        method: 'DELETE',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  async getSecurityEvents(orgName: string, limit = 50): Promise<SecurityEvent[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/security/events?limit=${limit}`, {
        
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.events || []
    } catch {
      return []
    }
  }

  // ========================================================================
  // GAL: Universal Agent Detection
  // ========================================================================

  async getAgentDetections(orgName: string): Promise<AgentDetection[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/agents`, {
        
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.agents || []
    } catch {
      return []
    }
  }

  async detectAgents(orgName: string): Promise<AgentDetection[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/agents/detect`, {
        method: 'POST',
        
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.agents || []
    } catch {
      return []
    }
  }

  // ========================================================================
  // GAL: Managed Agent Deployment
  // ========================================================================

  async listManagedAgents(orgName: string): Promise<ManagedAgentDefinition[]> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/managed-agents/${encodeURIComponent(orgName)}`,
    )
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.message || data?.error || 'Failed to fetch managed agents')
    }

    return data.agents || []
  }

  async createManagedAgent(
    orgName: string,
    request: CreateManagedAgentRequest,
  ): Promise<ManagedAgentDefinition> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/managed-agents/${encodeURIComponent(orgName)}`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    )
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.message || data?.error || 'Failed to create managed agent')
    }

    return data.agent
  }

  async createManagedAgentVersion(
    orgName: string,
    agentId: string,
    request: CreateManagedAgentVersionRequest,
  ): Promise<ManagedAgentVersion> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/managed-agents/${encodeURIComponent(orgName)}/${encodeURIComponent(agentId)}/versions`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    )
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.message || data?.error || 'Failed to create managed-agent version')
    }

    return data.version
  }

  async createManagedAgentEvalRun(
    orgName: string,
    agentId: string,
    version: string,
    request: CreateManagedAgentEvalRunRequest,
  ): Promise<ManagedAgentEvalRun> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/managed-agents/${encodeURIComponent(orgName)}/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(version)}/eval-runs`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    )
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.message || data?.error || 'Failed to create managed-agent eval run')
    }

    return data.evalRun
  }

  async getManagedAgentEvalRun(
    orgName: string,
    agentId: string,
    version: string,
    runId: string,
  ): Promise<ManagedAgentEvalRun> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/managed-agents/${encodeURIComponent(orgName)}/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(version)}/eval-runs/${encodeURIComponent(runId)}`,
    )
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.message || data?.error || 'Failed to fetch managed-agent eval run')
    }

    return data.evalRun
  }

  async claimManagedAgentEvalRun(
    orgName: string,
    agentId: string,
    version: string,
    runId: string,
  ): Promise<ManagedAgentEvalWorkPacket> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/managed-agents/${encodeURIComponent(orgName)}/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(version)}/eval-runs/${encodeURIComponent(runId)}/claim`,
      { method: 'POST' },
    )
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.message || data?.error || 'Failed to claim managed-agent eval run')
    }

    return data.workPacket
  }

  async submitManagedAgentEvalReport(
    orgName: string,
    agentId: string,
    version: string,
    runId: string,
    request: SubmitManagedAgentEvalReportRequest,
  ): Promise<ManagedAgentEvalRun> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/managed-agents/${encodeURIComponent(orgName)}/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(version)}/eval-runs/${encodeURIComponent(runId)}/report`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    )
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.message || data?.error || 'Failed to submit managed-agent eval report')
    }

    return data.evalRun
  }

  async promoteManagedAgentVersion(
    orgName: string,
    agentId: string,
    version: string,
  ): Promise<ManagedAgentVersion> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/managed-agents/${encodeURIComponent(orgName)}/${encodeURIComponent(agentId)}/versions/${encodeURIComponent(version)}/promote`,
      { method: 'POST' },
    )
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.message || data?.error || 'Failed to promote managed-agent version')
    }

    return data.version
  }

  // ========================================================================
  // GAL: Docs Generator
  // ========================================================================

  async getGeneratedDocs(orgName: string): Promise<GeneratedDoc[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/docs`, {
        
      })
      if (!response.ok) return []
      const data = await response.json()
      return data.docs || []
    } catch {
      return []
    }
  }

  async generateDoc(orgName: string, doc: Omit<GeneratedDoc, 'id' | 'orgName' | 'generated' | 'status' | 'size'>): Promise<GeneratedDoc | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/docs/generate`, {
        method: 'POST',
        
        body: JSON.stringify(doc),
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.doc
    } catch {
      return null
    }
  }

  async deleteGeneratedDoc(orgName: string, docId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/docs/${docId}`, {
        method: 'DELETE',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  async getDocTemplates(orgName: string): Promise<DocTemplate[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/doc-templates`)
      if (!response.ok) return []
      const data = await response.json()
      return data.templates || []
    } catch (error: unknown) {
      // If endpoint doesn't exist (404) or other error, return empty array
      console.debug('Doc templates endpoint not available:', error instanceof Error ? error.message : error)
      return []
    }
  }

  async regenerateAllDocs(orgName: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/docs/regenerate`, {
        method: 'POST',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  async generateDocFromTemplate(orgName: string, templateId: string): Promise<GeneratedDoc | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/docs/generate`, {
        method: 'POST',
        
        body: JSON.stringify({ templateId }),
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.doc
    } catch {
      return null
    }
  }

  async runSecurityScan(orgName: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/security/scan`, {
        method: 'POST',
        
      })
      return response.ok
    } catch {
      return false
    }
  }

  async logTimeSession(orgName: string, sessionId: string): Promise<TimeSession | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/time/${sessionId}/log`, {
        method: 'POST',
        
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.session
    } catch {
      return null
    }
  }

  async runAgentDetection(orgName: string): Promise<AgentDetection[]> {
    return this.detectAgents(orgName)
  }

  async installGALOnPlatform(orgName: string, platformId: string): Promise<AgentDetection | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/agents/${platformId}/install`, {
        method: 'POST',
        
      })
      if (!response.ok) return null
      const data = await response.json()
      return data.agent
    } catch {
      return null
    }
  }

  async getMaintenanceTasks(orgName: string): Promise<MaintenanceTask[]> {
    const data = await this.getMaintenanceData(orgName)
    return data.tasks
  }

  async getDependencies(orgName: string): Promise<Dependency[]> {
    const data = await this.getMaintenanceData(orgName)
    return data.dependencies
  }

  // ========================================================================
  // Platform Stats (Dashboard)
  // ========================================================================

  async getOrgPlatformStats(orgName: string): Promise<OrgPlatformStats | null> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/platform-stats`, {

      })
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  // ========================================================================
  // Supervisor/Worker Observability (Issue #2140)
  // ========================================================================

  async getSupervisorMetrics(orgName: string): Promise<SupervisorMetricsResponse> {
    // Fetch from multiple endpoints in parallel to assemble real metrics.
    // The orchestration supervisor-metrics endpoint returns zeros when the
    // control plane isn't running, so we supplement with queue/status,
    // queue-consumer/health, and work-items/queue/stats which always have
    // real data from Firestore. (#4604)
    const params = new URLSearchParams({ org: orgName })

    const [supervisorRes, queueStatusRes, consumerHealthRes, queueStatsRes] =
      await Promise.allSettled([
        this.fetchWithAuth(
          `${this.apiBaseUrl}/api/orchestration/supervisor-metrics?${params}`
        ),
        this.fetchWithAuth(`${this.apiBaseUrl}/api/queue/status?${params}`),
        this.fetchWithAuth(`${this.apiBaseUrl}/api/queue-consumer/health`),
        this.fetchWithAuth(`${this.apiBaseUrl}/api/work-items/queue/stats?${params}`),
      ])

    // Parse supervisor-metrics (primary shape, may be all zeros)
    let base: SupervisorMetricsResponse | null = null
    if (supervisorRes.status === 'fulfilled' && supervisorRes.value.ok) {
      const json = await supervisorRes.value.json()
      base = json.data ?? null
    }

    // Parse queue/status — org-scoped real pending/active/completed/failed counts
    let queueStatus: {
      pending?: number
      active?: number
      completed_today?: number
      failed_today?: number
      consumer_healthy?: boolean
      last_dispatch_at?: string | null
    } | null = null
    if (queueStatusRes.status === 'fulfilled' && queueStatusRes.value.ok) {
      queueStatus = await queueStatusRes.value.json()
    }

    // Parse queue-consumer/health — singleton (not org-scoped).
    // Only use for dispatch counters when the returned organizationId matches
    // the requested org to avoid cross-workspace metric leakage (#4604 P2).
    let consumerHealth: {
      status?: string
      organizationId?: string
      metrics?: {
        isRunning?: boolean
        dispatched?: number
        dispatchFailures?: number
        retries?: number
        lastDispatchAt?: string | null
      }
    } | null = null
    if (consumerHealthRes.status === 'fulfilled' && consumerHealthRes.value.ok) {
      const raw = await consumerHealthRes.value.json()
      // Only overlay these counters when the consumer is serving our org
      if (raw.organizationId === orgName) {
        consumerHealth = raw
      }
    }

    // Parse work-items/queue/stats — org-scoped (maxActive capacity)
    let queueStats: {
      active?: number
      maxActive?: number
      consumerPaused?: boolean
    } | null = null
    if (queueStatsRes.status === 'fulfilled' && queueStatsRes.value.ok) {
      queueStats = await queueStatsRes.value.json()
    }

    // P1: If every source failed, throw so the UI shows an error (#4604)
    if (!base && !queueStatus && !queueStats) {
      throw new Error('Failed to fetch supervisor metrics')
    }

    // Build merged response — prefer org-scoped real data over base zeros
    const activeAgents = queueStatus?.active ?? queueStats?.active ?? base?.workers.totalActive ?? 0
    const maxAgents = queueStats?.maxActive ?? base?.workers.totalCapacity ?? 0
    const occupancy = maxAgents > 0 ? (activeAgents / maxAgents) * 100 : 0

    const dispatched = consumerHealth?.metrics?.dispatched ?? base?.dispatch.totalDispatched ?? 0
    const failures = consumerHealth?.metrics?.dispatchFailures ?? base?.dispatch.totalFailures ?? 0
    const retries = consumerHealth?.metrics?.retries ?? base?.dispatch.totalRetries ?? 0
    const lastDispatch = consumerHealth?.metrics?.lastDispatchAt ?? queueStatus?.last_dispatch_at ?? base?.dispatch.lastDispatchAt ?? null

    const queueDepth = queueStatus?.pending ?? base?.queue.depth ?? 0
    const pressurePct = maxAgents > 0 ? (queueDepth / maxAgents) * 100 : 0

    const isRunning = consumerHealth?.metrics?.isRunning ?? queueStatus?.consumer_healthy ?? base?.supervisor.isRunning ?? false

    return {
      supervisor: {
        isRunning,
        isPaused: queueStats?.consumerPaused ?? base?.supervisor.isPaused ?? false,
        activeSessions: activeAgents,
        uptimeMs: base?.supervisor.uptimeMs ?? 0,
        lastDecisionAt: lastDispatch,
      },
      workers: {
        totalActive: activeAgents,
        totalCapacity: maxAgents,
        occupancyPct: occupancy,
        byProvider: base?.workers.byProvider ?? [],
      },
      queue: {
        depth: queueDepth,
        pressurePct,
        oldestItemAge: base?.queue.oldestItemAge ?? null,
      },
      dispatch: {
        totalDispatched: dispatched,
        totalRetries: retries,
        totalFailures: failures,
        avgDispatchLatencyMs: base?.dispatch.avgDispatchLatencyMs ?? 0,
        lastDispatchAt: lastDispatch,
      },
      recentEvents: base?.recentEvents ?? [],
      fetchedAt: new Date().toISOString(),
    }
  }

  // ========================================================================
  // User Settings (GAL-109)
  // ========================================================================

  async getUserSettings(): Promise<Record<string, unknown>> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/user/settings`, {
        
      })
      if (!response.ok) return {}
      return response.json()
    } catch {
      return {}
    }
  }

  async updateUserSettings(settings: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/user/settings`, {
        method: 'PUT',

        body: JSON.stringify(settings),
      })
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to update settings' }
      }
      return response.json()
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  // ========================================================================
  // GAL-569: Connected Providers (User Story 4)
  // ========================================================================

  /**
   * Get connected providers for the current user
   */
  async getConnectedProviders(): Promise<ConnectedProvider[]> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/auth/providers`)
      if (!response.ok) return []
      const data = await response.json()
      return data.providers || []
    } catch {
      return []
    }
  }

  /**
   * Disconnect a provider from the current user's account
   * @param provider - Provider type to disconnect ('github' | 'google' | 'email')
   */
  async disconnectProvider(provider: string): Promise<{ success: boolean; error?: string; providers?: string[] }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/auth/providers/disconnect`, {
        method: 'POST',
        body: JSON.stringify({ provider }),
      })
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to disconnect provider' }
      }
      return response.json()
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  async getAdminGitHubRateLimits(): Promise<{
    scopes: GitHubRateLimitScope[]
    totalScopes: number
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/admin/github/rate-limits`)
      if (!response.ok) {
        throw new Error('Failed to fetch GitHub rate limits')
      }
      return response.json()
    } catch {
      return { scopes: [], totalScopes: 0 }
    }
  }

  /**
   * Get the URL to initiate GitHub connection flow
   * @param redirectPath - Path to redirect after successful connection
   */
  getConnectGitHubUrl(redirectPath?: string): string {
    const url = new URL(`${this.apiBaseUrl}/auth/github/connect`)
    if (redirectPath) {
      // Handle Firebase preview domains
      const isFirebasePreview = window.location.hostname.includes('--') &&
                                 window.location.hostname.endsWith('.web.app')
      if (isFirebasePreview) {
        url.searchParams.set('redirect', `${window.location.origin}${redirectPath}`)
      } else {
        url.searchParams.set('redirect', redirectPath)
      }
    }
    return url.toString()
  }

  /**
   * Get the URL to install the GAL GitHub App
   * @param redirectPath - Path to redirect after installation (optional)
   */
  getGitHubAppInstallUrl(redirectPath?: string): string {
    const slug = process.env['NEXT_PUBLIC_GITHUB_APP_SLUG'] || 'gal-by-scheduler-systems'
    const url = new URL(`https://github.com/apps/${slug}/installations/new`)
    if (redirectPath) {
      url.searchParams.set('state', redirectPath)
    }
    return url.toString()
  }

  /**
   * Get personal GitHub connection status
   * Used by WorkspaceContext to check if user has connected personal GitHub
   */
  async getPersonalGitHubStatus(): Promise<PersonalGitHubStatus> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/auth/github/personal/status`)
      if (!response.ok) {
        return { connected: false, username: undefined }
      }
      return response.json()
    } catch {
      return { connected: false, username: undefined }
    }
  }

  /**
   * Disconnect personal GitHub from the user's account
   */
  async disconnectPersonalGitHub(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/auth/github/personal/disconnect`, {
        method: 'POST',
      })
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to disconnect personal GitHub' }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }
  // ========================================================================
  // Workspace Preference (Issue #64: Workspace Separation - US5)
  // ========================================================================

  /**
   * Get user's workspace preference
   * Returns saved preference or default (organization)
   */
  async getWorkspacePreference(): Promise<{
    workspace: 'organization' | 'personal'
    updatedAt: string
    isDefault: boolean
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/workspace/preference`)
      if (!response.ok) {
        // Return default on error
        return { workspace: 'organization', updatedAt: new Date().toISOString(), isDefault: true }
      }
      return response.json()
    } catch {
      return { workspace: 'organization', updatedAt: new Date().toISOString(), isDefault: true }
    }
  }

  /**
   * Save user's workspace preference
   * Persists workspace selection to server for cross-device sync
   */
  async saveWorkspacePreference(workspace: 'organization' | 'personal'): Promise<{
    success: boolean
    workspace?: 'organization' | 'personal'
    updatedAt?: string
    error?: string
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/workspace/preference`, {
        method: 'PUT',
        body: JSON.stringify({ workspace }),
      })
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to save workspace preference' }
      }
      return response.json()
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  // ========================================================================
  // Personal Workspace APIs (Issue #64 Phase 9: Feature Parity)
  // ========================================================================

  /**
   * Trigger scan of personal repos for Claude configs (T048)
   * Scans all repos accessible via personal GitHub connection
   */
  async triggerPersonalScan(): Promise<{
    success: boolean
    message?: string
    totalRepos?: number
    reposWithConfigs?: number
    configs?: Array<{ repo: string; type: string; path: string }>
    error?: string
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/scan/personal`, {
        method: 'POST',
      })
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Scan failed' }
      }
      return response.json()
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Get personal discovered repos from last scan (T049)
   * Returns repos that have Claude configs
   */
  async getPersonalDiscoveredRepos(): Promise<{
    repos: Array<{
      name: string
      fullName: string
      configCount: number
      configTypes: string[]
      lastScanned: string
    }>
    totalRepos: number
    lastScanAt: string | null
    username: string
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/personal/discovered-repos`)
      if (!response.ok) {
        return { repos: [], totalRepos: 0, lastScanAt: null, username: '' }
      }
      return response.json()
    } catch {
      return { repos: [], totalRepos: 0, lastScanAt: null, username: '' }
    }
  }

  /**
   * Get personal discovered configs for a specific repo (T050)
   */
  async getPersonalDiscoveredConfigs(repoName: string): Promise<{
    repo: string
    configs: Array<{
      type: string
      name: string
      path: string
      content: string
      lastModified: string
    }>
    totalConfigs: number
  }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/personal/discovered-configs/${encodeURIComponent(repoName)}`
      )
      if (!response.ok) {
        return { repo: repoName, configs: [], totalConfigs: 0 }
      }
      return response.json()
    } catch {
      return { repo: repoName, configs: [], totalConfigs: 0 }
    }
  }

  /**
   * Get personal approved config (T055)
   * Used by personal users to get their approved config selection
   */
  async getPersonalApprovedConfig(): Promise<{
    approved: boolean
    sourceRepo?: string
    configContent?: string
    version?: string
    hash?: string
    approvedAt?: string
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/personal/approved-config`)
      if (!response.ok) {
        return { approved: false }
      }
      return response.json()
    } catch {
      return { approved: false }
    }
  }

  /**
   * Set personal approved config (T056)
   * Allows personal user to select which repo's config to use
   */
  async setPersonalApprovedConfig(config: {
    sourceRepo: string
    configContent?: string
  }): Promise<{
    success: boolean
    version?: string
    hash?: string
    error?: string
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/personal/approved-config`, {
        method: 'PUT',
        body: JSON.stringify(config),
      })
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to set approved config' }
      }
      return response.json()
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Get personal workspace stats (T061)
   * Dashboard stats for personal workspace
   */
  async getPersonalStats(): Promise<{
    connected: boolean
    username: string
    totalRepos: number
    reposWithConfigs: number
    totalConfigs: number
    hasApprovedConfig: boolean
    approvedConfigRepo: string | null
    lastSyncAt: string | null
    lastScanAt: string | null
  }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/personal/stats`)
      if (!response.ok) {
        return {
          connected: false,
          username: '',
          totalRepos: 0,
          reposWithConfigs: 0,
          totalConfigs: 0,
          hasApprovedConfig: false,
          approvedConfigRepo: null,
          lastSyncAt: null,
          lastScanAt: null,
        }
      }
      return response.json()
    } catch {
      return {
        connected: false,
        username: '',
        totalRepos: 0,
        reposWithConfigs: 0,
        totalConfigs: 0,
        hasApprovedConfig: false,
        approvedConfigRepo: null,
        lastSyncAt: null,
        lastScanAt: null,
      }
    }
  }

  // GAL-130: Developer Status
  async getDeveloperStatus(orgName: string): Promise<DeveloperStatusSummary> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/developer-status`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch developer status')
      }
      return response.json()
    } catch (error) {
      console.error('Failed to fetch developer status:', error)
      throw error
    }
  }

  async seedDeveloperStatus(orgName: string): Promise<{ success: boolean; seeded: number; existing: number }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/developer-status/seed`,
        { method: 'POST' }
      )
      if (!response.ok) {
        throw new Error('Failed to seed developer status')
      }
      return response.json()
    } catch (error) {
      console.error('Failed to seed developer status:', error)
      throw error
    }
  }

  // ============================================================================
  // GAL-272: Team Access Management
  // ============================================================================

  /**
   * Get team members with their GAL roles
   */
  async getTeamMembers(orgName: string): Promise<{ members: TeamMember[] }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/team`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch team members')
      }
      return response.json()
    } catch (error) {
      console.error('Failed to fetch team members:', error)
      throw error
    }
  }

  /**
   * Get team summary with role counts (legacy - reads from Firestore)
   */
  async getTeamSummary(orgName: string): Promise<TeamMemberSummary> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/team/summary`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch team summary')
      }
      return response.json()
    } catch (error) {
      console.error('Failed to fetch team summary:', error)
      throw error
    }
  }

  /**
   * Get team members with live GitHub sync (GAL-1741)
   * Uses cached data with 5-min TTL, auto-syncs from GitHub when stale
   */
  async getLiveTeamMembers(orgName: string, force?: boolean): Promise<TeamMembersLiveResponse> {
    try {
      const url = new URL(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/team/members`
      )
      if (force) url.searchParams.set('force', 'true')
      const response = await this.fetchWithAuth(url.toString())
      if (!response.ok) {
        throw new Error('Failed to fetch live team members')
      }
      return response.json()
    } catch (error) {
      console.error('Failed to fetch live team members:', error)
      throw error
    }
  }

  /**
   * Force sync team members from GitHub (GAL-1741)
   */
  async syncTeamMembers(orgName: string): Promise<TeamMembersLiveResponse> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/team/sync`,
        { method: 'POST' }
      )
      if (!response.ok) {
        throw new Error('Failed to sync team members')
      }
      return response.json()
    } catch (error) {
      console.error('Failed to sync team members:', error)
      throw error
    }
  }

  /**
   * Update a team member's role via GitHub ID (live sync version, GAL-1741)
   */
  async updateLiveTeamMemberRole(
    orgName: string,
    githubId: number,
    role: GalRole
  ): Promise<{ success: boolean; githubId: number; role: GalRole; overrideStored: boolean; message?: string }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/team/members/${githubId}/role`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        }
      )
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update role')
      }
      return response.json()
    } catch (error) {
      console.error('Failed to update team member role:', error)
      throw error
    }
  }

  /**
   * Get current user's team membership
   */
  async getMyTeamMembership(orgName: string): Promise<{
    member: TeamMember | null
    galRole: GalRole
    message?: string
  }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/team/me`
      )
      if (!response.ok) {
        throw new Error('Failed to fetch team membership')
      }
      return response.json()
    } catch (error) {
      console.error('Failed to fetch team membership:', error)
      throw error
    }
  }

  /**
   * Update a team member's GAL role (admin/owner only)
   */
  async updateTeamMemberRole(
    orgName: string,
    userId: string,
    role: GalRole
  ): Promise<RoleChangeResponse> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/team/${encodeURIComponent(userId)}/role`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role }),
        }
      )
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.message || error.error || 'Failed to update role')
      }
      return response.json()
    } catch (error) {
      console.error('Failed to update team member role:', error)
      throw error
    }
  }

  // ==========================================================================
  // Claude Code Credentials Management (Background Agents)
  // ==========================================================================

  /**
   * Check if Claude Code credentials are configured
   */
  async getClaudeCredentialsStatus(): Promise<ClaudeCredentialsStatus> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/credentials/claude`)
      if (!response.ok) {
        return { exists: false }
      }
      return response.json()
    } catch {
      return { exists: false }
    }
  }

  /**
   * Store Claude Code API key (encrypted server-side)
   */
  async setClaudeCredentials(accessToken: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/credentials/claude`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      })
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || error.message || 'Failed to store credentials' }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Delete Claude Code credentials
   */
  async deleteClaudeCredentials(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/credentials/claude`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to delete credentials' }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  // ==========================================================================
  // Multi-Provider Credentials API (Issue #1136)
  // ==========================================================================

  /**
   * Get status of all credential providers
   */
  async getAllCredentialsStatus(): Promise<import('@gal/types').AllCredentialsResponse> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/credentials`)
      if (!response.ok) {
        return { credentials: [] }
      }
      return await response.json()
    } catch {
      return { credentials: [] }
    }
  }

  /**
   * Get credential status for a specific provider
   */
  async getCredentialStatus(provider: import('@gal/types').CredentialProvider): Promise<import('@gal/types').CredentialStatusResponse> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/credentials/${provider}`)
      if (!response.ok) {
        return { exists: false, provider, status: 'not_configured' }
      }
      return await response.json()
    } catch {
      return { exists: false, provider, status: 'not_configured' }
    }
  }

  /**
   * Set credentials (API key) for a specific provider
   */
  async setCredentials(
    provider: import('@gal/types').CredentialProvider,
    accessToken: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/credentials/${provider}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken }),
      })
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to save credentials' }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Delete credentials for a specific provider
   */
  async deleteCredentials(provider: import('@gal/types').CredentialProvider): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/credentials/${provider}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        const error = await response.json()
        return { success: false, error: error.error || 'Failed to delete credentials' }
      }
      return { success: true }
    } catch {
      return { success: false, error: 'Network error' }
    }
  }

  /**
   * Validate a credential for a specific provider (Issue #2574)
   * Calls POST /api/credentials/:provider/validate
   */
  async validateCredential(provider: import('@gal/types').CredentialProvider): Promise<CredentialValidationResult> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/credentials/${provider}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      if (response.status === 404) {
        return { valid: false, status: 'not_configured', error: 'Credentials not configured' }
      }
      if (!response.ok) {
        const data = await response.json()
        return { valid: false, status: 'error', error: data.error || 'Validation failed' }
      }
      return await response.json()
    } catch {
      return { valid: false, status: 'error', error: 'Network error' }
    }
  }

  /**
   * Save an API key for a specific provider (Issue #2574)
   * Wraps setCredentials for the API key use case
   */
  async saveApiKey(provider: import('@gal/types').CredentialProvider, apiKey: string): Promise<{ success: boolean; error?: string }> {
    return this.setCredentials(provider, apiKey)
  }

  /**
   * Check dispatch readiness for a specific provider (Issue #2574)
   * Validates credentials and returns readiness status
   */
  async checkDispatchReadiness(provider: import('@gal/types').CredentialProvider): Promise<DispatchReadinessResult> {
    try {
      const [credStatus, validation] = await Promise.all([
        this.getCredentialStatus(provider),
        this.validateCredential(provider),
      ])
      return {
        provider,
        ready: validation.valid === true,
        credentialStatus: credStatus.status,
        validationResult: validation,
      }
    } catch {
      return {
        provider,
        ready: false,
        credentialStatus: 'not_configured',
        validationResult: { valid: false, status: 'error', error: 'Network error' },
      }
    }
  }

  /**
   * Public fetch method for custom API calls
   * Uses the same auth headers and credentials as internal methods
   */
  async fetch(url: string, options?: RequestInit): Promise<Response> {
    // Prepend API base URL if the URL is relative
    const fullUrl = url.startsWith('http') ? url : `${this.apiBaseUrl}${url}`
    return this.fetchWithAuth(fullUrl, options)
  }

  async createSwarmRun(orgName: string, request: GalSwarmRunRequest): Promise<GalSwarmRunApiResponse> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/swarm/${encodeURIComponent(orgName)}/runs`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      },
    )

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || data?.message || 'Failed to create swarm run')
    }

    return data as GalSwarmRunApiResponse
  }

  async getSwarmRun(orgName: string, runId: string): Promise<GalSwarmRunStatus> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/swarm/${encodeURIComponent(orgName)}/runs/${encodeURIComponent(runId)}`,
    )

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || data?.message || 'Failed to fetch swarm run status')
    }

    return data as GalSwarmRunStatus
  }

  async getSwarmCapabilities(orgName: string): Promise<GalSwarmCapabilityCatalogResponse> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/swarm/${encodeURIComponent(orgName)}/capabilities`,
    )

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || data?.message || 'Failed to fetch swarm capabilities')
    }

    return data as GalSwarmCapabilityCatalogResponse
  }

  async getSwarmDoctor(
    orgName: string,
    options: { targetWorkerCount?: number; runnerLabel?: string } = {},
  ): Promise<GalSwarmDoctorResponse> {
    const params = new URLSearchParams()
    if (typeof options.targetWorkerCount === 'number' && Number.isFinite(options.targetWorkerCount)) {
      params.set('targetWorkerCount', String(Math.max(1, Math.floor(options.targetWorkerCount))))
    }
    if (options.runnerLabel?.trim()) {
      params.set('runnerLabel', options.runnerLabel.trim())
    }

    const suffix = params.toString() ? `?${params.toString()}` : ''
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/swarm/${encodeURIComponent(orgName)}/doctor${suffix}`,
    )

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || data?.message || 'Failed to fetch swarm doctor report')
    }

    return data as GalSwarmDoctorResponse
  }

  async getAgentNetworkEvents(orgName: string, limit = 50): Promise<AgentNetworkEventsResponse> {
    const params = new URLSearchParams({ limit: String(limit) })
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/agent-network/${encodeURIComponent(orgName)}/events?${params}`,
    )
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || data?.message || 'Failed to fetch Agent Network events')
    }

    return data as AgentNetworkEventsResponse
  }

  async getAgentNetworkTaskEvents(orgName: string, taskId: string): Promise<AgentNetworkEventsResponse> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/agent-network/${encodeURIComponent(orgName)}/tasks/${encodeURIComponent(taskId)}/events`,
    )
    const data = await response.json()
    if (!response.ok) {
      throw new Error(data?.error || data?.message || 'Failed to fetch Agent Network task events')
    }

    return data as AgentNetworkEventsResponse
  }

  /**
   * Get queue status snapshot (pending, active, completed_today, failed_today counts).
   * Issue #1923: Queue tab in Sessions page.
   * Issue #2040: Added orphaned_claimed_count for mismatch detection.
   *
   * The API returns `consumer_healthy: boolean`. This method maps that to the
   * `health` field expected by the Sessions page:
   *   - consumer_healthy=true  + active>0 + no orphans → 'healthy'
   *   - consumer_healthy=true  + active=0              → 'idle'
   *   - consumer_healthy=false OR orphans>0            → 'degraded'
   */
  async getQueueStatus(orgName: string): Promise<{
    pending: number
    active: number
    completed_today: number
    failed_today: number
    consumer_healthy: boolean
    health: 'healthy' | 'degraded' | 'idle'
    orphaned_claimed_count?: number
  }> {
    const params = new URLSearchParams({ org: orgName })
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/queue/status?${params}`
    )
    if (!response.ok) {
      let details = ''
      try {
        const errorData = await response.json()
        details = errorData.error || errorData.message || ''
      } catch {
        // ignore non-JSON error bodies
      }
      throw new Error(details ? `Failed to fetch queue status: ${details}` : 'Failed to fetch queue status')
    }
    const raw = await response.json()
    const consumerHealthy: boolean = raw.consumer_healthy ?? true
    const active: number = raw.active ?? 0
    const orphanedCount: number = raw.orphaned_claimed_count ?? 0
    // #2040: Degrade health when orphaned claims exist
    const health: 'healthy' | 'degraded' | 'idle' = !consumerHealthy || orphanedCount > 0
      ? 'degraded'
      : active > 0
      ? 'healthy'
      : 'idle'
    return {
      pending: raw.pending ?? 0,
      active,
      completed_today: raw.completed_today ?? 0,
      failed_today: raw.failed_today ?? 0,
      consumer_healthy: consumerHealthy,
      health,
      orphaned_claimed_count: orphanedCount,
    }
  }

  // ============================================================================
  // Queue Intake (#1974): List milestones, issues, and enqueue selected issues
  // ============================================================================

  /**
   * List open milestones for a GitHub repository.
   */
  async getMilestones(
    org: string,
    owner: string,
    repo: string,
  ): Promise<Array<{ number: number; title: string; open_issues: number; state: string }>> {
    const params = new URLSearchParams({ org, owner, repo })
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/work-prioritizer/milestones?${params}`
    )
    if (!response.ok) {
      let details = ''
      try {
        const errorData = await response.json()
        details = errorData.error || errorData.message || ''
      } catch {
        // ignore
      }
      throw new Error(details || 'Failed to fetch milestones')
    }
    const data = await response.json()
    return data.milestones ?? []
  }

  /**
   * List open issues for a GitHub repository, optionally filtered by milestone.
   */
  async getIssues(
    org: string,
    owner: string,
    repo: string,
    milestone?: number,
  ): Promise<Array<{ number: number; title: string; labels: Array<{ name: string }>; assignees: Array<{ login: string }> }>> {
    const params = new URLSearchParams({ org, owner, repo })
    if (milestone !== undefined) {
      params.set('milestone', String(milestone))
    }
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/work-prioritizer/issues?${params}`
    )
    if (!response.ok) {
      let details = ''
      try {
        const errorData = await response.json()
        details = errorData.error || errorData.message || ''
      } catch {
        // ignore
      }
      throw new Error(details || 'Failed to fetch issues')
    }
    const data = await response.json()
    return data.issues ?? []
  }

  // ============================================================================
  // Queue Observability (#queue-observability): Pending items, consumer health, load metrics
  // ============================================================================

  /**
   * Get top 25 pending work items for observability.
   * Uses GET /api/work-items?org=...&status=pending&limit=25
   */
  async getPendingWorkItems(orgName: string): Promise<Array<{
    id: string
    priority: number
    source: { type: string; url?: string; issueNumber?: number; prNumber?: number; repository?: string }
    command: string
    createdAt: string
  }>> {
    const params = new URLSearchParams({ org: orgName, status: 'pending', limit: '25' })
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/work-items?${params}`
    )
    if (!response.ok) {
      let details = ''
      try {
        const errorData = await response.json()
        details = errorData.error || errorData.message || ''
      } catch {
        // ignore
      }
      throw new Error(details || 'Failed to fetch pending work items')
    }
    const data = await response.json()
    return data.workItems ?? []
  }

  /**
   * Get queue consumer health state from GET /api/queue-consumer/health.
   * Returns consumer metrics: running state, lease, heartbeats, dispatch info.
   */
  async getQueueConsumerHealth(): Promise<{
    status: string
    metrics: {
      isRunning: boolean
      hasLease: boolean
      paused: boolean
      lastHeartbeatAt: string | null
      lastDispatchAt: string | null
      dispatched: number
      dispatchFailures: number
      retries: number
      capacitySkips: number
    }
  }> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/queue-consumer/health`
    )
    if (!response.ok) {
      let details = ''
      try {
        const errorData = await response.json()
        details = errorData.error || errorData.message || ''
      } catch {
        // ignore
      }
      throw new Error(details || 'Failed to fetch consumer health')
    }
    return response.json()
  }

  /**
   * Get queue load / efficiency stats from GET /api/work-items/queue/stats.
   * Returns active/maxActive capacity, consumer paused flag, and dispatch metrics.
   */
  async getQueueStats(orgName: string): Promise<{
    pending: number
    active: number
    maxActive: number
    completed: number
    failed: number
    consumerPaused: boolean
    lastPollAt: string | null
  }> {
    const params = new URLSearchParams({ org: orgName })
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/work-items/queue/stats?${params}`
    )
    if (!response.ok) {
      let details = ''
      try {
        const errorData = await response.json()
        details = errorData.error || errorData.message || ''
      } catch {
        // ignore
      }
      throw new Error(details || 'Failed to fetch queue stats')
    }
    return response.json()
  }

  /**
   * Delete a pending work item from the queue (#2001).
   * DELETE /api/work-items/:id/pending
   */
  async deleteWorkItem(workItemId: string): Promise<{ success: boolean; removed: string }> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/work-items/${workItemId}/pending`,
      { method: 'DELETE' }
    )
    if (!response.ok) {
      let details = ''
      try {
        const errorData = await response.json()
        details = errorData.error || errorData.message || ''
      } catch {
        // ignore
      }
      throw new Error(details || 'Failed to delete work item')
    }
    return response.json()
  }

  /**
   * Reprioritize a pending work item (#2001).
   * PATCH /api/work-items/:id/priority
   */
  async reprioritizeWorkItem(workItemId: string, priority: number): Promise<{ success: boolean; workItem: Record<string, unknown> }> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/work-items/${workItemId}/priority`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priority })
      }
    )
    if (!response.ok) {
      let details = ''
      try {
        const errorData = await response.json()
        details = errorData.error || errorData.message || ''
      } catch {
        // ignore
      }
      throw new Error(details || 'Failed to reprioritize work item')
    }
    return response.json()
  }

  /**
   * Bulk delete pending work items (#2001).
   * POST /api/work-items/bulk/delete
   */
  async bulkDeleteWorkItems(ids: string[]): Promise<{ success: boolean; removed: number; total: number }> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/work-items/bulk/delete`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      }
    )
    if (!response.ok) {
      let details = ''
      try {
        const errorData = await response.json()
        details = errorData.error || errorData.message || ''
      } catch {
        // ignore
      }
      throw new Error(details || 'Failed to bulk delete work items')
    }
    return response.json()
  }

  /**
   * Bulk reprioritize pending work items (#2001).
   * POST /api/work-items/bulk/reprioritize
   */
  async bulkReprioritizeWorkItems(ids: string[], priority: number): Promise<{ success: boolean; reprioritized: number; total: number }> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/work-items/bulk/reprioritize`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, priority })
      }
    )
    if (!response.ok) {
      let details = ''
      try {
        const errorData = await response.json()
        details = errorData.error || errorData.message || ''
      } catch {
        // ignore
      }
      throw new Error(details || 'Failed to bulk reprioritize work items')
    }
    return response.json()
  }

  /**
   * Enqueue selected GitHub issues into the work queue.
   * Returns queued/skipped/failed counts.
   */
  async enqueueIssues(
    org: string,
    owner: string,
    repo: string,
    issueNumbers: number[],
  ): Promise<{ queued: number; skipped: number; failed: number; errors: string[] }> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/api/work-prioritizer/enqueue`,
      {
        method: 'POST',
        body: JSON.stringify({ org, owner, repo, issueNumbers }),
      }
    )
    if (!response.ok) {
      let details = ''
      try {
        const errorData = await response.json()
        details = errorData.error || errorData.message || ''
      } catch {
        // ignore
      }
      throw new Error(details || 'Failed to enqueue issues')
    }
    const data = await response.json()
    return data.result ?? { queued: 0, skipped: 0, failed: 0, errors: [] }
  }

  // ==========================================================================
  // Provider Usage Stats (Issue #2225)
  // ==========================================================================

  /**
   * Get per-developer provider usage aggregates for an organization.
   * Uses GET /api/usage/providers/developers
   */
  async getDeveloperProviderUsage(orgName: string): Promise<{
    developers: Array<{
      userId: string
      githubLogin: string
      organizationId: string
      providers: Array<{
        provider: string
        currentUsage: number
        limit: number | null
        usagePercent: number | null
        usageBySource?: Partial<Record<'background_agent' | 'local', number>>
        healthState: 'ok' | 'warning' | 'critical'
        lastUpdatedAt: string
      }>
      overallHealthState: 'ok' | 'warning' | 'critical'
      lastUpdatedAt: string
    }>
    totalDevelopers: number
    thresholds: { warningThreshold: number; criticalThreshold: number }
    lastUpdatedAt: string
  } | null> {
    try {
      const params = new URLSearchParams({ org: orgName })
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/api/usage/providers/developers?${params}`
      )
      if (!response.ok) return null
      return await response.json()
    } catch {
      return null
    }
  }

  /**
   * Get dispatch rules for an organization, including preferredCredentialOwners.
   * Uses GET /api/organizations/:orgName/dispatch-rules
   */
  async getDispatchRules(orgName: string): Promise<{
    enabledCredentialOwners?: string[]
    preferredCredentialOwners?: string[]
  } | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/api/organizations/${encodeURIComponent(orgName)}/dispatch-rules`
      )
      if (!response.ok) return null
      return await response.json()
    } catch {
      return null
    }
  }

  /**
   * Get drift status for all projects in an organization (#1066)
   */
  async getOrgDriftStatus(orgName: string): Promise<DriftStatusReport[]> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/drift-status`
      )
      if (!response.ok) return []
      const data = await response.json()
      return Array.isArray(data) ? data : data.reports ?? []
    } catch {
      return []
    }
  }

  // ==========================================================================
  // SDLC Compliance Monitoring (#541)
  // ==========================================================================

  /**
   * Get SDLC workflow drift detection data
   */
  async getSdlcDrift(orgName: string): Promise<SdlcDriftReport> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/compliance/sdlc-drift`
      )
      if (!response.ok) {
        return {
          orgName,
          driftDetected: false,
          driftItems: [],
          summary: {
            totalTransitions: 0,
            compliantTransitions: 0,
            driftedTransitions: 0,
            complianceRate: 1,
          },
        }
      }
      return await response.json()
    } catch {
      return {
        orgName,
        driftDetected: false,
        driftItems: [],
        summary: {
          totalTransitions: 0,
          compliantTransitions: 0,
          driftedTransitions: 0,
          complianceRate: 1,
        },
      }
    }
  }

  /**
   * Submit an SDLC phase transition report
   */
  async submitSdlcReport(
    orgName: string,
    report: {
      projectId: string
      issueNumber: number
      fromPhase: number | null
      toPhase: number
      actor: string
      metadata?: Record<string, unknown>
    },
  ): Promise<{ success: boolean; reportId?: string; skippedPhases?: number[]; isCompliant?: boolean }> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/compliance/sdlc-report`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(report),
        },
      )
      if (!response.ok) return { success: false }
      return await response.json()
    } catch {
      return { success: false }
    }
  }

  // ==========================================================================
  // Project Overrides (#389)
  // ==========================================================================

  async getProjectOverrides(orgName: string, status?: ProjectOverride['status']): Promise<ProjectOverride[]> {
    try {
      const params = status ? `?status=${encodeURIComponent(status)}` : ''
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/enforcement/overrides${params}`
      )
      if (!response.ok) return []
      const data = await response.json()
      return data.overrides ?? []
    } catch {
      return []
    }
  }

  async createProjectOverride(
    orgName: string,
    override: {
      projectName: string
      policyType: ProjectOverride['policyType']
      definition: Record<string, unknown>
    }
  ): Promise<ProjectOverride | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/enforcement/overrides`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(override),
        }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create override')
      }
      return response.json()
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to create override')
    }
  }

  async deleteProjectOverride(orgName: string, overrideId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/enforcement/overrides/${encodeURIComponent(overrideId)}`,
        { method: 'DELETE' }
      )
      return response.ok
    } catch {
      return false
    }
  }

  async reviewProjectOverride(
    orgName: string,
    overrideId: string,
    action: 'approve' | 'reject',
    reason?: string
  ): Promise<ProjectOverride | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/enforcement/overrides/${encodeURIComponent(overrideId)}/review`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, reason }),
        }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to review override')
      }
      return response.json()
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to review override')
    }
  }

  // ==========================================================================
  // Domain Compliance (#2523)
  // ==========================================================================

  async getDomainAccessStats(orgName: string, days = 30, repo?: string): Promise<DomainStatsResponse> {
    try {
      const params = new URLSearchParams({ days: String(days) })
      if (repo) params.set('repo', repo)
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/domain-access/stats?${params}`
      )
      if (!response.ok) return { stats: [], period: { days }, repo: null }
      return response.json()
    } catch {
      return { stats: [], period: { days }, repo: null }
    }
  }

  async getDomainAccessAlerts(orgName: string): Promise<DomainAlertsResponse> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/domain-access/alerts`
      )
      if (!response.ok) return { alerts: [], threshold: 3 }
      return response.json()
    } catch {
      return { alerts: [], threshold: 3 }
    }
  }

  async getDomainAccessAnomalies(orgName: string, threshold = 10): Promise<DomainAnomaliesResponse> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/domain-access/anomalies?threshold=${threshold}`
      )
      if (!response.ok) return { anomalies: [], threshold }
      return response.json()
    } catch {
      return { anomalies: [], threshold }
    }
  }

  async getDomainRepoBreakdown(orgName: string, days = 30): Promise<DomainRepoBreakdownResponse> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/domain-access/repo-breakdown?days=${days}`
      )
      if (!response.ok) return { repos: [], period: { days } }
      return response.json()
    } catch {
      return { repos: [], period: { days } }
    }
  }

  async getDomainExceptions(orgName: string): Promise<DomainExceptionsResponse> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/domain-exceptions`
      )
      if (!response.ok) return { exceptions: [] }
      return response.json()
    } catch {
      return { exceptions: [] }
    }
  }

  async createDomainException(
    orgName: string,
    data: { domain: string; justification: string; repoName?: string }
  ): Promise<DomainExceptionItem | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/domain-exceptions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create exception')
      }
      return response.json()
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to create exception')
    }
  }

  async updateDomainException(
    orgName: string,
    exceptionId: string,
    data: { expiresAt?: string; justification?: string }
  ): Promise<DomainExceptionItem | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/domain-exceptions/${encodeURIComponent(exceptionId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      )
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  async deleteDomainException(orgName: string, exceptionId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/domain-exceptions/${encodeURIComponent(exceptionId)}`,
        { method: 'DELETE' }
      )
      return response.ok
    } catch {
      return false
    }
  }

  // ==========================================================================
  // Agent Security Policies (#2514)
  // ==========================================================================

  async getAgentSecurityPolicies(orgName: string): Promise<AgentSecurityPolicyItem[]> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/agent-security-policies`
      )
      if (!response.ok) return []
      const data = await response.json()
      return data.policies ?? []
    } catch {
      return []
    }
  }

  async createAgentSecurityPolicy(orgName: string, policy: Omit<AgentSecurityPolicyItem, 'id' | 'orgName' | 'createdBy' | 'createdAt' | 'updatedAt'>): Promise<AgentSecurityPolicyItem | null> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/agent-security-policies`,
      { method: 'POST', body: JSON.stringify(policy) }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to create policy')
    }
    const data = await response.json()
    return data.policy
  }

  async updateAgentSecurityPolicy(orgName: string, id: string, policy: Omit<AgentSecurityPolicyItem, 'id' | 'orgName' | 'createdBy' | 'createdAt' | 'updatedAt'>): Promise<AgentSecurityPolicyItem | null> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/agent-security-policies/${encodeURIComponent(id)}`,
      { method: 'PUT', body: JSON.stringify(policy) }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to update policy')
    }
    const data = await response.json()
    return data.policy
  }

  async deleteAgentSecurityPolicy(orgName: string, id: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/agent-security-policies/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      )
      return response.ok
    } catch {
      return false
    }
  }

  // ==========================================================================
  // Tool Compliance (#2519)
  // ==========================================================================

  async getToolComplianceStatus(orgName: string): Promise<ToolComplianceStatusResponse> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/compliance/tools/status`
      )
      if (!response.ok) return { repos: [], summary: { total: 0, compliant: 0, missingFile: 0, missingDenyRules: 0, hasExceptions: 0, drifted: 0 } }
      return response.json()
    } catch {
      return { repos: [], summary: { total: 0, compliant: 0, missingFile: 0, missingDenyRules: 0, hasExceptions: 0, drifted: 0 } }
    }
  }

  async getToolComplianceDrift(orgName: string): Promise<ToolComplianceDriftResponse> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/compliance/tools/drift`
      )
      if (!response.ok) return { driftedRepos: [], total: 0 }
      return response.json()
    } catch {
      return { driftedRepos: [], total: 0 }
    }
  }

  async getToolExceptions(orgName: string): Promise<ToolExceptionsResponse> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/compliance/tools/exceptions`
      )
      if (!response.ok) return { exceptions: [], total: 0 }
      return response.json()
    } catch {
      return { exceptions: [], total: 0 }
    }
  }

  async createToolException(
    orgName: string,
    exception: { repo: string; rule: string; justification: string }
  ): Promise<ToolException | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/compliance/tools/exceptions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(exception),
        }
      )
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create exception')
      }
      const data = await response.json()
      return data.exception ?? null
    } catch (error) {
      throw error instanceof Error ? error : new Error('Failed to create exception')
    }
  }

  async getToolImpactPreview(
    orgName: string,
    denyBaseline: string[]
  ): Promise<ToolImpactPreviewResponse> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/compliance/tools/impact-preview`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ denyBaseline }),
        }
      )
      if (!response.ok) return { affectedRepos: [], total: 0, baseline: denyBaseline }
      return response.json()
    } catch {
      return { affectedRepos: [], total: 0, baseline: denyBaseline }
    }
  }

  // ==========================================================================
  // Compliance Status
  // ==========================================================================

  async getComplianceStatus(orgName: string): Promise<ComplianceStatusResponse | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/compliance/status`
      )
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  // ==========================================================================
  // Audit Logs (#2526)
  // ==========================================================================

  async getAuditLogs(orgName: string, params?: {
    sessionType?: string
    severity?: string
    action?: string
    startDate?: string
    endDate?: string
    limit?: number
    offset?: number
  }): Promise<AuditLogsResponse> {
    const searchParams = new URLSearchParams()
    if (params?.sessionType) searchParams.set('sessionType', params.sessionType)
    if (params?.severity) searchParams.set('severity', params.severity)
    if (params?.action) searchParams.set('action', params.action)
    if (params?.startDate) searchParams.set('startDate', params.startDate)
    if (params?.endDate) searchParams.set('endDate', params.endDate)
    if (params?.limit) searchParams.set('limit', String(params.limit))
    if (params?.offset) searchParams.set('offset', String(params.offset))

    const qs = searchParams.toString()
    const url = `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/audit/logs${qs ? `?${qs}` : ''}`
    const response = await this.fetchWithAuth(url)
    if (!response.ok) throw new Error(`Failed to fetch audit logs: ${response.status}`)
    return response.json()
  }

  async getAuditSummary(orgName: string, params?: {
    startDate?: string
    endDate?: string
  }): Promise<AuditSummaryResponse> {
    const searchParams = new URLSearchParams()
    if (params?.startDate) searchParams.set('startDate', params.startDate)
    if (params?.endDate) searchParams.set('endDate', params.endDate)

    const qs = searchParams.toString()
    const url = `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/audit/summary${qs ? `?${qs}` : ''}`
    const response = await this.fetchWithAuth(url)
    if (!response.ok) throw new Error(`Failed to fetch audit summary: ${response.status}`)
    return response.json()
  }

  async getAuditAlerts(orgName: string, params?: {
    status?: string
    limit?: number
  }): Promise<AuditAlertsResponse> {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.set('status', params.status)
    if (params?.limit) searchParams.set('limit', String(params.limit))

    const qs = searchParams.toString()
    const url = `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/audit/alerts${qs ? `?${qs}` : ''}`
    const response = await this.fetchWithAuth(url)
    if (!response.ok) throw new Error(`Failed to fetch audit alerts: ${response.status}`)
    return response.json()
  }

  async updateAuditAlert(orgName: string, alertId: string, status: 'acknowledged' | 'resolved'): Promise<{ id: string; status: string }> {
    const url = `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/audit/alerts/${encodeURIComponent(alertId)}`
    const response = await this.fetchWithAuth(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!response.ok) throw new Error(`Failed to update alert: ${response.status}`)
    return response.json()
  }

  // ==========================================================================
  // Enforcement Hooks (#181)
  // ==========================================================================

  async getEnforcementHooks(orgName: string): Promise<EnforcementHookItem[]> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/enforcement/hooks`
      )
      if (!response.ok) return []
      const data = await response.json()
      return data.hooks ?? []
    } catch {
      return []
    }
  }

  async createEnforcementHook(orgName: string, hook: { name: string; type: string; policy: string; enabled?: boolean }): Promise<EnforcementHookItem | null> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/enforcement/hooks`,
      { method: 'POST', body: JSON.stringify(hook) }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to create hook')
    }
    const data = await response.json()
    return data.hook
  }

  async updateEnforcementHook(orgName: string, hookId: string, hook: { name: string; type: string; policy: string; enabled?: boolean }): Promise<EnforcementHookItem | null> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/enforcement/hooks/${encodeURIComponent(hookId)}`,
      { method: 'PUT', body: JSON.stringify(hook) }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to update hook')
    }
    const data = await response.json()
    return data.hook
  }

  async deleteEnforcementHook(orgName: string, hookId: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/enforcement/hooks/${encodeURIComponent(hookId)}`,
        { method: 'DELETE' }
      )
      return response.ok
    } catch {
      return false
    }
  }

  // ==========================================================================
  // SDLC (#529, #541)
  // ==========================================================================

  async getSdlcStates(orgName: string): Promise<SdlcStateItem[]> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/sdlc/states`
      )
      if (!response.ok) return []
      const data = await response.json()
      return data.states ?? []
    } catch {
      return []
    }
  }

  async getSdlcGates(orgName: string): Promise<SdlcGateConfig | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/sdlc/gates`
      )
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  async getSdlcEnforcementConfig(orgName: string): Promise<SdlcEnforcementConfigResponse | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/enforcement/sdlc`
      )
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  async updateSdlcEnforcementConfig(
    orgName: string,
    update: {
      enabled?: boolean
      level?: 'off' | 'warn' | 'block'
      reason?: string
    },
  ): Promise<SdlcEnforcementConfigResponse> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/enforcement/sdlc`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      }
    )
    if (!response.ok) {
      const body = await response.json().catch(() => ({}))
      throw new Error((body as Record<string, string>).error || `HTTP ${response.status}`)
    }
    return response.json()
  }

  async getSdlcComplianceStatus(orgName: string): Promise<SdlcComplianceStatusResponse | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/compliance/sdlc-status`
      )
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  // ==========================================================================
  // Security Standards (#184)
  // ==========================================================================

  async getSecurityStandards(orgName: string): Promise<SecurityStandardItem[]> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/security-standards`
      )
      if (!response.ok) return []
      const data = await response.json()
      return data.standards ?? []
    } catch {
      return []
    }
  }

  async createSecurityStandard(orgName: string, standard: { name: string; description: string; rules: SecurityRuleItem[]; severity: string }): Promise<SecurityStandardItem | null> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/security-standards`,
      { method: 'POST', body: JSON.stringify(standard) }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to create standard')
    }
    return response.json()
  }

  async deleteSecurityStandard(orgName: string, id: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/security-standards/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      )
      return response.ok
    } catch {
      return false
    }
  }

  // ==========================================================================
  // Tool Policies (#822)
  // ==========================================================================

  async getToolPolicies(orgName: string): Promise<ToolPolicyItem[]> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/tool-policies`
      )
      if (!response.ok) return []
      const data = await response.json()
      return data.policies ?? []
    } catch {
      return []
    }
  }

  async createToolPolicy(orgName: string, policy: { name: string; description: string; rules: ToolPolicyRuleItem[]; enabled?: boolean }): Promise<ToolPolicyItem | null> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/tool-policies`,
      { method: 'POST', body: JSON.stringify(policy) }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to create policy')
    }
    const data = await response.json()
    return data.policy
  }

  async deleteToolPolicy(orgName: string, id: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/tool-policies/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      )
      return response.ok
    } catch {
      return false
    }
  }

  // ==========================================================================
  // System Enforcement (#183)
  // ==========================================================================

  async getSystemPolicies(orgName: string): Promise<SystemPolicyItem[]> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/system-policies`
      )
      if (!response.ok) return []
      const data = await response.json()
      return data.policies ?? []
    } catch {
      return []
    }
  }

  async createSystemPolicy(orgName: string, policy: { name: string; scope: string; enforcementLevel: string; rules: SystemPolicyRuleItem[]; enabled?: boolean }): Promise<SystemPolicyItem | null> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/system-policies`,
      { method: 'POST', body: JSON.stringify(policy) }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err.error || 'Failed to create policy')
    }
    const data = await response.json()
    return data.policy
  }

  async deleteSystemPolicy(orgName: string, id: string): Promise<boolean> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/system-policies/${encodeURIComponent(id)}`,
        { method: 'DELETE' }
      )
      return response.ok
    } catch {
      return false
    }
  }

  async getEnforcementEvents(orgName: string, params?: { limit?: number; since?: string }): Promise<EnforcementEventsResponse> {
    try {
      const query = new URLSearchParams()
      if (params?.limit) query.set('limit', String(params.limit))
      if (params?.since) query.set('since', params.since)
      const qs = query.toString()
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/enforcement-events${qs ? `?${qs}` : ''}`
      )
      if (!response.ok) return { events: [], total: 0, limit: 50 }
      return response.json()
    } catch {
      return { events: [], total: 0, limit: 50 }
    }
  }

  async getFleetList(
    orgName: string,
    status: 'compliant' | 'non-compliant' | 'all' = 'all',
  ): Promise<FleetListResponse | null> {
    try {
      const query = new URLSearchParams()
      if (status !== 'all') query.set('status', status)
      const qs = query.toString()
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/fleet${qs ? `?${qs}` : ''}`,
      )
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  async getFleetReport(orgName: string): Promise<FleetReportResponse | null> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/fleet/report`,
      )
      if (!response.ok) return null
      return response.json()
    } catch {
      return null
    }
  }

  /**
   * POST /api/user/accept-terms
   * Record that the current user has accepted the Terms of Service and Privacy Policy.
   *
   * #3065: Explicit legal acceptance UX
   */
  async acceptTerms(termsVersion?: string): Promise<{ termsAcceptedAt: string; termsVersion: string }> {
    const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/user/accept-terms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ termsVersion: termsVersion ?? '1.0' }),
    })
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Failed to accept terms' }))
      throw new Error((err as { error?: string }).error ?? 'Failed to accept terms')
    }
    return response.json()
  }

  // ==========================================================================
  // Auto-Approval Settings (#3296)
  // ==========================================================================

  /**
   * GET /organizations/:orgName/auto-approval/settings
   * Fetch the auto-approval configuration for an organization.
   */
  async getAutoApprovalSettings(orgName: string): Promise<AutoApprovalSettings> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/auto-approval/settings`
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error || 'Failed to fetch auto-approval settings')
    }
    return response.json()
  }

  /**
   * PUT /organizations/:orgName/auto-approval/settings
   * Update auto-approval configuration for an organization.
   */
  async updateAutoApprovalSettings(
    orgName: string,
    settings: Partial<AutoApprovalSettings>
  ): Promise<AutoApprovalSettings> {
    const response = await this.fetchWithAuth(
      `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/auto-approval/settings`,
      {
        method: 'PUT',
        body: JSON.stringify(settings),
      }
    )
    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error((err as { error?: string }).error || 'Failed to update auto-approval settings')
    }
    return response.json()
  }

  /**
   * GET /organizations/:orgName/auto-approval/decisions
   * Fetch recent AI auto-approval decisions for an organization.
   */
  async getAutoApprovalDecisions(orgName: string): Promise<AutoApprovalDecision[]> {
    try {
      const response = await this.fetchWithAuth(
        `${this.apiBaseUrl}/organizations/${encodeURIComponent(orgName)}/auto-approval/decisions`
      )
      if (!response.ok) return []
      const data = await response.json()
      return data.decisions ?? data ?? []
    } catch {
      return []
    }
  }

  // ========================================================================
  // GAL: Browser Profiles (#4359)
  // ========================================================================

  async getBrowserProfiles(): Promise<{ profiles: BrowserProfile[] }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/browser-profiles`)
      if (!response.ok) throw new Error('Failed to fetch browser profiles')
      const data = await response.json()
      return { profiles: data.profiles || [] }
    } catch (err) {
      if (err instanceof Error) throw err
      throw new Error('Failed to fetch browser profiles')
    }
  }

  async createBrowserProfile(data: { name: string; domains: string[]; storageState: string }): Promise<{ id: string; name: string }> {
    const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/browser-profiles`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || 'Failed to create browser profile')
    }
    return response.json()
  }

  async deleteBrowserProfile(profileId: string): Promise<{ success: boolean }> {
    const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/browser-profiles/${encodeURIComponent(profileId)}`, {
      method: 'DELETE',
    })
    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error || 'Failed to delete browser profile')
    }
    return response.json()
  }

  /**
   * Get the stored Chrome extension version for the current user (Issue #4463)
   * Returns null if the extension has never reported its version.
   */
  async getExtensionVersion(): Promise<{ version: string | null }> {
    try {
      const response = await this.fetchWithAuth(`${this.apiBaseUrl}/api/extension/version`)
      if (!response.ok) return { version: null }
      return response.json()
    } catch {
      return { version: null }
    }
  }
}

// ============================================================================
// Audit Log Types (#2526)
// ============================================================================

export interface AuditLogEntryResponse {
  id: string
  orgName: string
  userId: string
  userName: string
  sessionType: 'background-agent' | 'cli' | 'vscode' | 'dashboard'
  action: 'tool_call' | 'file_edit' | 'bash_command' | 'config_change' | 'policy_violation'
  details: Record<string, unknown>
  severity: 'info' | 'warning' | 'critical'
  timestamp: string
  projectId?: string
  sessionId?: string
}

export interface AuditLogsResponse {
  entries: AuditLogEntryResponse[]
  total: number
  limit: number
  offset: number
}

export interface AuditSummaryResponse {
  totalEntries: number
  byAction: Record<string, number>
  byUser: Record<string, number>
  bySessionType: Record<string, number>
  bySeverity: Record<string, number>
  period: { start: string; end: string }
}

export interface AuditAlertResponse {
  id: string
  auditLogId: string
  orgName: string
  userId: string
  userName: string
  sessionType: string
  action: string
  severity: string
  details: Record<string, unknown>
  timestamp: string
  projectId?: string
  sessionId?: string
  status: 'open' | 'acknowledged' | 'resolved'
  createdAt: string
}

export interface AuditAlertsResponse {
  alerts: AuditAlertResponse[]
  total: number
}

// ============================================================================
// Project Override Types (#389)
// ============================================================================

export interface ProjectOverride {
  id: string
  projectName: string
  policyType: 'tool-allowlist' | 'domain-allowlist' | 'model-allowlist' | 'custom'
  definition: Record<string, unknown>
  status: 'pending' | 'approved' | 'rejected'
  rejectionReason?: string
  reviewedAt?: string
  reviewedBy?: string
  createdAt: string
  createdBy: string
  updatedAt: string
}

// ============================================================================
// Enforcement Types
// ============================================================================

export interface AgentSecurityPolicyItem {
  id: string
  orgName: string
  name: string
  description: string
  allowedTools: string[]
  blockedTools: string[]
  allowedFilePatterns: string[]
  blockedFilePatterns: string[]
  networkRestrictions: { allowedDomains: string[]; blockedDomains: string[] }
  enabled: boolean
  priority: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ComplianceStatusResponse {
  repos: Array<{
    name: string
    hasSettingsFile: boolean
    missingDenyRules: string[]
    status: 'compliant' | 'non-compliant' | 'missing-file'
  }>
  summary: { total: number; compliant: number; nonCompliant: number; missingFile: number }
}

export interface AuditLogEntryItem {
  id: string
  orgName: string
  userId: string
  userName: string
  sessionType: string
  action: string
  details: Record<string, unknown>
  severity: string
  timestamp: string
  projectId?: string
  sessionId?: string
}

export interface DomainAccessStatsItem {
  domain: string
  totalRequests: number
  blockedRequests: number
  lastAccessed: string
}

export interface DomainStatsResponse {
  stats: DomainAccessStatsItem[]
  period: { days: number }
  repo: string | null
}

export interface DomainExceptionItem {
  id: string
  domain: string
  orgName: string
  repoName?: string
  approvedBy: string
  approvedAt: string
  justification: string
  expiresAt: string
  expired?: boolean
}

export interface EnforcementHookItem {
  id: string
  name: string
  type: 'pre-commit' | 'pre-push' | 'ci-check'
  policy: string
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface SdlcStateItem {
  issueId: string
  orgName: string
  currentPhase: string
  transitions: Array<{
    id: string
    from: string | null
    to: string
    timestamp: string
    actor: string
    metadata?: Record<string, unknown>
  }>
  createdAt: string
  updatedAt: string
}

export interface SdlcGateConfig {
  gates: Array<{
    from: string
    to: string
    conditions: Array<{ type: string; description: string }>
  }>
  updatedAt: string
  updatedBy: string
}

export interface SdlcEnforcementConfigResponse {
  orgName: string
  config: {
    enabled: boolean
    level: 'off' | 'warn' | 'block'
    updatedAt: string
    updatedBy: string
    reason?: string
  }
}

export interface SdlcComplianceStatusResponse {
  orgName: string
  totalProjects: number
  compliantProjects: number
  driftedProjects: number
  projects: Array<{
    projectId: string
    currentPhase: number
    lastTransition: string
    skippedPhases: number[]
    isCompliant: boolean
  }>
}

export interface SecurityRuleItem {
  type: string
  target: string
  description: string
  value?: string
}

export interface SecurityStandardItem {
  id: string
  name: string
  description: string
  rules: SecurityRuleItem[]
  severity: string
  orgName: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ToolPolicyRuleItem {
  tool: string
  action: 'allow' | 'deny' | 'audit'
  conditions?: { pathPattern?: string; commandPattern?: string }
}

export interface ToolPolicyItem {
  id: string
  orgName: string
  name: string
  description: string
  rules: ToolPolicyRuleItem[]
  createdBy: string
  createdAt: string
  updatedAt: string
  enabled: boolean
}

export interface SystemPolicyRuleItem {
  type: string
  pattern: string
  action: 'block' | 'allow'
  message?: string
}

export interface SystemPolicyItem {
  id: string
  orgName: string
  name: string
  scope: 'organization' | 'repository' | 'user'
  enforcementLevel: 'block' | 'warn' | 'audit'
  rules: SystemPolicyRuleItem[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface EnforcementEventItem {
  id: string
  orgName: string
  sessionId: string
  userId: string
  tool: string
  input: Record<string, unknown>
  decision: {
    allowed: boolean
    enforcementLevel: string
    matchedPolicies: Array<{ policyId: string; policyName: string; ruleIndex: number; message?: string }>
    timestamp: string
  }
  timestamp: string
}

export interface EnforcementEventsResponse {
  events: EnforcementEventItem[]
  total: number
  limit: number
}

// ============================================================================
// Drift Status Types (#1066)
// ============================================================================

export interface DriftedFile {
  path: string
  type: string
  changeType: string
}

export interface DriftStatusReport {
  projectId: string
  status: 'in-sync' | 'drifted' | 'unknown'
  driftedFiles: DriftedFile[]
  lastChecked: string
  updatedAt: string
}

// ============================================================================
// Claude Code Credentials Types
// ============================================================================

export interface ClaudeCredentialsStatus {
  exists: boolean
  refreshTokenPrefix?: string
  updatedAt?: string
}

// ============================================================================
// Credential Validation & Dispatch Readiness Types (Issue #2574)
// ============================================================================

export interface CredentialValidationResult {
  valid: boolean
  status: 'active' | 'expired' | 'not_configured' | 'error'
  error?: string
  method?: 'oauth' | 'api_key' | 'unknown'
  expiresAt?: string
  suggestion?: string
}

export interface DispatchReadinessResult {
  provider: import('@gal/types').CredentialProvider
  ready: boolean
  credentialStatus: import('@gal/types').CredentialStatus
  validationResult: CredentialValidationResult
}

// ============================================================================
// GAL-272: Team Access Management Types
// ============================================================================

export type GalRole = 'owner' | 'admin' | 'developer'

export interface TeamMember {
  userId: string
  githubLogin: string
  githubId: number
  name: string | null
  email: string | null
  avatarUrl: string
  githubOrgRole: 'admin' | 'member'
  galRole: GalRole
  roleAssignedBy?: string | null
  roleAssignedAt?: Date | null
  approvalStatus?: 'approved' | 'pending'
  lastActiveAt?: Date
  createdAt?: Date
  updatedAt?: Date
}

export interface TeamMemberSummary {
  organization: string
  totalMembers: number
  owners: number
  admins: number
  developers: number
  members: TeamMember[]
}

export interface TeamMembersLiveResponse {
  members: TeamMember[]
  pendingMembers?: TeamMember[]
  totalPending?: number
  totalMembers: number
  lastSyncedAt: string
  syncedBy: string
  cacheStatus: 'fresh' | 'stale'
  owners: number
  admins: number
  developers: number
  /** Set when the GitHub App lacks org member list permission (#5646) */
  limitedAccess?: boolean
  limitedAccessReason?: string
}

export interface RoleChangeResponse {
  success: boolean
  member: TeamMember
  previousRole: GalRole
  newRole: GalRole
  changedBy: string
  changedAt: Date
}

// ============================================================================
// TAL/SAL/GAL Feature Types
// ============================================================================

// TAL: Workflow
export interface WorkflowEvent {
  id: string
  type: 'pr_opened' | 'config_changed' | 'security_alert' | 'quality_gate' | 'scheduled' | 'manual'
  source: string
  timestamp: Date
  status: 'pending' | 'processing' | 'completed' | 'failed'
  metadata: Record<string, unknown>
  orgName: string
}

export interface WorkflowRule {
  id: string
  name: string
  trigger: string
  action: string
  enabled: boolean
  lastTriggered?: Date
  triggerCount: number
  orgName: string
}

// TAL: Quality
export interface QualityMetrics {
  id: string
  orgName: string
  repoName?: string
  complexity: number
  duplication: number
  coverage: number
  debt: number
  violations: { rule: string; count: number; severity: 'error' | 'warning' | 'info' }[]
  gates: { name: string; passed: boolean; score: number; threshold: number }[]
  lastScanned: Date
}

// TAL: Tests
export interface TestRun {
  id: string
  orgName: string
  repoName?: string
  suites: {
    name: string
    tests: { name: string; status: 'passed' | 'failed' | 'skipped'; duration: number; error?: string }[]
    coverage: number
  }[]
  totalTests: number
  passedTests: number
  failedTests: number
  avgCoverage: number
  duration: number
  startedAt: Date
  completedAt?: Date
  status: 'running' | 'completed' | 'failed'
}

// TAL: Time Tracking
export interface TimeSession {
  id: string
  orgName: string
  userId: string
  ticketKey: string
  ticketSummary: string
  startTime: Date
  endTime?: Date
  duration: number
  status: 'active' | 'paused' | 'completed'
  logged: boolean
}

// SAL: Sandboxes (Claude Code only)
export interface Sandbox {
  id: string
  name: string
  orgName: string
  status: 'running' | 'stopped' | 'creating' | 'error'
  type: 'ephemeral' | 'persistent'
  platform: 'claude'
  createdAt: Date
  lastActivity?: Date
  resources: { cpu: string; memory: string; storage: string }
  config: Record<string, unknown>
}

// SAL: Maintenance
export interface MaintenanceTask {
  id: string
  name: string
  orgName: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  lastRun?: Date
  schedule?: string
  type: 'dependency_audit' | 'security_scan' | 'code_quality' | 'license_compliance' | 'doc_sync'
}

export interface Dependency {
  id: string
  orgName: string
  repoName: string
  name: string
  current: string
  latest: string
  type: 'major' | 'minor' | 'patch'
  security: boolean
}

// GAL: Templates
export interface Template {
  id: string
  name: string
  description: string
  category: 'security' | 'compliance' | 'workflow' | 'quality'
  platform: string[]
  content: string
  popularity: number
  installed: boolean
  createdAt: Date
  updatedAt: Date
}

export interface OrgTemplate {
  id: string
  orgName: string
  templateId: string
  installedAt: Date
  customizations?: Record<string, unknown>
}

// Docs Generator
export interface DocTemplate {
  id: string
  name: string
  description: string
  format: string
  popular: boolean
}

// GAL: Security/Protection
export interface SecurityRule {
  id: string
  orgName: string
  name: string
  type: 'secret' | 'command' | 'path' | 'network'
  pattern: string
  enabled: boolean
  triggered: number
  lastTriggered?: Date
}

export interface SecurityEvent {
  id: string
  orgName: string
  ruleId: string
  rule: string
  type: 'blocked' | 'warning' | 'audit'
  message: string
  timestamp: Date
  metadata?: Record<string, unknown>
}

// GAL: Universal Agent Detection
export interface AgentDetection {
  id: string
  orgName: string
  platform: string
  name: string
  icon: string
  status: 'detected' | 'installed' | 'available'
  version?: string
  configs: number
  lastDetected: Date
}

// GAL: Browser Profiles (#4359)
export interface BrowserProfile {
  id: string
  name: string
  domains: string[]
  cookieCount: number
  earliestExpiry: number | string | null
  status: 'active' | 'expired'
  createdAt: string
  updatedAt: string
}

// GAL: Docs Generator
export interface GeneratedDoc {
  id: string
  orgName: string
  name: string
  path: string
  type: 'markdown' | 'html' | 'pdf'
  generated: Date
  size: string
  status: 'current' | 'outdated' | 'generating'
  content?: string
}

// Platform Stats
export interface OrgPlatformStats {
  totalWorkflowEvents: number
  activeTests: number
  activeSandboxes: number
  securityAlerts: number
}

// Billing Types
export interface BillingStatus {
  planTier: 'free' | 'convenience' | 'enforcement' | 'enterprise'
  // #4028: audienceTier is surfaced so internal/partner orgs can suppress upgrade UI
  audienceTier?: 'internal' | 'partners' | 'public' | string
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete' | 'none'
  currentPeriodEnd?: string
  cancelAtPeriodEnd?: boolean
  seatLimit: number
  seatsUsed: number
  coupon?: { percentOff?: number; amountOff?: number; name?: string }
  // #4219: Payment failure tracking for grace period enforcement
  lastPaymentFailedAt?: string | null
}

export interface CheckoutResult {
  url: string
  sessionId: string
}

export interface PortalResult {
  url: string
}

export interface CouponValidationResult {
  valid: boolean
  code: string
  percentOff?: number | null
  amountOff?: number | null
  name?: string | null
  duration?: 'forever' | 'once' | 'repeating' | null
  error?: string
}

// GAL-569: Connected Providers
export interface ConnectedProvider {
  type: 'github' | 'google' | 'email'
  identifier: string // GitHub login, email address, etc.
  connectedAt: string
  githubId?: number
  avatarUrl?: string
}

// GAL-53: LLM Analysis Types
export interface LLMAnalysisReport {
  repositoryName: string
  platform: AgentPlatform
  analysisDate: Date
  overallScore: number
  qualityScores: QualityScore[]
  bestPractices: BestPractice[]
  securityInsights: SecurityInsightItem[]
}

export interface QualityScore {
  score: number
  category: string
  reasons: string[]
  suggestions: string[]
  completeness: {
    hasDocumentation: boolean
    hasErrorHandling: boolean
    hasTestCoverage: boolean
    hasSecurityChecks: boolean
    completenessPercentage: number
  }
}

export interface BestPractice {
  title: string
  description: string
  impact: 'low' | 'medium' | 'high' | 'critical'
  complexity: 'simple' | 'moderate' | 'complex'
  estimatedBenefit: string
  examples: string[]
}

export interface SecurityInsightItem {
  category: string
  finding: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  riskDescription: string
  mitigation: string
  evidenceLocations: string[]
}

export interface ConfigComparisonResult {
  fileName: string
  platform: AgentPlatform
  comparedAt: Date
  versions: {
    repoName: string
    version: number
    score: number
    strengths: string[]
    weaknesses: string[]
  }[]
  recommendation: {
    bestVersion: number
    bestRepo: string
    reason: string
    confidence: number
  }
  synthesizedBestPractices: string[]
}

// GAL-54: Workflow Testing Types
export interface WorkflowTestRequest {
  fileName: string
  type: 'command' | 'hook'
  platform: AgentPlatform
  content: string
  testCases?: string[]
  maxIterations?: number
}

export interface WorkflowTestResult {
  success: boolean
  fileName: string
  type: 'command' | 'hook'
  platform: AgentPlatform
  iterations: WorkflowIteration[]
  finalScore: number
  recommendation: 'approve' | 'revise' | 'reject'
  executionTimeMs: number
  testedAt: Date
  error?: string
}

export interface WorkflowIteration {
  iteration: number
  content: string
  executionResult: {
    success: boolean
    output: string
    error?: string
    executionTimeMs: number
    logs: string[]
  }
  evaluation: {
    score: number
    recommendation: 'approve' | 'revise' | 'reject'
    reasoning: string
    issues: { type: string; message: string; severity: string }[]
    suggestedImprovements: string[]
  }
  timestamp: Date
}

export interface WorkflowTestReport {
  orgName: string
  generatedAt: Date
  totalTests: number
  passedTests: number
  averageScore: number
  results: WorkflowTestResult[]
  summary: {
    byRecommendation: {
      approve: number
      revise: number
      reject: number
    }
    totalIterations: number
    averageIterationsPerTest: number
  }
}

// ============================================================================
// Approved Config Types
// ============================================================================

export interface ApprovedConfig {
  platform: AgentPlatform
  hash: string
  version: string
  configContent?: string | null
  approvedAt: string
  approvedBy: string
}

export interface ApprovedConfigResponse {
  approved: boolean
  hash?: string
  version?: string
  platform?: AgentPlatform
  policyName?: string  // Custom policy name (e.g., "production-safe")
  configContent?: string
  approvedAt?: string
  approvedBy?: string
  updatedAt?: string  // ISO timestamp of last update
  message?: string
  enforcementSettings?: Partial<EnforcementSettings> | null
  // Parsed bundle fields
  instructions?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
  commands?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
  hooks?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
  settings?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
  subagents?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
  skills?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string; description?: string }>
  mcp?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
  mcpServers?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
  // Multi-platform config fields (Cursor)
  rules?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
  cursorRules?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
  // Copilot-specific fields (GAL-395)
  copilotInstructions?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
  copilotPathInstructions?: Array<{ name: string; content: string; applyTo: string; excludeAgent?: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
  copilotAgents?: Array<{ name: string; description: string; content: string; tools?: string[] | '*'; target?: 'vscode' | 'github-copilot'; infer?: boolean; sourceRepo?: string; sourcePath?: string; hash?: string }>
  copilotSkills?: Array<{ name: string; description: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
}

export interface SetApprovedConfigResult {
  success: boolean
  message?: string
  version?: string
  hash?: string
  error?: string
}

export interface ApprovedConfigsByPlatformResponse {
  configs: Partial<Record<AgentPlatform, ApprovedConfigResponse>>
  availablePlatforms: AgentPlatform[]
}

export interface FleetRuntimeStatus {
  srtInstalled?: boolean
  srtSettingsPresent?: boolean
  compiledRulesPresent?: boolean
  preToolUseHookPresent?: boolean
  srtActive?: boolean
}

export interface FleetEnforcementStatus {
  installed: boolean
  version: string
  policyVersion: string
  platforms: string[]
  mode?: 'off' | 'warn' | 'block' | 'unknown'
  runtime?: FleetRuntimeStatus
}

export interface FleetDeveloperRecord {
  id: string
  organizationId: string
  email: string
  machineId: string
  hostname?: string
  registeredAt: string
  lastCheckIn: string
  enforcementStatus: FleetEnforcementStatus
  isCompliant: boolean
}

export interface FleetListResponse {
  developers: FleetDeveloperRecord[]
  summary: {
    total: number
    compliant: number
    nonCompliant: number
    installedCount: number
    avgPlatforms: number
  }
}

export interface FleetReportResponse {
  organizationId: string
  organizationName: string
  generatedAt: string
  summary: {
    totalDevelopers: number
    compliantDevelopers: number
    nonCompliantDevelopers: number
    complianceRate: number
    enforcementCoverage: number
  }
  platformBreakdown: Record<string, number>
  recentActivity: {
    registrations24h: number
    checkIns24h: number
    staleDevices: number
  }
  developers: FleetDeveloperRecord[]
}

export interface GenerateApprovedConfigProposalRequest {
  platform: AgentPlatform
  rationale: string
  policyName?: string
  autoGenerate?: boolean
  clientSurface?:
    | 'api'
    | 'cli'
    | 'dashboard'
    | 'vscode_extension'
    | 'chrome_extension'
    | 'mcp_session'
    | 'background_agent'
}

export interface GenerateApprovedConfigProposalResult {
  success: boolean
  proposal?: {
    id: string
    platform: AgentPlatform
    rationale: string
    content: {
      instructions?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
      commands?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
      hooks?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
      settings?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
      subagents?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
      rules?: Array<{ name: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
      cursorRules?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
      copilotInstructions?: { content: string; sourceRepo?: string; sourcePath?: string; hash?: string } | null
      copilotPathInstructions?: Array<{ name: string; content: string; applyTo: string; excludeAgent?: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
      copilotAgents?: Array<{ name: string; description: string; content: string; tools?: string[] | '*'; target?: 'vscode' | 'github-copilot'; infer?: boolean; sourceRepo?: string; sourcePath?: string; hash?: string }>
      copilotSkills?: Array<{ name: string; description: string; content: string; sourceRepo?: string; sourcePath?: string; hash?: string }>
    }
  }
  generation?: {
    source: 'manual' | 'model' | 'deterministic'
    fallbackReason?: string
    modelAttempted?: boolean
    modelValid?: boolean
    latencyMs?: number
  }
  error?: string
}

// ============================================================================
// Policy Management Types (#3029)
// ============================================================================

export interface ConfigPolicyItem {
  id: string
  name: string
  description?: string
  isBuiltin?: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
  createdBy: string
  config: Record<string, unknown>
}

// ============================================================================
// Environment Management Types (#5629)
// ============================================================================

export interface EnvironmentEnvVar {
  key: string
  value: string
  description?: string
}

export interface EnvironmentSecretRef {
  key: string
  description?: string
}

export interface EnvironmentConfig {
  id: string
  name: string
  description?: string
  envVars: EnvironmentEnvVar[]
  secretRefs: EnvironmentSecretRef[]
  runtime: {
    baseImage: string
    packages: string[]
    notes: string
  }
  createdAt?: string
  updatedAt?: string
}

export interface UpsertEnvironmentPayload {
  name: string
  description?: string
  envVars?: EnvironmentEnvVar[]
  secretRefs?: EnvironmentSecretRef[]
  runtime?: {
    baseImage: string
    packages: string[]
    notes: string
  }
}

// ============================================================================
// Auto-Approval Types (#3296)
// ============================================================================

export interface AutoApprovalSettings {
  enabled: boolean
  confidenceThreshold: number
  systemPrompt: string | null
  dryRun: boolean
}

export interface AutoApprovalDecision {
  id: string
  proposalId: string
  decision: 'approve' | 'reject' | 'escalate'
  confidence: number
  reasoning: string
  timestamp: string
}

// ============================================================================
// Config Repo Types (Git PR Workflow)
// ============================================================================

export interface ConfigRepoStatus {
  enabled: boolean
  repoUrl: string | null
  lastSyncedAt?: string | null
}

export interface CreateConfigRepoResult {
  success: boolean
  repoUrl?: string
  alreadyExists?: boolean
  error?: string
}

// ============================================================================
// Discovered Configs Types (Config Browser)
// Note: Type union matches API's DiscoveredConfigItem for full compatibility.
// Dashboard UI filters to Claude Code types; 'rule'/'agent' reserved for future use.
// ============================================================================

export interface DiscoveredConfigItem {
  type: 'command' | 'rule' | 'hook' | 'mcp' | 'settings' | 'agent' | 'instructions' | 'subagent' | 'skill' | 'policy' | 'workflow' | 'prompt'
  name: string
  platform?: AgentPlatform
  repo: string
  path: string
  content: string | null | undefined
  lastModified: string
  hash: string
  // Issue #3181: Git metadata enrichment fields
  commitDate?: string
  commitCount30d?: number
  commitCount90d?: number
  lastCommitAuthor?: string
  lastCommitSha?: string
}

export interface DiscoveredConfigGroup {
  name: string
  type: string
  platform?: AgentPlatform
  instances: {
    repo: string
    path: string
    content: string | null | undefined
    lastModified: string
    hash: string
    commitDate?: string
    commitCount30d?: number
    commitCount90d?: number
    lastCommitAuthor?: string
    lastCommitSha?: string
  }[]
  approvedStatus: 'none' | 'org' | 'project'
}

// Issue #1176: Added isStale flag to indicate cache staleness
export type DiscoveredConfigsResponse =
  | { organization: string; configs: DiscoveredConfigItem[]; totalConfigs: number; isStale?: boolean; cachedAt?: string }
  | { organization: string; groups: DiscoveredConfigGroup[]; totalGroups: number; totalConfigs: number; isStale?: boolean; cachedAt?: string }

export interface ConfigContentBatchResultEntry {
  content?: string
  sha?: string
  error?: string
}

export interface ConfigContentBatchFetchResponse {
  status: number
  contentLength: number | null
  results: Record<string, ConfigContentBatchResultEntry>
}

// ============================================================================
// Domain Compliance Types (#2523)
// ============================================================================

export interface DomainAccessStat {
  domain: string
  totalRequests: number
  blockedRequests: number
  lastAccessed: string
}

export interface DomainAlert {
  sessionId: string
  blockedCount: number
  domains: string[]
  repoName: string
  lastSeen: string
}

export interface DomainAlertsResponse {
  alerts: DomainAlert[]
  threshold: number
}

export interface DomainAnomaly {
  sessionId: string
  distinctDomains: number
  domains: string[]
  repoName: string
  totalRequests: number
  lastSeen: string
  type: 'excessive-domain-count'
}

export interface DomainAnomaliesResponse {
  anomalies: DomainAnomaly[]
  threshold: number
}

export interface DomainRepoBreakdown {
  repoName: string
  totalRequests: number
  blockedRequests: number
  distinctDomains: number
}

export interface DomainRepoBreakdownResponse {
  repos: DomainRepoBreakdown[]
  period: { days: number }
}

export interface DomainExceptionsResponse {
  exceptions: DomainExceptionItem[]
}

// =============================================================================
// SDLC Compliance Types (#541)
// =============================================================================

export interface SdlcComplianceStatus {
  orgName: string
  totalProjects: number
  compliantProjects: number
  driftedProjects: number
  projects: Array<{
    projectId: string
    currentPhase: number
    lastTransition: string
    skippedPhases: number[]
    isCompliant: boolean
  }>
}

export interface SdlcDriftReport {
  orgName: string
  driftDetected: boolean
  driftItems: Array<{
    projectId: string
    issueNumber: number
    skippedPhases: number[]
    fromPhase: number | null
    toPhase: number
    actor: string
    detectedAt: string
  }>
  summary: {
    totalTransitions: number
    compliantTransitions: number
    driftedTransitions: number
    complianceRate: number
  }
}

// =============================================================================
// Tool Compliance Types (#2519)
// =============================================================================

export type ToolComplianceStatus =
  | 'compliant'
  | 'missing_file'
  | 'missing_deny_rules'
  | 'has_exceptions'
  | 'drifted'

export interface RepoToolComplianceStatus {
  repo: string
  status: ToolComplianceStatus
  missingRules: string[]
  lastSyncHash: string | null
  currentHash: string | null
  drifted: boolean
  exceptionCount: number
}

export interface ToolComplianceStatusResponse {
  repos: RepoToolComplianceStatus[]
  summary: {
    total: number
    compliant: number
    missingFile: number
    missingDenyRules: number
    hasExceptions: number
    drifted: number
  }
}

export interface DriftedRepo {
  repo: string
  lastSyncHash: string
  currentHash: string
  lastSyncAt: string
}

export interface ToolComplianceDriftResponse {
  driftedRepos: DriftedRepo[]
  total: number
}

export interface ToolException {
  id: string
  repo: string
  rule: string
  approvedBy: string
  approvedAt: string
  reviewDeadline: string
  justification: string
}

export interface ToolExceptionsResponse {
  exceptions: ToolException[]
  total: number
}

export interface AffectedRepo {
  repo: string
  missingRules: string[]
  hasSettingsFile: boolean
}

export interface ToolImpactPreviewResponse {
  affectedRepos: AffectedRepo[]
  total: number
  baseline: string[]
}

// =============================================================================
// API Client Instance
// =============================================================================

/**
 * API Client instance - connects to real API
 */
export const api = new APIClient()

// Hook for service status
export async function getServiceStatus(): Promise<{
  api: boolean
  ai: boolean
  github: boolean
}> {
  const [apiHealth, aiHealth, githubStatus] = await Promise.all([
    api.checkAPIHealth(),
    api.checkAIHealth(),
    api.getGitHubAppStatus(),
  ])

  return {
    api: apiHealth,
    ai: aiHealth,
    github: githubStatus.installed,
  }
}
