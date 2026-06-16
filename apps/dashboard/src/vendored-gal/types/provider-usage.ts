/**
 * Provider Usage Telemetry Types (Issue #2005)
 *
 * Per-developer provider usage tracking for dispatch steering.
 * Collects usage data from providers (Claude, Codex, Gemini) to support
 * intelligent routing when providers approach limits.
 */

import type { SessionAgent } from './session.js';

/**
 * Provider usage health state
 */
export type UsageHealthState = 'ok' | 'warning' | 'critical';

/**
 * Source of Claude/provider usage recorded in GAL.
 */
export type ProviderUsageSource = 'background_agent' | 'local';

/**
 * Time window for usage aggregation
 */
export type UsageWindow = '1h' | '24h' | '7d' | '30d';

/**
 * Provider-specific usage snapshot for a single developer
 */
export interface ProviderUsageSnapshot {
  /** Developer user ID */
  userId: string;
  /** GitHub username */
  githubLogin: string;
  /** Organization */
  organizationId: string;
  /** Provider (claude, codex, gemini, etc.) */
  provider: SessionAgent;
  /** Current usage count/value */
  currentUsage: number;
  /** Total limit/quota */
  limit: number | null;
  /** Usage percent (0-100), null if limit unknown */
  usagePercent: number | null;
  /** Remaining headroom */
  headroom: number | null;
  /** Health state based on thresholds */
  healthState: UsageHealthState;
  /** Reset window (when usage resets) */
  resetWindow: string; // ISO 8601 duration (e.g., "P1D" for 24h, "P7D" for 7d)
  /** Next reset timestamp */
  nextResetAt: string | null; // ISO 8601 timestamp
  /** Last updated timestamp */
  lastUpdatedAt: string; // ISO 8601 timestamp
  /** Time window this snapshot represents */
  window: UsageWindow;
  /** Raw provider data (for debugging) */
  rawProviderData?: Record<string, unknown>;
  /** Optional breakdown by usage source */
  usageBySource?: Partial<Record<ProviderUsageSource, number>>;
}

/**
 * Aggregated usage across all providers for a developer
 */
export interface DeveloperUsageAggregate {
  /** Developer user ID */
  userId: string;
  /** GitHub username */
  githubLogin: string;
  /** Organization */
  organizationId: string;
  /** Per-provider usage snapshots */
  providers: ProviderUsageSnapshot[];
  /** Overall health state (worst of all providers) */
  overallHealthState: UsageHealthState;
  /** Last updated timestamp */
  lastUpdatedAt: string;
}

/**
 * Provider usage thresholds for health state calculation
 */
export interface ProviderUsageThresholds {
  /** Warn when usage exceeds this percentage */
  warningThreshold: number; // e.g., 70
  /** Critical when usage exceeds this percentage */
  criticalThreshold: number; // e.g., 90
}

/**
 * Default thresholds
 */
export const DEFAULT_USAGE_THRESHOLDS: ProviderUsageThresholds = {
  warningThreshold: 70,
  criticalThreshold: 90,
};

/**
 * Provider usage collection request
 * Sent from CLI/agent to API to report usage
 */
export interface ProviderUsageReportRequest {
  /** Developer user ID */
  userId: string;
  /** Provider */
  provider: SessionAgent;
  /** Current usage value */
  currentUsage: number;
  /** Limit (if known) */
  limit: number | null;
  /** Reset window ISO duration */
  resetWindow: string;
  /** Next reset timestamp */
  nextResetAt: string | null;
  /** Time window */
  window: UsageWindow;
  /** Raw provider data (optional) */
  rawProviderData?: Record<string, unknown>;
}

/**
 * Provider usage API response
 */
export interface ProviderUsageResponse {
  success: boolean;
  snapshot?: ProviderUsageSnapshot;
  message?: string;
}

/**
 * Developer provider usage list response (GET /api/usage/providers/developers)
 */
export interface DeveloperUsageListResponse {
  developers: DeveloperUsageAggregate[];
  totalDevelopers: number;
  thresholds: ProviderUsageThresholds;
  lastUpdatedAt: string;
}

/**
 * Provider-level aggregated usage (GET /api/usage/providers)
 */
export interface ProviderAggregateUsage {
  /** Provider */
  provider: SessionAgent;
  /** Total developers using this provider */
  totalDevelopers: number;
  /** Developers by health state */
  healthBreakdown: {
    ok: number;
    warning: number;
    critical: number;
  };
  /** Average usage percent across all developers */
  averageUsagePercent: number | null;
  /** Highest usage percent among developers */
  maxUsagePercent: number | null;
  /** Last updated timestamp */
  lastUpdatedAt: string;
}

/**
 * Provider usage aggregate list response
 */
export interface ProviderUsageAggregateResponse {
  providers: ProviderAggregateUsage[];
  thresholds: ProviderUsageThresholds;
  lastUpdatedAt: string;
}

/**
 * Dispatch steering decision based on usage
 */
export interface DispatchSteeringDecision {
  /** Original provider requested */
  requestedProvider: SessionAgent;
  /** Actual provider chosen */
  selectedProvider: SessionAgent;
  /** Whether provider was changed */
  steered: boolean;
  /** Reason for steering decision */
  reason: string;
  /** Reason code for auditing */
  reasonCode:
    | 'preferred_available'
    | 'preferred_nearing_limit'
    | 'preferred_at_limit'
    | 'preferred_unavailable'
    | 'fallback_to_next';
  /** Timestamp */
  decidedAt: string;
}

/**
 * Helper to calculate health state from usage percent
 */
export function calculateHealthState(
  usagePercent: number | null,
  thresholds: ProviderUsageThresholds = DEFAULT_USAGE_THRESHOLDS
): UsageHealthState {
  if (usagePercent === null) return 'ok';
  if (usagePercent >= thresholds.criticalThreshold) return 'critical';
  if (usagePercent >= thresholds.warningThreshold) return 'warning';
  return 'ok';
}

/**
 * Helper to calculate headroom
 */
export function calculateHeadroom(
  currentUsage: number,
  limit: number | null
): number | null {
  if (limit === null) return null;
  return Math.max(0, limit - currentUsage);
}

/**
 * Helper to calculate usage percent
 */
export function calculateUsagePercent(
  currentUsage: number,
  limit: number | null
): number | null {
  if (limit === null || limit === 0) return null;
  return Math.min(100, (currentUsage / limit) * 100);
}
