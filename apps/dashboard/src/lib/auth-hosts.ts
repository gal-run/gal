/**
 * Host allowlists for browser auth fallbacks.
 *
 * Production dashboard traffic should stay cookie-only. Bearer-token fallback
 * is only allowed on explicit local/preview hosts where third-party cookies
 * are known to be unreliable.
 */

const LOCAL_FALLBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1'])
const TRUSTED_PREVIEW_SUFFIXES = ['.web.app', '.firebaseapp.com']
const GAL_RUN_SUFFIX = '.gal.run'

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase()
}

/**
 * Returns true for the dashboard hosts that should never use bearer fallback.
 */
export function isGalRunHost(hostname: string): boolean {
  const normalized = normalizeHost(hostname)
  return normalized === 'gal.run' || normalized.endsWith(GAL_RUN_SUFFIX)
}

/**
 * Returns true when the host is an explicit local/preview deployment.
 */
export function isTrustedBearerFallbackHost(hostname: string): boolean {
  const normalized = normalizeHost(hostname)

  if (!normalized) return false
  if (LOCAL_FALLBACK_HOSTS.has(normalized)) return true

  return TRUSTED_PREVIEW_SUFFIXES.some((suffix) => normalized.endsWith(suffix))
}

/**
 * Returns true when the dashboard should send or accept a bearer fallback.
 *
 * Same-origin requests stay cookie-only. First-party gal.run production hosts
 * also stay cookie-only even when app and API are on different origins.
 */
export function shouldUseBrowserBearerFallback(
  appOrigin: string,
  apiOrigin: string,
): boolean {
  try {
    const appUrl = new URL(appOrigin)
    const apiUrl = new URL(apiOrigin)

    if (appUrl.origin === apiUrl.origin) return false
    if (isGalRunHost(appUrl.hostname) && isGalRunHost(apiUrl.hostname)) {
      return false
    }

    return isTrustedBearerFallbackHost(appUrl.hostname)
  } catch {
    return false
  }
}
