/**
 * Feature Flag Types - Shared between API and Dashboard
 *
 * This ensures type safety: if you add a page to the API,
 * TypeScript will error until you update the Dashboard (and vice versa).
 */

// ═══════════════════════════════════════════════════════════════
// PAGE IDS - All valid dashboard page identifiers
// ═══════════════════════════════════════════════════════════════

/**
 * All valid page IDs in the dashboard.
 * Adding a new page requires updating this type.
 */
export type PageId =
  | "dashboard"
  | "discovery"
  | "proposals" // #1044: Config Governance - Proposal workflow
  | "team" // GAL-272: Team access management
  | "background-agents" // GAL-571: Background agent sessions
  | "swarm" // GPU burst orchestration for GAL Swarm
  | "cli"
  | "vscode"
  | "docs"
  | "billing"
  | "settings"
  | "workflow-testing" // GAL-307: Test slash commands and hooks
  | "project-scope-configs" // #1339: Approved Config page route (legacy id)
  | "enforcement-overrides" // #389: Project overrides for enforcement tier
  | "domain-compliance" // #2523: Domain allowlist compliance
  | "tool-compliance" // #2519: Enterprise tool allowlist compliance reporting
  | "audit-logs" // #2526: Centralized audit log aggregation
  | "enforcement-policies" // #2514: Agent security policies
  | "enforcement-compliance" // Compliance status
  | "enforcement-audit" // #2526: Audit log viewer
  | "enforcement-domains" // #2523: Domain audit
  | "enforcement-hooks" // #181: Enforcement hooks
  | "enforcement-sdlc" // #529: SDLC compliance gates
  | "enforcement-security" // #184: Security standards
  | "enforcement-tools" // #822: Tool governance
  | "enforcement-system" // #183: System enforcement
  | "browser-profiles" // #4689: Internal only
  | "governance-playground" // #5113: Governance model chat playground
  | "token-spend" // #6285: Per-tenant GAL Code token usage dashboard
  | "policies"; // #6878: Organization governance policies

/**
 * Layer categorization for pages
 */
export type PageLayer = "core";

/**
 * Feature flag categories for API features
 */
export type FeatureCategory =
  | "core"
  | "governance"
  | "platform"
  | "experimental"
  | "infrastructure";

/**
 * Subscription plan tiers
 *
 * FREE        - Limited access: 3 configs, 1 workspace, no background agents, CLI sync only
 * CONVENIENCE - Basic discovery and sync
 * ENFORCEMENT - Policy enforcement and compliance scanning
 * ENTERPRISE  - SOC 2, GDPR, HIPAA compliance + SSO + self-hosted
 */
export type PlanTier = "free" | "convenience" | "enforcement" | "enterprise";

// ═══════════════════════════════════════════════════════════════
// PAGE FLAG TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Page audience - for enabled pages only
 */
export type PageAudience = "public" | "partners" | "internal";

/**
 * Audience tier alias - used by hierarchical evaluation in @gal/core.
 * Semantically identical to PageAudience but named for the tier context.
 */
export type AudienceTier = PageAudience;

/**
 * Feature maturity label — informational, not access control.
 * - stable: Generally available, fully supported
 * - preview: Experimental / research preview, may change
 */
export type FlagMaturity = "stable" | "preview";

/**
 * Deployment environments for feature/page visibility
 * - dev: Local development
 * - prod: Production environment
 */
export type FlagEnvironment = "dev" | "prod";

/**
 * Configuration for a dashboard page
 */
export interface PageFlag {
  route: string;
  name: string;
  description: string;
  layer: PageLayer;
  enabled: boolean; // Whether the page is accessible
  audience?: PageAudience; // Only for enabled pages, default: 'public'
  maturity?: FlagMaturity; // Informational label: 'stable' (default) or 'preview'
  internalOrgs?: string[]; // Only for audience: 'internal' (fallback to admin orgs when omitted)
  environments?: FlagEnvironment[]; // If set, only visible in these environments
  orgEnvironments?: Record<string, FlagEnvironment[]>; // Org-specific environment overrides
}

/**
 * Page flag with computed effective status
 */
export interface PageFlagWithStatus extends PageFlag {
  effectivelyEnabled: boolean;
}

/**
 * All page flags keyed by PageId
 */
export type PageFlagsConfig = Record<PageId, PageFlag>;

// ═══════════════════════════════════════════════════════════════
// FEATURE FLAG TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Configuration for an API feature
 */
export interface FeatureFlag {
  name: string;
  description: string;
  category: FeatureCategory;
  enabled: boolean; // Whether the feature is available
  requiredPlan?: PlanTier;
  maturity?: FlagMaturity; // Informational label: 'stable' (default) or 'preview'
  audience?: AudienceTier; // Audience tier for visibility gating (default: 'public')
  internalOrgs?: string[]; // Optional org-level gating for internal feature rollouts
  environments?: FlagEnvironment[]; // If set, only available in these environments
  orgEnvironments?: Record<string, FlagEnvironment[]>; // Org-specific environment overrides
}

/**
 * Feature flag with computed effective status
 */
export interface FeatureFlagWithStatus extends FeatureFlag {
  effectivelyEnabled: boolean;
}

// ═══════════════════════════════════════════════════════════════
// API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════

/**
 * Canonical environment names used across the project
 * - dev:  Local development
 * - prod: Production environment
 */
export type DisplayEnvironment = "dev" | "prod";

/**
 * Environment information returned by API
 */
export interface EnvironmentInfo {
  /** Canonical environment name */
  environment: DisplayEnvironment;
  isProduction: boolean;
  nodeEnv: string;
}

/**
 * Response from GET /feature-flags
 */
export interface FeatureFlagsResponse {
  environment: EnvironmentInfo;
  pages: Record<PageId, PageFlagWithStatus>;
  features: Record<string, FeatureFlagWithStatus>;
}

/**
 * Response from GET /feature-flags/pages
 */
export interface PageFlagsResponse {
  environment: EnvironmentInfo;
  pages: Record<PageId, PageFlagWithStatus>;
}

// ═══════════════════════════════════════════════════════════════
// NAVIGATION ITEM TYPE
// ═══════════════════════════════════════════════════════════════

/**
 * Base navigation item configuration (without React-specific icon type)
 * Dashboard extends this with icon component type
 */
export interface NavItemBase {
  path: string;
  label: string;
  pageId: PageId;
}

// ═══════════════════════════════════════════════════════════════
// HELPER CONSTANTS
// ═══════════════════════════════════════════════════════════════

/**
 * All valid page IDs as an array (for runtime validation)
 */
export const ALL_PAGE_IDS: PageId[] = [
  "dashboard",
  "discovery",
  "proposals",
  "team",
  "background-agents",
  "swarm",
  "cli",
  "vscode",
  "docs",
  "billing",
  "settings",
  "workflow-testing",
  "project-scope-configs",
  "enforcement-overrides",
  "domain-compliance",
  "tool-compliance",
  "audit-logs",
  "enforcement-policies",
  "enforcement-compliance",
  "enforcement-audit",
  "enforcement-domains",
  "enforcement-hooks",
  "enforcement-sdlc",
  "enforcement-security",
  "enforcement-tools",
  "enforcement-system",
  "browser-profiles",
  "governance-playground",
  "token-spend",
  "policies",
];
