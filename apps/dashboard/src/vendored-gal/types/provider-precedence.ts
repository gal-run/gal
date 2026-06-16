/**
 * Provider Precedence Transparency Types (Issue #1990)
 *
 * Defines types for transparent provider selection, routing decisions,
 * and usage metrics to support dispatch routing decisions.
 */

import type { SessionAgent } from './session.js';
import type { WorkerProvider } from './worker-pool.js';

/**
 * Detailed provider availability checks
 */
export interface ProviderChecks {
  /** User has valid credentials for this provider */
  credentials: boolean;
  /** Reason if credentials check failed */
  credentialsReason?: 'NO_CREDENTIALS' | 'CREDENTIALS_EXPIRED' | 'CREDENTIALS_INVALID';

  /** Provider has available capacity slots */
  capacity: boolean;
  /** Reason if capacity check failed */
  capacityReason?: 'CAPACITY_FULL_PROVIDER' | 'CAPACITY_FULL_GLOBAL';

  /** Organization has quota remaining */
  quota: boolean;
  /** Reason if quota check failed */
  quotaReason?: 'QUOTA_DAILY_EXHAUSTED' | 'QUOTA_WEEKLY_EXHAUSTED' | 'QUOTA_SOFT_LIMIT';

  /** Provider is healthy (not in outage) */
  health: boolean;
  /** Reason if health check failed */
  healthReason?: 'HEALTH_DEGRADED' | 'HEALTH_PARTIAL_OUTAGE' | 'HEALTH_MAJOR_OUTAGE';

  /** Organization policy allows this provider */
  policy: boolean;
  /** Reason if policy check failed */
  policyReason?: 'POLICY_BLOCKED' | 'POLICY_NOT_ALLOWED';

  /** All checks passed */
  available: boolean;
}

/**
 * Provider selection reason codes for auditability
 */
export type ProviderSelectionReason =
  // Success codes
  | 'requested'              // Requested provider available, using it
  | 'fallback_quota'         // Fallback due to quota exhaustion
  | 'fallback_capacity'      // Fallback due to capacity limit
  | 'fallback_health'        // Fallback due to health issue
  | 'fallback_credentials'   // Fallback due to missing credentials
  | 'fallback_policy'        // Fallback due to routing policy
  // Failure codes (forced dispatch)
  | 'forced_requested'       // No provider available, returning requested anyway
  | 'forced_default';        // No provider available, returning default

/**
 * How explicit provider requests are treated during routing.
 */
export type ExplicitProviderRequestPolicy =
  | 'hard_requirement'
  | 'soft_preference';

/**
 * Persisted routing metadata for session-level provider decisions.
 */
export interface ProviderRoutingMetadata {
  /** Whether the client explicitly provided `agent` in the request payload */
  explicitAgentRequested: boolean;
  /** Policy used for explicit provider requests */
  explicitAgentPolicy: ExplicitProviderRequestPolicy;
  /** Agent resolved from request validation before routing */
  requestedAgent: SessionAgent;
  /** Provider mapped from requestedAgent when routeable */
  requestedProvider: WorkerProvider | null;
  /** Agent selected by orchestrator rollout before worker pool routing */
  rolloutAgent: SessionAgent;
  /** Agent that will actually be persisted/dispatched */
  finalAgent: SessionAgent;
  /** Provider mapped from finalAgent when routeable */
  finalProvider: WorkerProvider | null;
  /** True when finalAgent differs from requestedAgent */
  fallbackApplied: boolean;
  /** Optional high-level fallback reason */
  fallbackReason?: string;
  /** Worker pool decision details when selection logic ran */
  workerPool?: {
    selectedProvider: WorkerProvider;
    reason: ProviderSelectionReason;
    requestedProvider?: WorkerProvider;
    fallbackChain?: Array<{
      provider: WorkerProvider;
      checks: ProviderChecks;
    }>;
    precedenceOrder: WorkerProvider[];
    decidedAt: string;
  };
}

/**
 * Enhanced provider selection result with full transparency
 */
export interface ProviderSelectionResult {
  /** The selected provider */
  provider: WorkerProvider;
  /** Why this provider was selected */
  reason: ProviderSelectionReason;
  /** Detailed checks performed on selected provider */
  checks: ProviderChecks;
  /** The provider originally requested (if different from selected) */
  requestedProvider?: WorkerProvider;
  /** Chain of fallback attempts (for debugging) */
  fallbackChain?: Array<{
    provider: WorkerProvider;
    checks: ProviderChecks;
  }>;
  /** Provider precedence order used for this decision */
  precedenceOrder: WorkerProvider[];
  /** Timestamp of selection decision */
  decidedAt: string;
}

/**
 * Per-provider usage metrics for dispatch routing
 */
export interface ProviderUsageMetrics {
  /** Provider identifier */
  provider: WorkerProvider;
  /** Time window for metrics */
  window: '24h' | '7d' | '30d';
  /** Sessions started in this window */
  sessionsStarted: number;
  /** Sessions completed successfully */
  sessionsSucceeded: number;
  /** Sessions that failed/errored */
  sessionsFailed: number;
  /** Success rate (0-100) */
  successRate: number;
  /** Total runtime minutes */
  runtimeMinutes: number;
  /** Average runtime per session (minutes) */
  avgRuntimeMinutes: number;
  /** Total spend (USD) if available */
  spendUSD: number | null;
  /** Cost per session (USD) if available */
  costPerSession: number | null;
  /** Credential health status */
  credentialHealth: {
    hasCredentials: boolean;
    validUntil?: string;
    expiresIn?: number; // seconds
  };
}

/**
 * Usage metrics response for /usage command
 */
export interface ProviderMetricsResponse {
  /** Organization ID */
  organizationId: string;
  /** User ID (for user-scoped metrics) */
  userId?: string;
  /** Per-provider metrics */
  providers: ProviderUsageMetrics[];
  /** Overall success rate across all providers */
  overallSuccessRate: number;
  /** Total sessions across all providers */
  totalSessions: number;
  /** Total spend across all providers (if available) */
  totalSpendUSD: number | null;
  /** Current provider precedence order */
  precedenceOrder: WorkerProvider[];
  /** Timestamp of metrics collection */
  collectedAt: string;
}

/**
 * Provider precedence configuration (org-level)
 */
export interface ProviderPrecedenceConfig {
  /** Custom precedence order (overrides default claude → codex → gemini) */
  providerPrecedence?: WorkerProvider[];
  /** Allowed providers whitelist */
  allowedProviders?: WorkerProvider[];
  /** Blocked providers blacklist */
  blockedProviders?: WorkerProvider[];
  /** Cost optimization mode (prefer cheaper providers) */
  costOptimizationMode?: boolean;
}

/**
 * Extended dispatch rules with provider precedence
 */
export interface DispatchRulesWithPrecedence {
  /** Master switch for auto-dispatch */
  enabled?: boolean;
  /** Max concurrent sessions across all providers */
  maxConcurrentAgents?: number;
  /** Max pending queue items */
  maxPendingQueueItems?: number;
  /** Max open PRs per repo */
  maxOpenPRsPerRepo?: number;
  /** Preferred provider (deprecated - use providerPrecedence) */
  preferredProvider?: SessionAgent;
  /** Provider precedence configuration */
  precedence?: ProviderPrecedenceConfig;
}

/**
 * Helper: Get default provider precedence
 */
export const DEFAULT_PROVIDER_PRECEDENCE: WorkerProvider[] = ['codex', 'claude', 'gemini', 'oss'];

/**
 * Helper: Map SessionAgent to WorkerProvider
 */
export function mapAgentToProvider(agent: SessionAgent): WorkerProvider {
  const mapping: Partial<Record<SessionAgent, WorkerProvider>> = {
    claude: 'claude',
    codex: 'codex',
    gemini: 'gemini',
    oss: 'oss',
    gal: 'oss', // GAL Code routes through the GLM-5 executor lane (#5139)
  };
  return mapping[agent] ?? 'claude';
}

/**
 * Helper: Map WorkerProvider to SessionAgent
 */
export function mapProviderToAgent(provider: WorkerProvider): SessionAgent {
  const mapping: Record<WorkerProvider, SessionAgent> = {
    claude: 'claude',
    codex: 'codex',
    gemini: 'gemini',
    oss: 'oss',
    firebase: 'claude',
  };
  return mapping[provider];
}

/**
 * Helper: Determine fallback reason from check results
 */
export function determineFallbackReason(
  requestedChecks: ProviderChecks,
  fallbackChecks: ProviderChecks
): ProviderSelectionReason {
  if (!requestedChecks.credentials) return 'fallback_credentials';
  if (!requestedChecks.capacity) return 'fallback_capacity';
  if (!requestedChecks.quota) return 'fallback_quota';
  if (!requestedChecks.health) return 'fallback_health';
  if (!requestedChecks.policy) return 'fallback_policy';
  return 'fallback_capacity'; // Default fallback
}

/**
 * Helper: Format provider selection for logging
 */
export function formatProviderSelection(result: ProviderSelectionResult): string {
  if (result.reason === 'requested') {
    return `Selected ${result.provider} (requested)`;
  }

  const requested = result.requestedProvider ?? 'claude';
  return `Selected ${result.provider} (fallback from ${requested}: ${result.reason})`;
}
