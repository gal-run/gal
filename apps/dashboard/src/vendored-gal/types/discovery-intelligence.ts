/**
 * Discovery Intelligence Types - v1
 *
 * Shadow-mode model-assisted discovery insights.
 * Model output is strictly validated and gated behind feature flag.
 * Deterministic fallback applied when model output is invalid/unavailable.
 *
 * Issue: #1769
 */

// AgentPlatform — derived from platform registry (Issue #2821)
import type { PlatformId } from './platform-registry.js';
type AgentPlatform = PlatformId;

// ─────────────────────────────────────────────────────────────────────────────
// Config Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * High-level category for a discovered configuration.
 * Classifies configs into functional groups for triage and filtering.
 */
export type ConfigClass =
  | 'security'        // Contains security rules, permission restrictions, or auth controls
  | 'workflow'        // Primarily workflow definitions (commands, pipelines)
  | 'agent-persona'   // Custom agent personality or role definitions (CLAUDE.md, agents/)
  | 'tooling'         // Tool restrictions or capability grants (settings.json)
  | 'policy'          // Governance or policy enforcement rules
  | 'testing'         // Testing or QA automation configs
  | 'documentation'   // Documentation or knowledge base configs
  | 'unknown'         // Could not be classified

/**
 * Config class with confidence score
 */
export interface ConfigClassification {
  /** Assigned class */
  configClass: ConfigClass
  /** Confidence 0.0–1.0 */
  confidence: number
  /** Brief rationale (1–2 sentences) */
  rationale: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Risk Tags
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Risk indicators surfaced from config content.
 * Read-only signals — no destructive actions taken.
 */
export type RiskTag =
  | 'policy-drift'      // Config deviates significantly from approved baseline
  | 'secrets-risk'      // Content may contain or reference secrets/credentials
  | 'stale-pattern'     // Contains deprecated or outdated patterns
  | 'over-permissive'   // Grants unusually broad permissions
  | 'bypass-detected'   // Contains patterns that bypass security controls
  | 'untrusted-source'  // References external or unverified sources
  | 'no-guardrails'     // Lacks safety rules or approval gates

/**
 * Individual risk finding
 */
export interface RiskFinding {
  tag: RiskTag
  severity: 'low' | 'medium' | 'high'
  /** One-sentence description of the specific risk */
  description: string
  /** Optional line hint (1-indexed) if identifiable */
  lineHint?: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalized Summary
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Human-readable normalized summary suitable for UI display
 */
export interface NormalizedSummary {
  /** One-sentence description of what this config does */
  oneLiner: string
  /** 2–4 key points about this config */
  bulletPoints: string[]
  /** Estimated config complexity: minimal | standard | complex */
  complexity: 'minimal' | 'standard' | 'complex'
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery Insight Payload (model output)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Complete discovery insight payload attached to a discovered config.
 *
 * This is the STRICT schema that model output must conform to.
 * Any deviation triggers deterministic fallback.
 *
 * Schema version is tracked for forward compatibility.
 */
export interface DiscoveryInsightPayload {
  /** Schema version — bump when breaking changes are made */
  schemaVersion: '1.0'
  /** ISO 8601 timestamp when insight was generated */
  generatedAt: string
  /** Source of insight */
  source: 'model' | 'deterministic'
  /** Config classification */
  classification: ConfigClassification
  /** Risk findings (may be empty) */
  risks: RiskFinding[]
  /** Normalized summary for UI display */
  summary: NormalizedSummary
  /** Confidence that insight is valid overall (0.0–1.0) */
  overallConfidence: number
}

/**
 * Discovery insight attached to a discovered config item
 */
export interface DiscoveredConfigWithInsight {
  /** Original config ID/path for linking */
  configId: string
  /** Organization name */
  org: string
  /** Repository name */
  repo: string
  /** File path within the repository */
  filePath: string
  /** Platform of the config */
  platform: AgentPlatform
  /** The model-assisted insight (null if not available) */
  insight: DiscoveryInsightPayload | null
  /** Whether insight was derived from model (shadow) or deterministic fallback */
  insightSource: 'shadow-model' | 'deterministic-fallback' | 'unavailable'
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation Result
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result from validating a model-produced insight payload
 */
export interface InsightValidationResult {
  valid: boolean
  /** Validation errors if invalid */
  errors: string[]
  /** Whether the payload was coerced/sanitized to pass validation */
  coerced: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Feature Flag Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Feature flag configuration for discovery intelligence
 */
export interface DiscoveryIntelligenceFeatureConfig {
  /** Whether discovery intelligence is enabled at all */
  enabled: boolean
  /** Orgs targeted for shadow-mode insight generation */
  shadowModeOrgs: string[]
  /** Max content length (chars) to send to model (truncated beyond) */
  maxContentChars: number
  /** Shadow mode: collect telemetry but do not surface insights to end users */
  shadowOnly: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Telemetry Events
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Telemetry event: insight generation attempt
 */
export interface DiscoveryInsightGeneratedEvent {
  eventType: 'discovery_insight_generated'
  org: string
  repo: string
  configPath: string
  platform: AgentPlatform
  source: 'model' | 'deterministic'
  validationPassed: boolean
  validationErrors: string[]
  configClass: ConfigClass
  riskTagCount: number
  durationMs: number
  schemaVersion: string
}

/**
 * Telemetry event: insight validation failure (deterministic fallback triggered)
 */
export interface DiscoveryInsightFallbackEvent {
  eventType: 'discovery_insight_fallback'
  org: string
  repo: string
  configPath: string
  platform: AgentPlatform
  reason: 'model-unavailable' | 'validation-failed' | 'content-too-large' | 'flag-disabled'
  validationErrors: string[]
}

export type DiscoveryIntelligenceTelemetryEvent =
  | DiscoveryInsightGeneratedEvent
  | DiscoveryInsightFallbackEvent
