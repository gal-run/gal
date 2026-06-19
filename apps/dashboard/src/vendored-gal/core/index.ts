/**
 * @gal/core - Framework-agnostic business logic
 *
 * This package contains domain models, services, and repository interfaces
 * following Clean Architecture principles. All business logic is extracted
 * here to be reusable across API, CLI, and Dashboard.
 *
 * Zero dependencies on:
 * - Firebase (adapters live in apps)
 * - Express (HTTP concerns in API)
 * - React (UI concerns in Dashboard)
 * - Node.js fs/process (CLI-specific in CLI app)
 */

// Domain Models
export * from './domain/organization'
export * from './domain/user'
export * from './domain/scan-result'
export * from './domain/team-member'
export * from './domain/subscription'
export * from './domain/workspace' // GAL-569: Unified Auth
export * from './domain/workspace-membership' // GAL-569: Unified Auth

// Repository Interfaces (implementations in apps)
export * from './repositories/IOrganizationRepository'
export * from './repositories/IUserRepository'
export * from './repositories/IScanResultRepository'
export * from './repositories/ISubscriptionRepository'
export * from './repositories/IPersonalGitHubRepository'
export * from './repositories/IWorkspacePreferenceRepository'
export * from './repositories/IWorkItemRepository'
export * from './repositories/IAuthRepository'
export * from './repositories/IWorkspaceRepository'
export * from './repositories/ISessionRepository'
export * from './repositories/IConfigRepository'
export * from './repositories/IProposalRepository'
export * from './repositories/ITrackedRepoRepository'
export * from './repositories/ISdlcRepository'
export * from './repositories/ICredentialRepository'
export * from './repositories/IInviteRepository'
export * from './repositories/IBillingRepository'
export * from './repositories/IFleetRepository'
export * from './repositories/ITelemetryRepository'

// Services
// NOTE: Most auth services (JwtService, OAuthService) use Node.js-only packages
// Do NOT export here - they're API-only, not for browser/dashboard
// export * from './services/auth'

// RedirectValidator is safe to export - pure JS, no Node.js dependencies
export { RedirectValidator } from './services/auth/RedirectValidator'
export type { RedirectValidationResult } from './services/auth/RedirectValidator'

export * from './services/organizations'
export * from './services/subscriptions'
// IMPORTANT (#2474): Do NOT re-export UnifiedAuthService as `export * from ...` here.
// UnifiedAuthService is an abstract class with no browser consumers; keeping it out of
// the barrel export avoids webpack pulling the module into the dashboard bundle.
// The @gal/telemetry import was removed (replaced with console) to fully fix the crash,
// but we still avoid the barrel re-export as defense-in-depth.
// Server-side consumers (API, CLI) can import directly from the subpath if needed.
export type { AuthCredentials, AuthResult } from './services/auth/UnifiedAuthService'
export * from './services/workspace' // GAL-569: Workspace permission service

// Configuration
export * from './config/IEnvironmentConfig'

// Admin Orgs (Issue #2618 - centralized parsing with case-insensitive matching)
export { DEFAULT_ADMIN_ORGS, parseAdminOrgs, isAdminOrg } from './admin-orgs'

// Audience Tier (Issue #3118 - hierarchical feature flag evaluation, #3140 - consolidated)
export { getUserAudienceTier, meetsAudience, resolveOrgTier, normalizeOrgName, normalizeOrgList, TIER_RANK } from './audience-tier'
export type { AudienceTier } from './audience-tier'

// Browser profile storage-state normalization
export * from './browser-profile-storage-state'
export * from './approved-config-enforcement'

// Errors
export * from './errors/DomainError'
export * from './errors/AuthError'
export * from './errors/ValidationError'

// Telemetry (Issue #1772 - Data Loop + KPI Gates)
export * from './telemetry/convenience-model-telemetry'

// Discovery Intelligence Validator (GAL-1769)
export * from './services/discovery/DiscoveryInsightValidator'

// MigrationRegistry (Issue #3405 - lazy schema migration for Firestore documents)
export { MigrationRegistry } from './migrations/MigrationRegistry.js'
export { registerAllMigrations } from './migrations/register-all-migrations.js'

// ─────────────────────────────────────────────────────────────────
// Legacy exports (temporarily disabled due to strict mode incompatibility)
// ─────────────────────────────────────────────────────────────────
// TODO Phase 9: Fix strict TypeScript errors in legacy files
// TODO Phase 9: Move distribution logic to CLI or dedicated package
// export * from './distribution/command-distributor'
// export * from './distribution/config-pipeline'

// TODO Phase 9: Evaluate if these belong in core or should move to specific apps
// export * from './policies/merge-policy'
// export * from './protection/recursion-guard'
// export * from './hooks/maintenance-hooks'
