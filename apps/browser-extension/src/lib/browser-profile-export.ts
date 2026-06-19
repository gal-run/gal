export interface ExportedLocalStorageEntry {
  name: string;
  value: string;
}

export interface ExportedLocalStorageOrigin {
  origin: string;
  localStorage: ExportedLocalStorageEntry[];
}

interface ChromeCookiesApi {
  getAll(details: chrome.cookies.GetAllDetails): Promise<chrome.cookies.Cookie[]>;
}

interface ChromeScriptingApi {
  executeScript<T>(details: chrome.scripting.ScriptInjection<[], T>): Promise<chrome.scripting.InjectionResult<T>[] | undefined>;
}

/**
 * Derive the registrable/root domain from a hostname.
 * e.g. "app.github.com" → ".github.com", "github.com" → ".github.com"
 */
export function getRootDomain(hostname: string): string {
  const parts = hostname.split(".");
  if (parts.length >= 2) {
    return "." + parts.slice(-2).join(".");
  }
  return "." + hostname;
}

/**
 * Fetch all cookies relevant to the given tab URL using multiple strategies:
 * 1. URL-based query (matches cookies scoped to the full origin)
 * 2. Exact hostname query
 * 3. Root-domain query (e.g. .github.com) — catches subdomain-scoped cookies
 *
 * Results are deduplicated by (name, domain, path).
 */
export async function fetchCookiesForTab(
  tabUrl: string,
  cookiesApi: ChromeCookiesApi = chrome.cookies,
): Promise<chrome.cookies.Cookie[]> {
  const url = new URL(tabUrl);

  const [byUrl, byHostname, byRootDomain] = await Promise.all([
    cookiesApi.getAll({ url: tabUrl }),
    cookiesApi.getAll({ domain: url.hostname }),
    cookiesApi.getAll({ domain: getRootDomain(url.hostname) }),
  ]);

  const seen = new Map<string, chrome.cookies.Cookie>();
  for (const cookie of [...byUrl, ...byHostname, ...byRootDomain]) {
    const key = `${cookie.name}\u0000${cookie.domain}\u0000${cookie.path}`;
    if (!seen.has(key)) {
      seen.set(key, cookie);
    }
  }

  return [...seen.values()];
}

/**
 * Capture current-origin localStorage via the scripting API so auth flows that
 * rely on browser storage rather than cookies can still be replayed by Playwright.
 */
export async function extractLocalStorageForTab(
  tabId: number | undefined,
  scriptingApi: ChromeScriptingApi = chrome.scripting,
): Promise<ExportedLocalStorageOrigin | null> {
  if (!tabId) return null;

  try {
    const results = await scriptingApi.executeScript({
      target: { tabId },
      world: "MAIN",
      func: () => {
        try {
          return {
            origin: window.location.origin,
            localStorage: Object.entries(window.localStorage).map(([name, value]) => ({
              name,
              value,
            })),
          };
        } catch {
          return null;
        }
      },
    });

    const result = results?.[0]?.result;
    if (
      !result ||
      typeof result !== "object" ||
      typeof (result as { origin?: unknown }).origin !== "string" ||
      !Array.isArray((result as { localStorage?: unknown }).localStorage)
    ) {
      return null;
    }

    return {
      origin: (result as { origin: string }).origin,
      localStorage: (result as { localStorage: ExportedLocalStorageEntry[] }).localStorage
        .filter(
          (entry): entry is ExportedLocalStorageEntry =>
            !!entry &&
            typeof entry.name === "string" &&
            typeof entry.value === "string",
        ),
    };
  } catch {
    return null;
  }
}

export function buildPlaywrightStorageState(
  chromeCookies: chrome.cookies.Cookie[],
  localStorageOrigin: ExportedLocalStorageOrigin | null,
): { cookies: Array<Record<string, unknown>>; origins: ExportedLocalStorageOrigin[] } {
  return {
    cookies: chromeCookies.map((cookie) => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expirationDate || -1,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite === "unspecified" ? "None" : cookie.sameSite,
    })),
    origins:
      localStorageOrigin && localStorageOrigin.localStorage.length > 0
        ? [localStorageOrigin]
        : [],
  };
}
