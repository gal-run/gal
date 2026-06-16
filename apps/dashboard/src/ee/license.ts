/**
 * GAL Enterprise (EE) license gate.
 *
 * Mirrors the existing demo-guard env-flag pattern (see src/lib/demo-guard.ts):
 * a single, memoized boolean derived from an environment variable that the rest
 * of the app branches on.
 *
 * The DEFAULT build (no license key present) runs as a single-tenant, fully
 * Apache-2.0 application. Setting a GAL Enterprise license key unlocks the
 * source-visible EE surface under `src/ee/**` (multi-tenant workspaces, team /
 * org membership, billing, managed agents, rate-cards, the cross-org repository
 * layer, and internal billing analytics).
 *
 * Env vars:
 *   - GAL_EE_LICENSE_KEY             — server-side checks (route handlers, RSC).
 *   - NEXT_PUBLIC_GAL_EE_LICENSE_KEY — client-side checks (nav rendering, providers).
 *
 * Both are accepted; either one being a validly-formatted key enables EE. The
 * NEXT_PUBLIC_* variant is required for client components (nav, providers) since
 * non-prefixed env vars are not exposed to the browser bundle by Next.js.
 *
 * TODO(prod): replace this format-only check with signed-key verification
 * (jose JWT / ed25519 signature, expiry, and feature claims). See Langfuse's
 * `ee/getLicenseKey` + license validation for the reference pattern. This
 * template intentionally ships a presence + basic-format check ONLY so the
 * open-source build is honest about what it does (no real key, no real crypto).
 */

/**
 * Accepted license-key shape for the template:
 *   gal-ee-<>=16 url-safe base64-ish chars>
 * e.g. gal-ee-AbCdEf0123456789xyz
 */
const EE_KEY_PATTERN = /^gal-ee-[A-Za-z0-9_-]{16,}$/

function readRawKey(): string | undefined {
  // Prefer the server var; fall back to the public var (needed in the browser).
  return (
    process.env['GAL_EE_LICENSE_KEY'] ||
    process.env['NEXT_PUBLIC_GAL_EE_LICENSE_KEY'] ||
    undefined
  )
}

let memoized: boolean | undefined

/**
 * Returns true when a validly-formatted GAL Enterprise license key is present.
 *
 * Memoized after first evaluation. Safe to call from both server and client
 * code; on the client only NEXT_PUBLIC_GAL_EE_LICENSE_KEY is visible.
 */
export function isEeEnabled(): boolean {
  if (memoized !== undefined) return memoized
  const key = readRawKey()
  memoized = typeof key === 'string' && EE_KEY_PATTERN.test(key.trim())
  return memoized
}

/**
 * Test-only: reset the memoized result so tests can flip the env var.
 * Not used in production code paths.
 */
export function __resetEeLicenseCacheForTests(): void {
  memoized = undefined
}
