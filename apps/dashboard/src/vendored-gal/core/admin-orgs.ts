/**
 * Centralized ADMIN_ORGS parsing and matching.
 *
 * This module provides the canonical logic for determining whether a GitHub
 * organization is an "admin org" (granting elevated privileges in the GAL
 * platform). Every package in the monorepo should use these helpers instead
 * of rolling its own parsing/comparison.
 *
 * Design decisions:
 * - Each consumer still reads from its own env var (different bundlers need
 *   different prefixes: ADMIN_ORGS, NEXT_PUBLIC_ADMIN_ORGS, VITE_ADMIN_ORGS).
 * - The parser normalises a comma-separated string into a trimmed array.
 * - All comparisons are **case-insensitive** to fix the long-standing CLI bug.
 * - The default list is `["your-org"]` — override via the ADMIN_ORGS env var.
 */

/** The canonical default admin org list. */
export const DEFAULT_ADMIN_ORGS: readonly string[] = ['your-org']

/**
 * Parse a comma-separated admin-orgs string into a trimmed array.
 *
 * @param envValue - Raw value from the environment variable (may be undefined).
 * @returns Parsed array, falling back to {@link DEFAULT_ADMIN_ORGS} when the
 *          input is falsy or contains only whitespace / commas.
 *
 * @example
 * ```ts
 * parseAdminOrgs('Acme , Contoso')  // ['Acme', 'Contoso']
 * parseAdminOrgs(undefined)          // ['your-org']
 * parseAdminOrgs('')                 // ['your-org']
 * ```
 */
export function parseAdminOrgs(envValue: string | undefined): string[] {
  if (!envValue) return [...DEFAULT_ADMIN_ORGS]

  const parsed = envValue
    .split(',')
    .map((org) => org.trim())
    .filter(Boolean)

  return parsed.length > 0 ? parsed : [...DEFAULT_ADMIN_ORGS]
}

/**
 * Case-insensitive check: is `orgName` in the admin-org list?
 *
 * @param orgName   - The organisation name to test.
 * @param adminOrgs - The admin-org list (as returned by {@link parseAdminOrgs}).
 * @returns `true` when `orgName` matches any entry regardless of casing.
 *
 * @example
 * ```ts
 * isAdminOrg('your-org', ['your-org'])  // true
 * isAdminOrg('YOUR-ORG', ['your-org'])  // true
 * isAdminOrg('random-org', ['your-org'])  // false
 * ```
 */
export function isAdminOrg(orgName: string, adminOrgs: readonly string[]): boolean {
  const needle = orgName.toLowerCase()
  return adminOrgs.some((org) => org.toLowerCase() === needle)
}
