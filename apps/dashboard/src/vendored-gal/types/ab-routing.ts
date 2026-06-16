/**
 * A/B Routing Infrastructure Types (#4886)
 *
 * Org-level routing configuration for splitting background agent execution
 * between OSS (open-source) and vendor (Claude/Codex/Gemini) providers.
 *
 * Strategy: org-level split where internal Scheduler Systems org runs OSS,
 * customer orgs run vendor. Dispatch layer accepts a provider config per org.
 * Provider used + outcome logged per session for comparison.
 */

import type { WorkerProvider } from './worker-pool.js';
import type { OssEvalCanonicalProvider } from './oss-model-eval.js';

// =============================================================================
// Provider Lane Types
// =============================================================================

/**
 * Provider lane buckets for A/B routing.
 * - "vendor": Commercial providers (Claude, Codex, Gemini)
 * - "oss": Open-source model providers (DeepSeek, Qwen, Llama, Mistral, etc.)
 */
export type ProviderLane = 'vendor' | 'oss';

/**
 * Routing mode determines how traffic is split between lanes.
 */
export type ABRoutingMode =
  | 'vendor_only'    // All traffic to vendor (default for customer orgs)
  | 'oss_only'       // All traffic to OSS (testing mode)
  | 'percentage'     // Percentage-based split between vendor and OSS
  | 'round_robin'    // Alternating between vendor and OSS
  | 'conditional';   // Rule-based routing (e.g., by label, repo, complexity)

// =============================================================================
// OSS Provider Configuration
// =============================================================================

/**
 * Configuration for an OSS model endpoint.
 */
export interface OSSProviderEndpoint {
  /** Human-readable name (e.g., "DeepSeek V3", "Qwen 2.5") */
  name: string;
  /** Model identifier for the serving endpoint */
  modelId: string;
  /** API endpoint URL (e.g., OpenAI-compatible endpoint) */
  endpointUrl?: string;
  /** Whether this endpoint is currently enabled */
  enabled: boolean;
  /** Optional weight for load balancing between multiple OSS models */
  weight?: number;
}

// =============================================================================
// Conditional Routing Rules
// =============================================================================

/**
 * A condition that determines when a specific lane should be used.
 */
export interface ABRoutingCondition {
  /** Match sessions with specific GitHub labels */
  labels?: string[];
  /** Match sessions targeting a specific repository */
  repo?: string;
  /** Match based on task complexity */
  complexity?: 'simple' | 'complex';
  /** Match based on dispatch category */
  category?: string;
}

/**
 * A routing rule that maps conditions to a specific lane.
 */
export interface ABRoutingRule {
  /** Rule identifier for logging/debugging */
  ruleId: string;
  /** Condition to evaluate */
  condition: ABRoutingCondition;
  /** Lane to route to when condition matches */
  lane: ProviderLane;
  /** Human-readable description */
  description?: string;
  /** Whether this rule is enabled */
  enabled: boolean;
}

// =============================================================================
// Org-Level A/B Routing Configuration
// =============================================================================

/**
 * Complete A/B routing configuration stored per org in dispatch_rules.
 */
export interface ABRoutingConfig {
  /** Whether A/B routing is enabled for this org */
  enabled: boolean;

  /** Routing mode */
  mode: ABRoutingMode;

  /**
   * Traffic percentage for OSS lane (0-100).
   * Only used when mode is 'percentage'.
   * E.g., 20 means 20% OSS, 80% vendor.
   */
  ossPercentage?: number;

  /**
   * Default vendor provider when routing to vendor lane.
   * Falls back to org's preferredProvider if not set.
   */
  vendorProvider?: WorkerProvider;

  /**
   * OSS provider endpoints available for this org.
   * When multiple are enabled, traffic is distributed by weight.
   */
  ossProviders?: OSSProviderEndpoint[];

  /**
   * Conditional routing rules (used when mode is 'conditional').
   * Evaluated in order; first match wins.
   */
  rules?: ABRoutingRule[];

  /** Timestamp of last configuration update */
  updatedAt?: string;
  /** User who last updated the configuration */
  updatedBy?: string;
}

// =============================================================================
// Routing Decision Types
// =============================================================================

/**
 * The result of an A/B routing decision for a single session.
 */
export interface ABRoutingDecision {
  /** Which lane was selected */
  lane: ProviderLane;

  /** The specific provider selected within the lane */
  provider: WorkerProvider | string;

  /** Why this lane was selected */
  reason: ABRoutingDecisionReason;

  /** Rule ID if conditional routing was used */
  matchedRuleId?: string;

  /** OSS model ID if OSS lane was selected */
  ossModelId?: string;

  /** OSS endpoint URL if OSS lane was selected */
  ossEndpointUrl?: string;

  /** A/B routing config snapshot at decision time */
  configMode: ABRoutingMode;

  /** Percentage used (if percentage mode) */
  configOssPercentage?: number;

  /** Random value used for percentage routing (0-100) for reproducibility */
  randomSeed?: number;

  /** Timestamp of decision */
  decidedAt: string;
}

/**
 * Reason codes for A/B routing decisions.
 */
export type ABRoutingDecisionReason =
  | 'ab_disabled'                // A/B routing not enabled, default to vendor
  | 'vendor_only_mode'           // Org configured for vendor only
  | 'oss_only_mode'              // Org configured for OSS only
  | 'percentage_vendor'          // Percentage roll landed on vendor
  | 'percentage_oss'             // Percentage roll landed on OSS
  | 'round_robin_vendor'         // Round robin selected vendor
  | 'round_robin_oss'            // Round robin selected OSS
  | 'conditional_rule_match'     // A conditional rule matched
  | 'conditional_default_vendor' // No conditional rule matched, default vendor
  | 'oss_fallback_to_vendor'     // OSS was selected but unavailable, fell back
  | 'explicit_agent_override';   // Explicit agent request overrides A/B routing

// =============================================================================
// Session-Level Routing Outcome
// =============================================================================

/**
 * Routing outcome logged per session for A/B comparison.
 * Stored in session metadata alongside ProviderRoutingMetadata.
 */
export interface ABRoutingOutcome {
  /** The routing decision that was made */
  decision: ABRoutingDecision;

  /** Session outcome (populated after session completes) */
  outcome?: {
    /** Did the session complete successfully */
    success: boolean;
    /** Was a PR created */
    prCreated: boolean;
    /** Was the PR merged */
    prMerged: boolean;
    /** Did CI pass on first attempt */
    ciPassedFirstAttempt: boolean;
    /** Session duration in seconds */
    durationSeconds: number;
    /** Number of tool calls made */
    toolCallCount?: number;
  };

  /** Canonical provider bucket for eval comparison */
  evalProvider: OssEvalCanonicalProvider;
}

// =============================================================================
// Defaults & Constants
// =============================================================================

/**
 * Default A/B routing config (vendor only, disabled).
 */
export const DEFAULT_AB_ROUTING_CONFIG: ABRoutingConfig = {
  enabled: false,
  mode: 'vendor_only',
};

/**
 * Valid A/B routing modes.
 */
export const AB_ROUTING_MODES: ABRoutingMode[] = [
  'vendor_only',
  'oss_only',
  'percentage',
  'round_robin',
  'conditional',
];

/**
 * Map provider lane to eval canonical provider.
 */
export function laneToEvalProvider(
  lane: ProviderLane,
  vendorProvider?: WorkerProvider,
): OssEvalCanonicalProvider {
  if (lane === 'oss') return 'oss';
  // Map vendor lane providers to their eval canonical form
  if (vendorProvider === 'codex') return 'codex';
  return 'claude'; // Default vendor = claude
}
