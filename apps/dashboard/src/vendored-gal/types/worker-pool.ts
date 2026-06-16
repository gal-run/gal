/**
 * Worker Pool Types
 *
 * Types for worker pool service capacity tracking.
 */

/**
 * AI agent provider identifiers.
 * Matches CredentialProvider — platforms with credentialSync in the registry (Issue #2821).
 */
export type WorkerProvider = 'claude' | 'codex' | 'gemini' | 'oss' | 'firebase';

/**
 * Provider capacity information (#2098)
 */
export interface ProviderCapacity {
  /** Provider identifier */
  provider: WorkerProvider;
  /** Number of active sessions */
  active: number;
  /** Maximum concurrent sessions allowed for this provider */
  max: number;
  /** Whether capacity is available */
  available: boolean;
  /** Number of pending queue items for this provider */
  pending: number;
  /** Maximum pending queue items allowed for this provider */
  maxPending: number;
  /** Whether pending queue has capacity */
  pendingAvailable: boolean;
  /** Reason this provider is blocked (if any) */
  blockingReason?: 'concurrency_limit' | 'pending_limit' | 'global_limit';
}

/**
 * Capacity snapshot across all providers (#2098)
 */
export interface CapacitySnapshot {
  /** Per-provider capacity */
  providers: Record<WorkerProvider, ProviderCapacity>;
  /** Total active sessions across all providers */
  totalActive: number;
  /** Global max concurrent sessions */
  globalMax: number;
  /** Whether global capacity is available */
  globalAvailable: boolean;
  /** Total pending queue items across all providers */
  totalPending: number;
  /** Global max pending queue items */
  globalMaxPending: number;
  /** Whether global pending queue has capacity */
  globalPendingAvailable: boolean;
  /** Timestamp of snapshot */
  fetchedAt: string;
}

/**
 * Per-provider pool configuration (#2098)
 */
export interface ProviderPoolConfig {
  /** Provider identifier */
  provider: WorkerProvider;
  /** Max concurrent sessions for this provider (overrides global if set) */
  maxConcurrent?: number;
  /** Max pending queue items for this provider (overrides global if set) */
  maxPending?: number;
}

/**
 * A single time-based scaling rule (#4700).
 *
 * Allows overriding concurrency/pending limits during specific time windows.
 * When the current time falls within the window the rule's limits take effect
 * instead of the global defaults.
 */
export interface ScalingScheduleRule {
  /** Human-readable label, e.g. "Night shift" */
  name: string;
  /** Whether this rule is active */
  enabled: boolean;
  /** Start time in 24-hour "HH:MM" format, e.g. "22:00" */
  startTime: string;
  /** End time in 24-hour "HH:MM" format, e.g. "06:00" (may wrap past midnight) */
  endTime: string;
  /** IANA timezone, e.g. "America/New_York", "UTC" */
  timezone: string;
  /** Max concurrent agents during this window */
  maxConcurrentAgents: number;
  /** Optional max pending queue items during this window */
  maxPendingQueueItems?: number;
}

/**
 * Top-level scaling schedule configuration stored on dispatch_rules (#4700).
 */
export interface ScalingScheduleConfig {
  /** Whether time-based scaling is enabled at all */
  enabled: boolean;
  /** Ordered list of schedule rules — first matching rule wins */
  rules: ScalingScheduleRule[];
}

/**
 * Dispatch rules configuration with per-provider limits (#2098)
 */
export interface DispatchRulesConfig {
  /** Master switch for auto-dispatch */
  enabled?: boolean;
  /** Global max concurrent agents (fallback if provider-specific not set) */
  maxConcurrentAgents?: number;
  /**
   * Number of global concurrency slots reserved for manual/verification dispatch.
   * Queue auto-dispatch should cap itself at maxConcurrentAgents - reservedForManual.
   */
  reservedForManual?: number;
  /** Global max pending queue items (fallback if provider-specific not set) */
  maxPendingQueueItems?: number;
  /** Allowed credential owners for background-agent dispatch (#4722) */
  enabledCredentialOwners?: string[];
  /** Per-provider pool configurations */
  providerPools?: ProviderPoolConfig[];
  /** Max open PRs per repo */
  maxOpenPRsPerRepo?: number;
  /** Preferred provider */
  preferredProvider?: WorkerProvider;
  /** Custom instructions */
  customInstructions?: string;
  /** Time-based scaling schedule (#4700) */
  scalingSchedule?: ScalingScheduleConfig;
}
