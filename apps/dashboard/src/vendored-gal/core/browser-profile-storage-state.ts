export interface BrowserProfileStorageStateCookie {
  name?: string
  domain?: string
  path?: string
  expires?: number | null
  [key: string]: unknown
}

export interface BrowserProfileStorageStateOrigin {
  origin?: string
  localStorage?: unknown[]
  [key: string]: unknown
}

export interface BrowserProfileStorageStateDocument {
  cookies: BrowserProfileStorageStateCookie[]
  origins: BrowserProfileStorageStateOrigin[]
  [key: string]: unknown
}

export interface BrowserProfileStorageStateSummary {
  cookieCount: number
  originCount: number
  inferredDomains: string[]
  earliestExpiry: number | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeDomainCandidate(value: string): string | null {
  const normalized = value.trim().toLowerCase().replace(/^\.+/, '')
  return normalized.length > 0 ? normalized : null
}

function extractHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname
  } catch {
    return null
  }
}

export function normalizeBrowserProfileDomains(domains: Iterable<string>): string[] {
  const normalized = new Set<string>()

  for (const domain of domains) {
    const candidate = normalizeDomainCandidate(domain)
    if (candidate) {
      normalized.add(candidate)
    }
  }

  return [...normalized].sort()
}

export function normalizeBrowserProfileStorageState(
  value: unknown,
): BrowserProfileStorageStateDocument {
  if (!isRecord(value)) {
    throw new Error('storageState must be a JSON object')
  }

  const cookies = value['cookies']
  const origins = value['origins']

  if (cookies !== undefined && !Array.isArray(cookies)) {
    throw new Error('storageState.cookies must be an array when provided')
  }

  if (origins !== undefined && !Array.isArray(origins)) {
    throw new Error('storageState.origins must be an array when provided')
  }

  return {
    ...value,
    cookies: Array.isArray(cookies)
      ? (cookies as BrowserProfileStorageStateCookie[])
      : [],
    origins: Array.isArray(origins)
      ? (origins as BrowserProfileStorageStateOrigin[])
      : [],
  }
}

export function parseBrowserProfileStorageState(
  raw: string,
): BrowserProfileStorageStateDocument {
  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('storageState must be valid JSON')
  }

  return normalizeBrowserProfileStorageState(parsed)
}

export function inferBrowserProfileDomains(
  storageState: BrowserProfileStorageStateDocument,
): string[] {
  const domains: string[] = []

  for (const cookie of storageState.cookies) {
    if (typeof cookie.domain === 'string') {
      domains.push(cookie.domain)
    }
  }

  for (const origin of storageState.origins) {
    if (typeof origin.origin === 'string') {
      const hostname = extractHostname(origin.origin)
      if (hostname) {
        domains.push(hostname)
      }
    }
  }

  return normalizeBrowserProfileDomains(domains)
}

export function summarizeBrowserProfileStorageState(
  storageState: BrowserProfileStorageStateDocument,
): BrowserProfileStorageStateSummary {
  const expiryValues = storageState.cookies
    .map((cookie) => cookie.expires)
    .filter((expiry): expiry is number => typeof expiry === 'number' && expiry > 0)

  return {
    cookieCount: storageState.cookies.length,
    originCount: storageState.origins.length,
    inferredDomains: inferBrowserProfileDomains(storageState),
    earliestExpiry: expiryValues.length > 0 ? Math.min(...expiryValues) : null,
  }
}
