import { createBrowserProfile } from "./api";
import {
  buildPlaywrightStorageState,
  extractLocalStorageForTab,
  fetchCookiesForTab,
} from "./browser-profile-export";
import {
  isOptionalHostOrigin,
  originPatternFromUrl,
} from "./host-permissions";

type PermissionsLike = Pick<typeof chrome.permissions, "contains" | "request">;
type RuntimeLike = Pick<typeof chrome.runtime, "getManifest">;
type TabsLike = Pick<typeof chrome.tabs, "get" | "query">;

export async function requestHostPermission(
  url: string,
  deps?: {
    permissionsApi?: PermissionsLike;
  },
): Promise<{ granted: boolean; error?: string }> {
  try {
    const parsedUrl = new URL(url);
    const originPattern = `${parsedUrl.protocol}//${parsedUrl.hostname}/*`;
    const permissionsApi = deps?.permissionsApi ?? chrome.permissions;

    const granted = await permissionsApi.request({
      origins: [originPattern],
    });

    return { granted };
  } catch (error) {
    return {
      granted: false,
      error: error instanceof Error ? error.message : "Permission request failed",
    };
  }
}

export type BrowserProfileTabState =
  | "ready"
  | "needs_cookie_permission"
  | "needs_site_access"
  | "needs_permission_request"
  | "unsupported";

export interface BrowserProfileTabSummary {
  tabId: number;
  title: string;
  url: string;
  hostname: string;
  active: boolean;
  captureState: BrowserProfileTabState;
  reason?: string;
}

export interface BrowserProfileTabInventory {
  cookiesPermissionGranted: boolean;
  tabs: BrowserProfileTabSummary[];
}

export interface BrowserProfileExtraction {
  domain: string;
  suggestedName: string;
  storageState: string;
  cookieCount: number;
  localStorageEntryCount: number;
}

export interface BrowserProfileSaveResult extends BrowserProfileExtraction {
  profileId: string;
  savedName: string;
}

const DASHBOARD_HOSTS = new Set(["app.gal.run"]);

function parseSupportedUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function containsPermission(
  permissions: chrome.permissions.Permissions,
  permissionsApi: PermissionsLike,
): Promise<boolean> {
  try {
    return await permissionsApi.contains(permissions);
  } catch {
    return false;
  }
}

function unsupportedTabSummary(
  tab: chrome.tabs.Tab,
  reason: string,
): BrowserProfileTabSummary | null {
  if (typeof tab.id !== "number" || typeof tab.url !== "string") {
    return null;
  }

  return {
    tabId: tab.id,
    title: tab.title || tab.url,
    url: tab.url,
    hostname: parseSupportedUrl(tab.url)?.hostname || "unknown",
    active: Boolean(tab.active),
    captureState: "unsupported",
    reason,
  };
}

export async function diagnoseMissingBrowserAuth(
  tabUrl: string,
  deps?: {
    permissionsApi?: PermissionsLike;
  },
): Promise<string> {
  try {
    const url = new URL(tabUrl);
    const permissionsApi = deps?.permissionsApi ?? chrome.permissions;

    const hasPermission = await permissionsApi.contains({
      origins: [`${url.protocol}//${url.hostname}/*`],
    });

    if (!hasPermission) {
      return `Permission not granted for ${url.hostname}. Approve site access in the extension popup and retry.`;
    }

    if (url.protocol === "chrome:" || url.protocol === "chrome-extension:") {
      return "Cannot scan browser internal pages. Navigate to the website you want to save auth for.";
    }

    const cookiesPermissionGranted = await containsPermission(
      { permissions: ["cookies"] },
      permissionsApi,
    );

    if (!cookiesPermissionGranted) {
      return `No local storage auth data was found for ${url.hostname}, and cookie access is not granted yet. Open the GAL extension popup once to allow cookie capture, then retry.`;
    }

    return `No cookies or local storage auth data found for ${url.hostname}. Make sure you are logged in on this site.`;
  } catch {
    return "Could not determine reason — ensure you are logged in and on a supported page.";
  }
}

export async function describeBrowserProfileTab(
  tab: chrome.tabs.Tab,
  deps?: {
    permissionsApi?: PermissionsLike;
    runtime?: RuntimeLike;
  },
): Promise<BrowserProfileTabSummary | null> {
  if (typeof tab.id !== "number" || typeof tab.url !== "string") {
    return null;
  }

  const parsedUrl = parseSupportedUrl(tab.url);
  if (!parsedUrl) {
    return unsupportedTabSummary(
      tab,
      "Open a normal website tab before trying to capture browser auth.",
    );
  }

  if (DASHBOARD_HOSTS.has(parsedUrl.hostname)) {
    return unsupportedTabSummary(
      tab,
      "Open the logged-in site you want agents to use, not the GAL dashboard tab.",
    );
  }

  const permissionsApi = deps?.permissionsApi ?? chrome.permissions;
  const runtime = deps?.runtime ?? chrome.runtime;
  const manifest = runtime.getManifest();
  const originPattern = originPatternFromUrl(tab.url);

  // Check if we already have permission for this host
  const existingPermission = await containsPermission(
    { origins: [`${parsedUrl.protocol}//${parsedUrl.hostname}/*`] },
    permissionsApi,
  );

  if (existingPermission) {
    return {
      tabId: tab.id,
      title: tab.title || parsedUrl.hostname,
      url: tab.url,
      hostname: parsedUrl.hostname,
      active: Boolean(tab.active),
      captureState: "ready",
      reason: (await containsPermission({ permissions: ["cookies"] }, permissionsApi))
        ? undefined
        : `Cookie access has not been granted yet. Direct capture can still save local-storage auth for ${parsedUrl.hostname}, but cookie-backed sessions may require opening the extension popup once.`,
    };
  }

  // Host is in manifest's optional_host_permissions - can request access
  if (originPattern && isOptionalHostOrigin(manifest, originPattern)) {
    return {
      tabId: tab.id,
      title: tab.title || parsedUrl.hostname,
      url: tab.url,
      hostname: parsedUrl.hostname,
      active: Boolean(tab.active),
      captureState: "needs_site_access",
      reason: `Site access for ${parsedUrl.hostname} has not been granted yet. Click "Grant Access" to enable browser auth capture for this site.`,
    };
  }

  // Host is NOT in manifest - we can still request permission dynamically
  // This allows capturing from ANY website without manifest changes
  return {
    tabId: tab.id,
    title: tab.title || parsedUrl.hostname,
    url: tab.url,
    hostname: parsedUrl.hostname,
    active: Boolean(tab.active),
    captureState: "needs_permission_request",
    reason: `GAL needs permission to capture auth from ${parsedUrl.hostname}. Click "Grant Access" to allow.`,
  };
}

export async function listCapturableBrowserProfileTabs(deps?: {
  permissionsApi?: PermissionsLike;
  runtime?: RuntimeLike;
  tabsApi?: TabsLike;
}): Promise<BrowserProfileTabInventory> {
  const permissionsApi = deps?.permissionsApi ?? chrome.permissions;
  const tabsApi = deps?.tabsApi ?? chrome.tabs;
  const cookiesPermissionGranted = await containsPermission(
    { permissions: ["cookies"] },
    permissionsApi,
  );

  const tabs = await tabsApi.query({ currentWindow: true });
  const summaries = (
    await Promise.all(
      tabs.map((tab) =>
        describeBrowserProfileTab(tab, {
          permissionsApi,
          runtime: deps?.runtime,
        }),
      ),
    )
  ).filter((summary): summary is BrowserProfileTabSummary => summary !== null);

  const statePriority: Record<BrowserProfileTabState, number> = {
    ready: 0,
    needs_site_access: 1,
    needs_permission_request: 2,
    needs_cookie_permission: 3,
    unsupported: 4,
  };

  summaries.sort((left, right) => {
    const stateDelta = statePriority[left.captureState] - statePriority[right.captureState];
    if (stateDelta !== 0) return stateDelta;
    if (left.active !== right.active) return left.active ? -1 : 1;
    return left.hostname.localeCompare(right.hostname);
  });

  return {
    cookiesPermissionGranted,
    tabs: summaries,
  };
}

export async function extractBrowserProfileFromTab(
  tab: chrome.tabs.Tab,
  deps?: {
    permissionsApi?: PermissionsLike;
  },
): Promise<BrowserProfileExtraction> {
  if (typeof tab.id !== "number" || typeof tab.url !== "string") {
    throw new Error("No capturable browser tab was provided.");
  }

  const parsedUrl = parseSupportedUrl(tab.url);
  if (!parsedUrl) {
    throw new Error("Open a normal website tab before trying to capture browser auth.");
  }

  const permissionsApi = deps?.permissionsApi ?? chrome.permissions;
  const cookiesPermissionGranted = await containsPermission(
    { permissions: ["cookies"] },
    permissionsApi,
  );

  const chromeCookies = cookiesPermissionGranted
    ? await fetchCookiesForTab(tab.url)
    : [];
  const localStorageOrigin = await extractLocalStorageForTab(tab.id);
  const localStorageEntryCount = localStorageOrigin?.localStorage.length ?? 0;

  if (chromeCookies.length === 0 && localStorageEntryCount === 0) {
    throw new Error(
      await diagnoseMissingBrowserAuth(tab.url, {
        permissionsApi,
      }),
    );
  }

  return {
    domain: parsedUrl.hostname,
    suggestedName: parsedUrl.hostname.replace(/^www\./, ""),
    storageState: JSON.stringify(
      buildPlaywrightStorageState(chromeCookies, localStorageOrigin),
    ),
    cookieCount: chromeCookies.length,
    localStorageEntryCount,
  };
}

export async function saveBrowserProfileFromTab(
  tabId: number,
  profileName?: string,
  deps?: {
    permissionsApi?: PermissionsLike;
    runtime?: RuntimeLike;
    tabsApi?: TabsLike;
  },
): Promise<BrowserProfileSaveResult> {
  const tabsApi = deps?.tabsApi ?? chrome.tabs;
  const permissionsApi = deps?.permissionsApi ?? chrome.permissions;
  const tab = await tabsApi.get(tabId);
  const summary = await describeBrowserProfileTab(tab, deps);

  if (!summary) {
    throw new Error("The selected browser tab is no longer available.");
  }

  // Handle needs_permission_request - request permission dynamically
  if (summary.captureState === "needs_permission_request") {
    const permResult = await requestHostPermission(summary.url, { permissionsApi });
    if (!permResult.granted) {
      throw new Error(
        permResult.error || `Permission denied for ${summary.hostname}. Cannot capture browser auth.`
      );
    }
    // Permission granted, continue to capture
  }

  // Handle needs_site_access - same as before
  if (summary.captureState === "needs_site_access") {
    const permResult = await requestHostPermission(summary.url, { permissionsApi });
    if (!permResult.granted) {
      throw new Error(
        permResult.error || `Permission denied for ${summary.hostname}. Cannot capture browser auth.`
      );
    }
    // Permission granted, continue to capture
  }

  if (
    summary.captureState !== "ready" &&
    summary.captureState !== "needs_cookie_permission" &&
    summary.captureState !== "needs_permission_request" &&
    summary.captureState !== "needs_site_access"
  ) {
    throw new Error(summary.reason || "This tab is not ready for browser auth capture.");
  }

  const extraction = await extractBrowserProfileFromTab(tab, {
    permissionsApi: deps?.permissionsApi,
  });
  const savedName = profileName?.trim() || extraction.suggestedName;
  const result = await createBrowserProfile({
    name: savedName,
    domains: [extraction.domain],
    storageState: extraction.storageState,
  });

  if (!result.success || !result.id) {
    throw new Error(result.error || "Failed to upload profile");
  }

  return {
    ...extraction,
    profileId: result.id,
    savedName,
  };
}
