/**
 * Register all collection migrations with the MigrationRegistry.
 *
 * Each collection that may contain legacy documents (created before
 * _schemaVersion tracking) gets a v0 -> v1 identity migration that stamps
 * `_schemaVersion: 1` without altering any other fields.
 *
 * Real data-changing migrations (v1 -> v2, v2 -> v3, etc.) are added
 * below the identity registrations as the schema evolves.
 */
import type { MigrationRegistry } from './MigrationRegistry.js';

/**
 * All root-level collections in the Firestore database.
 */
const ROOT_COLLECTIONS = [
  'organizations',
  'users',
  'sessions',
  'workspaces',
  'workspace_memberships',
  'work_items',
  'config_versions',
  'config_proposals',
  'checkout_sessions',
  'billing_events',
  'coupon_validations',
  'oauth_states',
  'user_providers',
  'invites',
  'fleet_developers',
  'tracked_repos',
  'cli_telemetry',
  'cli_installations',
  'cli_feedback',
] as const;

/**
 * Subcollections under organizations/{orgName}.
 */
const ORG_SUBCOLLECTIONS = [
  'developers',
  'approved-configs',
  'policies',
  'scan_results',
  'cache',
  'team-cache',
  'role-overrides',
  'drift-reports',
  'audit-logs',
] as const;

/**
 * Subcollections under users/{userId}.
 */
const USER_SUBCOLLECTIONS = [
  'credentials',
  'personalGitHub',
  'workspacePreferences',
] as const;

/**
 * Identity migration: stamps `_schemaVersion: 1` on documents that have
 * `_schemaVersion: 0` (explicitly set to 0). The MigrationRegistry already
 * defaults missing `_schemaVersion` to 1, so this only catches edge cases
 * where a document was explicitly set to version 0.
 */
function stampV1(data: Record<string, unknown>): Record<string, unknown> {
  return { ...data, _schemaVersion: 1 };
}

/**
 * Registers all known migrations for every collection.
 *
 * Call this once at application startup after creating a MigrationRegistry
 * instance (typically in the DI container setup).
 */
export function registerAllMigrations(registry: MigrationRegistry): void {
  // ─── Root-level collections ───────────────────────────────────────────
  // Register v0 -> v1 identity migration for all collections except
  // organizations (which has a real v1 -> v2 migration below).
  for (const collection of ROOT_COLLECTIONS) {
    if (collection === 'organizations') continue; // handled below with real migration
    registry.register(collection, 0, stampV1);
  }

  // ─── Org subcollections ───────────────────────────────────────────────
  for (const sub of ORG_SUBCOLLECTIONS) {
    registry.register(sub, 0, stampV1);
  }

  // ─── User subcollections ──────────────────────────────────────────────
  for (const sub of USER_SUBCOLLECTIONS) {
    registry.register(sub, 0, stampV1);
  }

  // ─── Organizations: v0 -> v1 (identity) ───────────────────────────────
  registry.register('organizations', 0, stampV1);

  // ─── Organizations: v1 -> v2 ──────────────────────────────────────────
  // Remove audienceTier string, use audienceTierRef.
  // The eager backfill was performed by:
  //   scripts/migrations/remove-audience-tier-string.ts
  // This lazy migration handles any straggler documents that were not
  // caught by the eager backfill. It simply bumps the version.
  registry.register('organizations', 1, (data) => {
    return { ...data, _schemaVersion: 2 };
  });
}
