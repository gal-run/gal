import { useState, useEffect, useCallback, useRef } from "react";
import {
  LogOut,
  RefreshCw,
  ExternalLink,
  AlertTriangle,
  Loader2,
  Clipboard,
  Download,
  Upload,
  X,
  Copy,
  Check,
} from "lucide-react";
import {
  getClipboardEntries,
  type ClipboardEntry,
} from "../content/asset-clipboard";
import { LoginView } from "../components/LoginView";
import { CommandList } from "../components/CommandList";
import { WorkspaceSwitcher } from "../components/WorkspaceSwitcher";
import { SyncStatusLine } from "../components/SyncStatusCard";
import { CookieExportCard } from "../components/CookieExportCard";
import { ServiceDegradationBanner } from "../components/ServiceDegradationBanner";
import { trackEvent, initTelemetry } from "../lib/telemetry";
import {
  isOptionalHostOrigin,
  originPatternFromUrl,
} from "../lib/host-permissions";

// Initialize telemetry for popup context (non-blocking)
initTelemetry();
import {
  checkAuthStatus,
  getOrganizations,
  getApprovedConfig,
  getSyncPreflightHint,
  recordGovernanceOverride,
  detectPlatform,
  triggerScan,
  getScanProgress,
  getDiscoveredConfigs,
  logout,
  type Command,
  type SyncStatus,
  type ApprovedConfig,
  type SyncCopilotHintResponse,
  type User,
  type Organization,
  type AuthStatus,
  type ScanProgress,
} from "../lib/api";
import {
  getStorageData,
  setStorageData,
  getSessionData,
  getCacheEntry,
  setCacheEntry,
  isCacheStale,
  getScanResult,
  checkStorageUsage,
  getSyncPreference,
  setSyncPreference,
  type ActiveGptInfo,
  type ActiveGemInfo,
  type PlatformScanResult,
} from "../lib/storage";
import type { ActiveDesignProjectSummary } from "@gal/types";

/** Format a date string or timestamp (ms) as a relative time (e.g., "5m ago", "2h ago") */
function formatRelativeTime(dateStr: string | number): string {
  try {
    const date =
      typeof dateStr === "number" ? new Date(dateStr) : new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHr / 24);

    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return String(dateStr);
  }
}

/**
 * Don't fire REFRESH_COMMANDS to the service worker if it already prefetched
 * within this window. Prevents redundant API calls on popup open.
 */
const SW_PREFETCH_DEDUP_MS = 30_000; // 30 seconds

async function shouldSendRefreshCommands(): Promise<boolean> {
  try {
    const result = await chrome.storage.local.get("lastSwPrefetchTimestamp");
    const lastTs = result.lastSwPrefetchTimestamp as number | undefined;
    if (lastTs && Date.now() - lastTs < SW_PREFETCH_DEDUP_MS) {
      return false; // SW already prefetched recently — skip
    }
  } catch {
    // Storage read failed — allow the refresh
  }
  return true;
}

/** Platform display names for the context badge */
const PLATFORM_LABELS: Record<string, string> = {
  claude: "Claude",
  chatgpt: "ChatGPT",
  "codex-cloud": "Codex Cloud",
  gemini: "Gemini",
  copilot: "Copilot",
  midjourney: "Midjourney",
  ideogram: "Ideogram",
  leonardo: "Leonardo",
  runway: "Runway",
  pika: "Pika",
  kling: "Kling AI",
};

export function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string | null>(null);
  const [commands, setCommands] = useState<Command[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  // approvedConfig is not displayed directly but used to derive sync status and commands
  const [, setApprovedConfig] = useState<ApprovedConfig | null>(null);
  const [syncHint, setSyncHint] = useState<SyncCopilotHintResponse | null>(
    null,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeGpt, setActiveGpt] = useState<ActiveGptInfo | null>(null);
  const [activeGem, setActiveGem] = useState<ActiveGemInfo | null>(null);
  const [activePlatform, setActivePlatform] = useState<string | null>(null);
  const [activeTabUrl, setActiveTabUrl] = useState<string | null>(null);
  const [optionalHostPermissionOrigin, setOptionalHostPermissionOrigin] =
    useState<string | null>(null);
  const [optionalHostPermissionNeeded, setOptionalHostPermissionNeeded] =
    useState(false);
  const [optionalHostPermissionError, setOptionalHostPermissionError] =
    useState<string | null>(null);

  // Active run-design project
  const [activeDesignProject, setActiveDesignProject] =
    useState<ActiveDesignProjectSummary | null>(null);

  // Scan state
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<string | number | null>(null);
  const [scanFreshnessLoaded, setScanFreshnessLoaded] = useState(false);

  // Platform scan state (GPTs / Gems from content script)
  const [platformScanChatgpt, setPlatformScanChatgpt] =
    useState<PlatformScanResult | null>(null);
  const [platformScanGemini, setPlatformScanGemini] =
    useState<PlatformScanResult | null>(null);

  // Storage quota warning
  const [storageWarning, setStorageWarning] = useState<string | null>(null);

  // Asset clipboard state
  const [activeTab, setActiveTab] = useState<"workflows" | "clipboard">(
    "workflows",
  );
  const [clipboardEntries, setClipboardEntries] = useState<ClipboardEntry[]>(
    [],
  );
  const [clipboardLoaded, setClipboardLoaded] = useState(false);
  const [transferringId, setTransferringId] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [copiedImageId, setCopiedImageId] = useState<string | null>(null);

  // In-field button visibility preference
  const [inFieldButtonDisabled, setInFieldButtonDisabled] = useState(false);

  // Refs for scan management
  const isScanningRef = useRef(false);
  const scanGenRef = useRef(0);
  const orgNameRef = useRef(selectedOrg);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track whether initial cache restore is done to prevent double-loads
  const cacheRestoredRef = useRef(false);
  // Track if org selection was restored from cache to prevent re-triggering loadCommands
  const orgRestoredFromCacheRef = useRef(false);

  const refreshActiveTabContext = useCallback(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url ?? null;
      setActiveTabUrl(url);
      setActivePlatform(url ? detectPlatform(url) : null);
    });
  }, []);

  // ---- Detect active platform + URL from current tab ----
  useEffect(() => {
    refreshActiveTabContext();
  }, [refreshActiveTabContext]);

  // ---- Load in-field button preference from chrome.storage.sync ----
  useEffect(() => {
    getSyncPreference("inFieldButtonDisabled").then((val) => {
      setInFieldButtonDisabled(val === true);
    });
    // Listen for changes (e.g. toggled from tooltip in content script)
    const handleSyncChange = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (
        Object.prototype.hasOwnProperty.call(changes, "inFieldButtonDisabled")
      ) {
        setInFieldButtonDisabled(
          changes.inFieldButtonDisabled.newValue === true,
        );
      }
    };
    chrome.storage.sync.onChanged.addListener(handleSyncChange);
    return () => {
      chrome.storage.sync.onChanged.removeListener(handleSyncChange);
    };
  }, []);

  // ---- Listen for PLATFORM_CONTEXT_CHANGED from content script (SPA navigation) ----
  useEffect(() => {
    const handlePlatformChange = (message: {
      type: string;
      platform?: string;
    }) => {
      if (message.type === "PLATFORM_CONTEXT_CHANGED") {
        if (message.platform) {
          setActivePlatform(message.platform);
        }
        refreshActiveTabContext();
      }
    };
    chrome.runtime.onMessage.addListener(handlePlatformChange);
    return () => {
      chrome.runtime.onMessage.removeListener(handlePlatformChange);
    };
  }, [refreshActiveTabContext]);

  // ---- Optional host-permission awareness for lower-frequency platforms ----
  useEffect(() => {
    let cancelled = false;

    const checkOptionalHostPermission = async () => {
      setOptionalHostPermissionError(null);

      if (!activeTabUrl) {
        setOptionalHostPermissionOrigin(null);
        setOptionalHostPermissionNeeded(false);
        return;
      }

      const originPattern = originPatternFromUrl(activeTabUrl);
      if (!originPattern) {
        setOptionalHostPermissionOrigin(null);
        setOptionalHostPermissionNeeded(false);
        return;
      }

      const manifest = chrome.runtime.getManifest();
      if (!isOptionalHostOrigin(manifest, originPattern)) {
        setOptionalHostPermissionOrigin(null);
        setOptionalHostPermissionNeeded(false);
        return;
      }

      setOptionalHostPermissionOrigin(originPattern);
      try {
        const granted = await chrome.permissions.contains({
          origins: [originPattern],
        });
        if (cancelled) return;
        setOptionalHostPermissionNeeded(!granted);
      } catch {
        if (cancelled) return;
        setOptionalHostPermissionNeeded(true);
      }
    };

    checkOptionalHostPermission();
    return () => {
      cancelled = true;
    };
  }, [activeTabUrl]);

  // Track popup opened
  useEffect(() => {
    trackEvent("extension.popup_opened");
  }, []);

  // ---- Cache-first initialization ----
  // Restore cached state instantly on mount, then revalidate in background.
  // If auth completed while the popup was closed, pick up the result
  // instead of blindly clearing the signals.
  useEffect(() => {
    const initAuth = async () => {
      const state = await chrome.storage.local.get([
        "galAuthComplete",
        "galAuthError",
      ]);
      if (state.galAuthComplete) {
        // Auth completed while popup was closed — pick up the result
        handleLoginSuccess();
      } else {
        // Only clear error signals; don't wipe a potentially in-progress auth
        chrome.storage.local.remove(["galAuthError"]);
      }
      restoreFromCacheAndRevalidate();
    };
    initAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Listen for cachedCommands updates from service worker ----
  // The service worker is the sole writer to cachedCommands.
  // When it updates the cache, the popup picks up the new commands here.
  useEffect(() => {
    const handleCmdCacheChange = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (!Object.prototype.hasOwnProperty.call(changes, "cachedCommands"))
        return;
      const org = selectedOrg;
      if (!org) return;
      try {
        const newRaw = changes.cachedCommands.newValue as string | undefined;
        if (newRaw) {
          const newCache = JSON.parse(newRaw) as Record<string, Command[]>;
          if (newCache[org]) {
            setCommands(newCache[org]);
          }
        }
      } catch {
        // Ignore parse errors
      }
    };
    chrome.storage.local.onChanged.addListener(handleCmdCacheChange);
    return () =>
      chrome.storage.local.onChanged.removeListener(handleCmdCacheChange);
  }, [selectedOrg]);

  // ---- Active GPT detection (chatgpt.com/g/{id} pages) ----
  useEffect(() => {
    // Load initial GPT state from storage
    const loadGpt = async () => {
      const raw = await getSessionData("activeGpt");
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as ActiveGptInfo | null;
          setActiveGpt(parsed);
        } catch {
          setActiveGpt(null);
        }
      }
    };
    loadGpt();

    // Listen for GPT_DETECTED messages from content script
    const handleMessage = (message: {
      type: string;
      gptInfo?: ActiveGptInfo;
    }) => {
      if (message.type === "GPT_DETECTED") {
        setActiveGpt(message.gptInfo ?? null);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);

    // Also listen for session storage changes (in case popup opened after detection)
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (Object.prototype.hasOwnProperty.call(changes, "activeGpt")) {
        const raw = changes.activeGpt?.newValue as string | undefined;
        if (raw) {
          try {
            setActiveGpt(JSON.parse(raw) as ActiveGptInfo | null);
          } catch {
            setActiveGpt(null);
          }
        } else {
          setActiveGpt(null);
        }
      }
    };
    chrome.storage.session.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.storage.session.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // ---- Active Gem detection (gemini.google.com/gem/{id} pages) ----
  useEffect(() => {
    // Load initial Gem state from storage
    const loadGem = async () => {
      const raw = await getSessionData("activeGem");
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as ActiveGemInfo | null;
          setActiveGem(parsed);
        } catch {
          setActiveGem(null);
        }
      }
    };
    loadGem();

    // Listen for GEM_DETECTED messages from content script
    const handleMessage = (message: {
      type: string;
      gemInfo?: ActiveGemInfo;
    }) => {
      if (message.type === "GEM_DETECTED") {
        setActiveGem(message.gemInfo ?? null);
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);

    // Also listen for storage changes (in case popup opened after detection)
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (Object.prototype.hasOwnProperty.call(changes, "activeGem")) {
        const raw = changes.activeGem?.newValue as string | undefined;
        if (raw) {
          try {
            setActiveGem(JSON.parse(raw) as ActiveGemInfo | null);
          } catch {
            setActiveGem(null);
          }
        } else {
          setActiveGem(null);
        }
      }
    };
    chrome.storage.session.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
      chrome.storage.session.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // ---- Platform scan results (GPTs / Gems from content script) ----
  useEffect(() => {
    // Load stored scan results on mount
    const loadScans = async () => {
      const chatgpt = await getScanResult("chatgpt");
      const gemini = await getScanResult("gemini");
      setPlatformScanChatgpt(chatgpt);
      setPlatformScanGemini(gemini);

      // Derive lastScanAt from the most recent platform scan if no server scan exists
      const timestamps = [chatgpt?.scannedAt, gemini?.scannedAt].filter(
        (t): t is number => typeof t === "number",
      );
      if (timestamps.length > 0) {
        const mostRecent = Math.max(...timestamps);
        setLastScanAt((prev) => {
          // Only update if there's no server-side scan data yet
          if (!prev) return mostRecent;
          return prev;
        });
      }
    };
    loadScans();

    // Listen for SCAN_COMPLETE from content script
    const handleScanComplete = (message: {
      type: string;
      platform?: string;
    }) => {
      if (message.type === "SCAN_COMPLETE") {
        const reloadPlatform = async (platform: "chatgpt" | "gemini") => {
          const result = await getScanResult(platform);
          if (platform === "chatgpt") setPlatformScanChatgpt(result);
          else setPlatformScanGemini(result);
        };
        if (message.platform === "chatgpt" || message.platform === "gemini") {
          reloadPlatform(message.platform);
        }
      }
    };
    chrome.runtime.onMessage.addListener(handleScanComplete);

    // Listen for storage changes (in case content script writes while popup is open)
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      const reparse = (raw: string | undefined): PlatformScanResult | null => {
        if (!raw) return null;
        try {
          return JSON.parse(raw) as PlatformScanResult;
        } catch {
          return null;
        }
      };
      if (Object.prototype.hasOwnProperty.call(changes, "scan_chatgpt")) {
        setPlatformScanChatgpt(
          reparse(changes.scan_chatgpt?.newValue as string | undefined),
        );
      }
      if (Object.prototype.hasOwnProperty.call(changes, "scan_gemini")) {
        setPlatformScanGemini(
          reparse(changes.scan_gemini?.newValue as string | undefined),
        );
      }
    };
    chrome.storage.local.onChanged.addListener(handleStorageChange);

    return () => {
      chrome.runtime.onMessage.removeListener(handleScanComplete);
      chrome.storage.local.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // ---- Active run-design project ----
  useEffect(() => {
    const loadDesignProject = async () => {
      const raw = await getStorageData("activeDesignProject");
      if (raw) {
        try {
          setActiveDesignProject(
            JSON.parse(raw) as ActiveDesignProjectSummary | null,
          );
        } catch {
          setActiveDesignProject(null);
        }
      }
    };
    loadDesignProject();

    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (
        Object.prototype.hasOwnProperty.call(changes, "activeDesignProject")
      ) {
        const raw = changes.activeDesignProject?.newValue as string | undefined;
        if (raw) {
          try {
            setActiveDesignProject(
              JSON.parse(raw) as ActiveDesignProjectSummary | null,
            );
          } catch {
            setActiveDesignProject(null);
          }
        } else {
          setActiveDesignProject(null);
        }
      }
    };
    chrome.storage.local.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.local.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // ---- Storage quota warning ----
  useEffect(() => {
    // Load any existing warning on mount
    const loadWarning = async () => {
      const warning = await getStorageData("storageWarning");
      setStorageWarning(warning ?? null);
    };
    loadWarning();
    // Also trigger a fresh check
    checkStorageUsage()
      .then((usage) => {
        setStorageWarning(usage.warning);
      })
      .catch(() => {});

    // Listen for storage warning changes
    const handleWarningChange = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (Object.prototype.hasOwnProperty.call(changes, "storageWarning")) {
        const val = changes.storageWarning?.newValue as string | undefined;
        setStorageWarning(val ?? null);
      }
    };
    chrome.storage.local.onChanged.addListener(handleWarningChange);
    return () => {
      chrome.storage.local.onChanged.removeListener(handleWarningChange);
    };
  }, []);

  // ---- Asset Clipboard: load entries and watch for changes ----
  useEffect(() => {
    const loadEntries = async () => {
      const entries = await getClipboardEntries();
      setClipboardEntries(entries);
      setClipboardLoaded(true);
    };
    loadEntries();

    // Watch for storage changes (content script writes new captures)
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (Object.prototype.hasOwnProperty.call(changes, "galAssetClipboard")) {
        const raw = changes.galAssetClipboard?.newValue as string | undefined;
        if (raw) {
          try {
            setClipboardEntries(JSON.parse(raw) as ClipboardEntry[]);
          } catch {
            setClipboardEntries([]);
          }
        } else {
          setClipboardEntries([]);
        }
      }
    };
    chrome.storage.local.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.local.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Keep orgNameRef in sync
  useEffect(() => {
    orgNameRef.current = selectedOrg;
  }, [selectedOrg]);

  // Clean up scan intervals/timeouts on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (checkIntervalRef.current !== null) {
        clearInterval(checkIntervalRef.current);
        checkIntervalRef.current = null;
      }
      if (safetyTimeoutRef.current !== null) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
      isScanningRef.current = false;
    };
  }, []);

  /**
   * Core initialization: restores cached data for instant display,
   * then kicks off background revalidation for freshness.
   */
  const restoreFromCacheAndRevalidate = useCallback(async () => {
    // Step 1: Try to restore auth status from cache
    const cachedAuth = await getCacheEntry<AuthStatus>(
      "cachedAuthStatus",
      "cachedAuthStatusTimestamp",
    );

    if (cachedAuth && cachedAuth.data.authenticated) {
      // Cache hit -- mark as restored so the isAuthenticated effect skips
      cacheRestoredRef.current = true;

      // Instantly show authenticated state from cache
      setIsAuthenticated(true);
      setUser(cachedAuth.data.user);

      // Step 2: Restore organizations from cache
      const cachedOrgs = await getCacheEntry<Organization[]>(
        "cachedOrganizations",
        "cachedOrganizationsTimestamp",
      );

      let resolvedOrg: string | null = null;

      if (cachedOrgs) {
        setOrganizations(cachedOrgs.data);

        // Step 3: Restore selected org
        const savedOrg = await getStorageData("selectedOrg");
        resolvedOrg =
          savedOrg && cachedOrgs.data.some((o) => o.name === savedOrg)
            ? savedOrg
            : cachedOrgs.data[0]?.name || null;

        if (resolvedOrg) {
          setSelectedOrg(resolvedOrg);
          orgRestoredFromCacheRef.current = true;

          // Step 4: Restore commands from cache for selected org
          const cachedCmds = await getCacheEntry<Record<string, Command[]>>(
            "cachedCommands",
            "cachedCommandsTimestamp",
          );
          if (cachedCmds && cachedCmds.data[resolvedOrg]) {
            setCommands(cachedCmds.data[resolvedOrg]);
          }

          // Step 5: Restore sync hint from cache for selected org
          const cachedHint = await getCacheEntry<
            Record<string, SyncCopilotHintResponse>
          >("cachedSyncHint", "cachedSyncHintTimestamp");
          if (cachedHint && cachedHint.data[resolvedOrg]) {
            setSyncHint(cachedHint.data[resolvedOrg]);
          }

          // Step 6: Restore sync status from cache for selected org
          const cachedSyncStatus = await getCacheEntry<
            Record<string, SyncStatus>
          >("cachedSyncStatus", "cachedSyncStatusTimestamp");
          if (cachedSyncStatus && cachedSyncStatus.data[resolvedOrg]) {
            setSyncStatus(cachedSyncStatus.data[resolvedOrg]);
          }
        }
      }

      // Done restoring -- hide spinner immediately
      setIsLoading(false);

      // Background revalidation: refresh stale data without blocking UI
      revalidateInBackground(cachedAuth, cachedOrgs, resolvedOrg);
    } else {
      // No valid cache -- ensure cacheRestoredRef is false so the
      // isAuthenticated effect can trigger loadOrganizationsFromNetwork
      cacheRestoredRef.current = false;
      // Fall back to network-first auth check
      await checkAuthFromNetwork();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Revalidate cached data in the background. Stale entries are refreshed
   * without showing a loading spinner.
   */
  const revalidateInBackground = useCallback(
    async (
      cachedAuth: { data: AuthStatus; timestamp: number } | null,
      cachedOrgs: { data: Organization[]; timestamp: number } | null,
      currentOrg: string | null,
    ) => {
      try {
        // Revalidate auth if stale
        if (!cachedAuth || isCacheStale(cachedAuth.timestamp)) {
          const freshAuth = await checkAuthStatus();
          await setCacheEntry<AuthStatus>(
            "cachedAuthStatus",
            "cachedAuthStatusTimestamp",
            freshAuth,
          );

          if (!freshAuth.authenticated) {
            // Session expired -- force re-login
            setIsAuthenticated(false);
            setUser(null);
            setOrganizations([]);
            setSelectedOrg(null);
            setCommands([]);
            return;
          }
          setUser(freshAuth.user);
        }

        // Revalidate orgs if stale
        if (!cachedOrgs || isCacheStale(cachedOrgs.timestamp)) {
          const freshOrgs = await getOrganizations();
          await setCacheEntry<Organization[]>(
            "cachedOrganizations",
            "cachedOrganizationsTimestamp",
            freshOrgs,
          );
          setOrganizations(freshOrgs);

          // If current selected org no longer exists, switch to first
          if (
            currentOrg &&
            !freshOrgs.some((o) => o.name === currentOrg) &&
            freshOrgs.length > 0
          ) {
            setSelectedOrg(freshOrgs[0].name);
          }
        }

        // Revalidate commands (and sync status) for selected org if stale.
        // Commands are delegated to the service worker (single-writer).
        // syncStatus is also checked — loadOrgDataFromNetwork derives it.
        if (currentOrg) {
          const cachedCmds = await getCacheEntry<Record<string, Command[]>>(
            "cachedCommands",
            "cachedCommandsTimestamp",
          );
          const cachedSync = await getCacheEntry<Record<string, SyncStatus>>(
            "cachedSyncStatus",
            "cachedSyncStatusTimestamp",
          );
          const cmdStale = !cachedCmds || isCacheStale(cachedCmds.timestamp);
          const syncMissing =
            !cachedSync ||
            !cachedSync.data[currentOrg] ||
            isCacheStale(cachedSync.timestamp);

          if (cmdStale && (await shouldSendRefreshCommands())) {
            chrome.runtime
              .sendMessage({ type: "REFRESH_COMMANDS", orgName: currentOrg })
              .catch(() => {});
          }
          if (cmdStale || syncMissing) {
            await loadOrgDataFromNetwork(currentOrg, false);
          }
        }
      } catch (error) {
        // Background revalidation errors are non-fatal -- cached data is still shown
        console.error("Background revalidation error:", error);
      }
    },
    [],
  );

  /**
   * Network-first auth check (used when no cache exists).
   */
  const checkAuthFromNetwork = useCallback(async () => {
    setIsLoading(true);
    try {
      const status = await checkAuthStatus();
      await setCacheEntry<AuthStatus>(
        "cachedAuthStatus",
        "cachedAuthStatusTimestamp",
        status,
      );
      setIsAuthenticated(status.authenticated);
      setUser(status.user);
    } catch (error) {
      console.error("Auth check failed:", error);
      setIsAuthenticated(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load organizations when authenticated (network-first path only)
  useEffect(() => {
    if (isAuthenticated) {
      if (!cacheRestoredRef.current) {
        loadOrganizationsFromNetwork();
      }
    }
  }, [isAuthenticated]);

  // Load commands when org changes (but skip on initial cache restore)
  useEffect(() => {
    if (selectedOrg) {
      if (orgRestoredFromCacheRef.current) {
        // Skip -- commands were already restored from cache
        orgRestoredFromCacheRef.current = false;
        return;
      }
      loadOrgDataFromNetwork(selectedOrg, true);
    }
  }, [selectedOrg]);

  // Load last scan date when org changes
  useEffect(() => {
    if (selectedOrg) {
      loadLastScanDate(selectedOrg);
    }
  }, [selectedOrg]);

  /**
   * Load last scan date from discovered configs cache or API.
   * Uses chrome.storage.local with a 5-minute TTL to avoid redundant API calls
   * on every popup open, which was causing 429 rate limiting.
   */
  const loadLastScanDate = async (orgName: string) => {
    setScanFreshnessLoaded(false); // reset on org change
    const DISCOVERED_CONFIGS_TTL_MS = 300_000; // 5 minutes
    try {
      // Check local cache first
      const cached = await chrome.storage.local.get([
        "cachedDiscoveredConfigs",
        "cachedDiscoveredConfigsTimestamp",
      ]);
      const cachedTs = cached.cachedDiscoveredConfigsTimestamp as
        | number
        | undefined;
      if (cached.cachedDiscoveredConfigs && cachedTs) {
        const age = Date.now() - cachedTs;
        if (age < DISCOVERED_CONFIGS_TTL_MS) {
          try {
            const allCached = JSON.parse(
              cached.cachedDiscoveredConfigs as string,
            ) as Record<string, { cachedAt?: string }>;
            if (allCached[orgName]) {
              setLastScanAt(allCached[orgName].cachedAt || null);
              return; // Cache hit — skip API call
            }
          } catch {
            // Corrupt cache, fall through to network
          }
        }
      }

      // Cache miss or stale — fetch from API
      const response = await getDiscoveredConfigs(orgName);
      setLastScanAt(response.cachedAt || null);

      // Write to cache
      let existingCache: Record<string, unknown> = {};
      try {
        if (cached.cachedDiscoveredConfigs) {
          existingCache = JSON.parse(
            cached.cachedDiscoveredConfigs as string,
          ) as Record<string, unknown>;
        }
      } catch {
        /* ignore corrupt cache */
      }
      existingCache[orgName] = { cachedAt: response.cachedAt };
      await chrome.storage.local.set({
        cachedDiscoveredConfigs: JSON.stringify(existingCache),
        cachedDiscoveredConfigsTimestamp: Date.now(),
      });
    } catch {
      // Non-fatal -- just means we can't show stale warning
    } finally {
      setScanFreshnessLoaded(true); // always mark as checked
    }
  };

  const loadOrganizationsFromNetwork = async () => {
    try {
      const orgs = await getOrganizations();
      await setCacheEntry<Organization[]>(
        "cachedOrganizations",
        "cachedOrganizationsTimestamp",
        orgs,
      );
      setOrganizations(orgs);

      // Restore selected org or use first one
      const savedOrg = await getStorageData("selectedOrg");
      if (savedOrg && orgs.some((o) => o.name === savedOrg)) {
        setSelectedOrg(savedOrg);
      } else if (orgs.length > 0) {
        setSelectedOrg(orgs[0].name);
      }
    } catch (error) {
      console.error("Failed to load organizations:", error);
      setError("Failed to load organizations");
    }
  };

  /**
   * Load org data from network. Commands are delegated to the service worker
   * (single-writer architecture) — the popup reads commands from
   * cachedCommands via the storage listener below.
   * Sync hint and sync status are still fetched directly by the popup.
   */
  const loadOrgDataFromNetwork = async (
    orgName: string,
    showRefreshing: boolean,
  ) => {
    if (showRefreshing) setIsRefreshing(true);
    setError(null);
    try {
      // Ask service worker to refresh commands in the cache, but only if
      // it hasn't already prefetched within the last 30s.
      if (await shouldSendRefreshCommands()) {
        chrome.runtime
          .sendMessage({ type: "REFRESH_COMMANDS", orgName })
          .catch(() => {});
      }

      // Fetch config (for sync status derivation) and sync hint in parallel.
      const [config, hint] = await Promise.all([
        getApprovedConfig(orgName, undefined),
        getSyncPreflightHint(orgName, "claude"),
      ]);

      setApprovedConfig(config);

      // Read commands from service worker cache instead of API response.
      // This ensures commands always come from the single-writer cache.
      const cachedCmds = await getCacheEntry<Record<string, Command[]>>(
        "cachedCommands",
        "cachedCommandsTimestamp",
      );
      if (cachedCmds && cachedCmds.data[orgName]) {
        setCommands(cachedCmds.data[orgName]);
      } else if (config?.commands) {
        // Fallback: use API response if cache hasn't been populated yet.
        // The SW REFRESH_COMMANDS will populate the cache momentarily.
        setCommands(config.commands);
      }

      // Derive sync status from approved config (no dedicated endpoint exists)
      const derivedSyncStatus: SyncStatus = {
        synced: config?.approved ?? false,
        lastSyncAt: config?.approvedAt ?? null,
        configVersion: config?.version,
        driftDetected: false,
        driftFiles: [],
      };
      setSyncStatus(derivedSyncStatus);
      setSyncHint(hint);

      const existingHints = await getCacheEntry<
        Record<string, SyncCopilotHintResponse>
      >("cachedSyncHint", "cachedSyncHintTimestamp");
      const hintCache = existingHints?.data || {};
      if (hint) {
        hintCache[orgName] = hint;
      }
      await setCacheEntry<Record<string, SyncCopilotHintResponse>>(
        "cachedSyncHint",
        "cachedSyncHintTimestamp",
        hintCache,
      );

      // Cache sync status per org
      const existingSyncStatus = await getCacheEntry<
        Record<string, SyncStatus>
      >("cachedSyncStatus", "cachedSyncStatusTimestamp");
      const syncStatusCache = existingSyncStatus?.data || {};
      syncStatusCache[orgName] = derivedSyncStatus;
      await setCacheEntry<Record<string, SyncStatus>>(
        "cachedSyncStatus",
        "cachedSyncStatusTimestamp",
        syncStatusCache,
      );

      await setStorageData("selectedOrg", orgName);
    } catch (error) {
      console.error("Failed to load org data:", error);
      setError("Failed to load organization data");
    } finally {
      if (showRefreshing) setIsRefreshing(false);
    }
  };

  const handleScan = async () => {
    if (!selectedOrg || isScanningRef.current) return;
    isScanningRef.current = true;
    trackEvent("extension.scan_triggered");

    // Also trigger a content script re-scan on the active tab
    try {
      await chrome.storage.local.set({ scanRequested: true });
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id) {
        chrome.tabs
          .sendMessage(tab.id, { type: "TRIGGER_PLATFORM_SCAN" })
          .catch(() => {
            // Content script may not be loaded on this page
          });
      }
    } catch {
      // Non-critical -- platform scan is a best-effort addition
    }

    const thisGen = ++scanGenRef.current;
    const capturedOrg = selectedOrg;

    setIsScanning(true);
    setScanError(null);
    const startTime = Date.now();
    setScanProgress({
      status: "scanning",
      totalRepos: 0,
      scannedRepos: 0,
      percentage: 0,
      currentRepo: "",
      elapsedSeconds: 0,
    });

    // Poll progress while scanning
    let seenScanning = false;
    pollIntervalRef.current = setInterval(async () => {
      try {
        const progress = await getScanProgress(capturedOrg);
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setScanProgress({ ...progress, elapsedSeconds: elapsed });

        if (progress.status === "scanning") {
          seenScanning = true;
        }

        if (seenScanning) {
          if (progress.status === "complete" || progress.status === "error") {
            if (pollIntervalRef.current !== null) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            if (progress.status === "error") {
              setScanError("Scan failed during processing");
            }
          }
        }
      } catch {
        // Ignore transient polling errors
      }
    }, 2000);

    // Safety timeout
    safetyTimeoutRef.current = setTimeout(() => {
      scanGenRef.current++;
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      isScanningRef.current = false;
      setIsScanning(false);
      setScanProgress(null);
      if (orgNameRef.current === capturedOrg) {
        loadLastScanDate(capturedOrg);
      }
    }, 120_000);

    try {
      const result = await triggerScan(capturedOrg);

      if (!result.success) {
        setScanError(result.message || result.error || "Scan failed");
        trackEvent("extension.scan_completed", { success: false });
        return;
      }

      trackEvent("extension.scan_completed", {
        success: true,
        configs_found: result.totalConfigs,
      });

      // Wait for completion
      await new Promise<void>((resolve) => {
        checkIntervalRef.current = setInterval(async () => {
          try {
            const progress = await getScanProgress(capturedOrg);
            if (progress.status === "complete" || progress.status === "error") {
              if (checkIntervalRef.current !== null) {
                clearInterval(checkIntervalRef.current);
                checkIntervalRef.current = null;
              }
              resolve();
            }
          } catch {
            // Ignore transient errors
          }
        }, 3000);

        setTimeout(() => {
          if (checkIntervalRef.current !== null) {
            clearInterval(checkIntervalRef.current);
            checkIntervalRef.current = null;
          }
          resolve();
        }, 60_000);
      });
    } catch (err) {
      console.error("Scan failed:", err);
      setScanError(err instanceof Error ? err.message : "Scan failed");
      trackEvent("extension.scan_completed", { success: false });
    } finally {
      if (scanGenRef.current === thisGen) {
        if (pollIntervalRef.current !== null) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        if (safetyTimeoutRef.current !== null) {
          clearTimeout(safetyTimeoutRef.current);
          safetyTimeoutRef.current = null;
        }
        isScanningRef.current = false;
        setIsScanning(false);
        setScanProgress(null);
        if (orgNameRef.current === capturedOrg) {
          loadLastScanDate(capturedOrg);
        }
      }
    }
  };

  const handleLogout = async () => {
    trackEvent("extension.auth_changed", { auth_state: "unauthenticated" });
    await logout();
    setIsAuthenticated(false);
    setUser(null);
    setOrganizations([]);
    setSelectedOrg(null);
    setCommands([]);
    setSyncStatus(null);
    setSyncHint(null);
    setApprovedConfig(null);
  };

  const handleRefresh = () => {
    if (selectedOrg) {
      loadOrgDataFromNetwork(selectedOrg, true);
    }
  };

  const handleEnableCurrentSite = async () => {
    if (!optionalHostPermissionOrigin) return;
    setOptionalHostPermissionError(null);

    try {
      const granted = await chrome.permissions.request({
        origins: [optionalHostPermissionOrigin],
      });

      if (!granted) {
        setOptionalHostPermissionError("Site access was not granted.");
        return;
      }

      setOptionalHostPermissionNeeded(false);
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id) {
        chrome.tabs.reload(tab.id);
      }
    } catch {
      setOptionalHostPermissionError(
        "Could not request site access. Try again.",
      );
    }
  };

  const handleReportSyncHint = async (hint: SyncCopilotHintResponse) => {
    if (!selectedOrg) return;
    await recordGovernanceOverride({
      processType: "sync-copilot",
      organizationId: selectedOrg,
      userId: user?.login ?? "chrome-extension-user",
      originalInput: { requestHash: hint.requestHash, orgName: hint.orgName },
      originalOutput: {
        hint: hint.hint,
        source: hint.source,
        rolloutMode: hint.rolloutMode,
      },
      correctedOutput: { markedIncorrect: true, requestHash: hint.requestHash },
      overrideReason: "User reported advice as incorrect via Chrome extension",
    });
  };

  const handleOrgChange = async (orgName: string) => {
    trackEvent("extension.org_selected", { platform: orgName });
    await setStorageData("selectedOrg", orgName);
    setSelectedOrg(orgName);
    // Immediately show cached commands for the new org (if available)
    const cachedCmds = await getCacheEntry<Record<string, Command[]>>(
      "cachedCommands",
      "cachedCommandsTimestamp",
    );
    if (cachedCmds && cachedCmds.data[orgName]) {
      setCommands(cachedCmds.data[orgName]);
    }
    // Ask SW to refresh; storage listener will update commands when ready.
    // Skip if SW already prefetched recently.
    if (await shouldSendRefreshCommands()) {
      chrome.runtime
        .sendMessage({ type: "REFRESH_COMMANDS", orgName })
        .catch(() => {});
    }
  };

  const handleLoginSuccess = () => {
    trackEvent("extension.auth_changed", { auth_state: "authenticated" });
    cacheRestoredRef.current = false;
    checkAuthFromNetwork();
  };

  const handleCommandCopy = (command: Command) => {
    console.log("Command copied:", command.name);
  };

  const handleClipboardTransfer = async (entry: ClipboardEntry) => {
    setTransferringId(entry.id);
    setTransferError(null);
    try {
      // Send a message to the content script on the active tab to perform the transfer.
      // The content script has page context (DOM, cookies, Clipboard API) — the popup does not.
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        setTransferError(
          "No active tab found. Please focus a browser tab and try again.",
        );
        return;
      }

      const response = await chrome.tabs
        .sendMessage(tab.id, {
          type: "TRANSFER_CLIPBOARD_ENTRY",
          entry,
        })
        .catch(() => null); // content script not loaded

      if (!response) {
        if (optionalHostPermissionNeeded) {
          setTransferError(
            'GAL needs site access before it can run on this page. Click "Enable on this site" and retry.',
          );
        } else {
          setTransferError(
            "Content script not loaded on this page. Reload the page and try again.",
          );
        }
      } else if (!response.ok && response.error) {
        setTransferError(response.error);
      }
    } catch (err) {
      setTransferError(
        err instanceof Error ? err.message : "Transfer failed — unknown error.",
      );
    } finally {
      setTimeout(() => setTransferringId(null), 1500);
    }
  };

  /**
   * Copy an image entry as a PNG blob to the system clipboard.
   * Users can then paste (Cmd+V / Ctrl+V) into Figma, Slack, Docs, etc.
   */
  const handleCopyImageToClipboard = async (entry: ClipboardEntry) => {
    try {
      const src = entry.dataUrl ?? entry.imageUrl;
      if (!src) {
        setTransferError("No image data available for this entry.");
        return;
      }

      // Load the image into an <img> element so we can draw it onto a canvas
      // and export as PNG (maximum paste compatibility across apps).
      const img = new Image();
      img.crossOrigin = "anonymous";
      const imageLoaded = new Promise<HTMLImageElement>((resolve, reject) => {
        img.onload = () => resolve(img);
        img.onerror = () =>
          reject(new Error("Failed to load image for clipboard copy."));
      });
      img.src = src;

      const loadedImg = await imageLoaded;

      // Draw onto a canvas and export as PNG blob
      const canvas = document.createElement("canvas");
      canvas.width = loadedImg.naturalWidth;
      canvas.height = loadedImg.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        setTransferError("Could not create canvas context.");
        return;
      }
      ctx.drawImage(loadedImg, 0, 0);

      const pngBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Canvas toBlob returned null.")),
          "image/png",
        );
      });

      // Write to system clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);

      setCopiedImageId(entry.id);
      setTimeout(() => setCopiedImageId(null), 2000);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to copy image to clipboard.";
      // Provide a user-friendly message for permission-denied errors
      if (
        msg.includes("NotAllowed") ||
        msg.includes("denied") ||
        msg.includes("permission")
      ) {
        setTransferError(
          "Clipboard write permission denied. Please allow clipboard access and try again.",
        );
      } else {
        setTransferError(msg);
      }
    }
  };

  // Build platform badge label
  const platformBadgeLabel = (() => {
    if (activeGpt && activePlatform === "chatgpt") {
      return null; // Will render the GPT-enriched badge instead
    }
    if (activeGem && activePlatform === "gemini") {
      return null; // Will render the Gem-enriched badge instead
    }
    if (activePlatform) {
      return PLATFORM_LABELS[activePlatform] || activePlatform;
    }
    return null;
  })();

  // Determine effective scan freshness from both server-side and platform scans
  const effectiveLastScanAt = (() => {
    const candidates: (string | number)[] = [];
    if (lastScanAt) candidates.push(lastScanAt);
    if (platformScanChatgpt?.scannedAt)
      candidates.push(platformScanChatgpt.scannedAt);
    if (platformScanGemini?.scannedAt)
      candidates.push(platformScanGemini.scannedAt);
    if (candidates.length === 0) return null;
    // Find the most recent timestamp
    return candidates.reduce((latest, c) => {
      const t = typeof c === "number" ? c : new Date(c).getTime();
      const l =
        typeof latest === "number" ? latest : new Date(latest).getTime();
      return t > l ? c : latest;
    });
  })();

  const optionalHostLabel = optionalHostPermissionOrigin
    ? optionalHostPermissionOrigin
        .replace(/^https?:\/\//, "")
        .replace(/\/\*$/, "")
    : null;

  if (isLoading) {
    return (
      <div className="w-[400px] h-[600px] bg-[#0a0a0a] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gal-accent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="w-[400px] h-[600px] bg-[#0a0a0a]">
        <LoginView onLoginSuccess={handleLoginSuccess} />
      </div>
    );
  }

  return (
    <div className="w-[400px] h-[600px] bg-[#0a0a0a] flex flex-col">
      <ServiceDegradationBanner />
      {/* Header */}
      <div className="flex-shrink-0 p-3 border-b border-[rgba(255,255,255,0.08)]">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 flex items-center justify-center">
              <svg viewBox="0 0 36 36" className="w-7 h-7" fill="none">
                <rect width="36" height="36" rx="8" fill="black" />
                <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="#00FF2A" />
                <path
                  d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
                  fill="#00FF2A"
                  fillOpacity="0.6"
                />
                <path
                  d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
                  fill="#00FF2A"
                  fillOpacity="0.3"
                />
              </svg>
            </div>
            <h1 className="text-base font-bold text-white">GAL</h1>
            {/* Platform context badge with GPT / Gem enrichment */}
            {activeGpt && activePlatform === "chatgpt" ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] text-emerald-400 font-medium max-w-[160px] truncate"
                title={`${activeGpt.gptName} (${activeGpt.gptId})`}
              >
                <span className="text-[#a1a1a1]">ChatGPT</span>
                <span className="text-[#737373]">&rsaquo;</span>
                <span className="truncate">{activeGpt.gptName}</span>
              </span>
            ) : activeGem && activePlatform === "gemini" ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-[10px] text-blue-400 font-medium max-w-[160px] truncate"
                title={`${activeGem.gemName} (${activeGem.gemId})`}
              >
                <span className="text-[#a1a1a1]">Gemini</span>
                <span className="text-[#737373]">&rsaquo;</span>
                <span className="truncate">{activeGem.gemName}</span>
              </span>
            ) : platformBadgeLabel ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.12)] text-[10px] text-[#a1a1a1] font-medium">
                {platformBadgeLabel}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing || !selectedOrg}
              className="p-1.5 rounded-lg hover:bg-[#141414] text-[#a1a1a1] hover:text-gal-accent transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={() => {
                window.open("https://app.gal.run", "_blank");
              }}
              className="p-1.5 rounded-lg hover:bg-[#141414] text-[#a1a1a1] hover:text-gal-accent transition-colors"
              title="Open Dashboard"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg hover:bg-[#141414] text-[#a1a1a1] hover:text-red-400 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Workspace Switcher */}
        {organizations.length > 0 && (
          <WorkspaceSwitcher
            organizations={organizations}
            selectedOrg={selectedOrg}
            onSelectOrg={handleOrgChange}
          />
        )}

        {/* User info */}
        {user && (
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {user.avatarUrl && (
                <img
                  src={user.avatarUrl}
                  alt={user.login}
                  className="w-5 h-5 rounded-full"
                />
              )}
              <span className="text-xs text-[#737373]">
                Signed in as{" "}
                <span className="text-[#a1a1a1]">{user.login}</span>
              </span>
            </div>
          </div>
        )}

        {/* GAL Sync + Scan Status (compact single-line, expandable) */}
        <div className="mt-3">
          <SyncStatusLine
            syncStatus={syncStatus}
            isLoading={isRefreshing && !syncStatus}
            hasSelectedOrg={!!selectedOrg}
            lastScanAt={effectiveLastScanAt}
            scanFreshnessLoaded={scanFreshnessLoaded}
            syncHint={syncHint}
            onScanClick={handleScan}
            isScanning={isScanning}
            scanProgress={scanProgress}
            scanError={scanError}
            onReportIncorrect={handleReportSyncHint}
          />
        </div>

        {/* run-design Active Project Card */}
        {activeDesignProject && (
          <div className="mt-2 p-2.5 rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-semibold text-[#737373] uppercase tracking-wider">
                Current Project
              </span>
              <span className="text-[9px] text-[#4a4a4a] capitalize">
                {activeDesignProject.type}
              </span>
            </div>
            <p className="text-xs font-medium text-[#ededed] truncate mb-0.5">
              {activeDesignProject.name}
            </p>
            <p className="text-[10px] text-[#737373] mb-1.5">
              {activeDesignProject.totalScenes} scene
              {activeDesignProject.totalScenes !== 1 ? "s" : ""}
              {" · "}
              {activeDesignProject.completedScenes}/
              {activeDesignProject.totalScenes} complete
            </p>
            {/* Progress bar */}
            <div className="flex items-center gap-1.5">
              <div className="flex-1 h-1 bg-[#1a1a1a] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[rgba(255,255,255,0.3)] rounded-full transition-all duration-300"
                  style={{
                    width:
                      activeDesignProject.totalScenes > 0
                        ? `${Math.round(
                            (activeDesignProject.completedScenes /
                              activeDesignProject.totalScenes) *
                              100,
                          )}%`
                        : "0%",
                  }}
                />
              </div>
              <span className="text-[9px] text-[#737373] w-6 text-right">
                {activeDesignProject.totalScenes > 0
                  ? `${Math.round(
                      (activeDesignProject.completedScenes /
                        activeDesignProject.totalScenes) *
                        100,
                    )}%`
                  : "0%"}
              </span>
            </div>
          </div>
        )}

        {/* Browser Auth Export */}
        <CookieExportCard isAuthenticated={isAuthenticated} />
      </div>

      {/* Tab navigation */}
      <div className="flex-shrink-0 flex border-b border-[rgba(255,255,255,0.08)]">
        <button
          onClick={() => setActiveTab("workflows")}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            activeTab === "workflows"
              ? "text-gal-accent border-b-2 border-gal-accent"
              : "text-[#737373] hover:text-[#ededed]"
          }`}
        >
          Workflows
        </button>
        <button
          onClick={() => setActiveTab("clipboard")}
          className={`flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
            activeTab === "clipboard"
              ? "text-gal-accent border-b-2 border-gal-accent"
              : "text-[#737373] hover:text-[#ededed]"
          }`}
        >
          <Clipboard className="w-3 h-3" />
          Clipboard
          {clipboardEntries.length > 0 && (
            <span className="px-1 py-0.5 rounded-full bg-gal-accent/20 text-gal-accent text-[9px] font-bold leading-none">
              {clipboardEntries.length}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden p-3">
        {/* Storage quota warning */}
        {storageWarning && (
          <div className="mb-2 px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <p className="text-[11px] text-amber-400">{storageWarning}</p>
          </div>
        )}
        {optionalHostPermissionNeeded && optionalHostLabel && (
          <div className="mb-2 px-2.5 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30">
            <p className="text-[11px] text-blue-300 leading-tight">
              Enable GAL on{" "}
              <span className="font-semibold">{optionalHostLabel}</span> to load
              workflows and page actions.
            </p>
            <div className="mt-1.5 flex items-center gap-2">
              <button
                onClick={handleEnableCurrentSite}
                className="px-2.5 py-1 rounded text-[10px] font-medium bg-blue-500/20 border border-blue-400/40 text-blue-200 hover:bg-blue-500/30 transition-colors"
              >
                Enable on this site
              </button>
              {optionalHostPermissionError && (
                <span className="text-[10px] text-red-400">
                  {optionalHostPermissionError}
                </span>
              )}
            </div>
          </div>
        )}
        {activeTab === "workflows" ? (
          error ? (
            <div className="overflow-y-auto h-full p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : (
            <CommandList commands={commands} onCopy={handleCommandCopy} />
          )
        ) : (
          /* Clipboard tab */
          <div className="overflow-y-auto h-full">
            {/* Transfer error toast */}
            {transferError && (
              <div className="flex items-start gap-2 mx-1 mb-2 p-2 rounded-lg bg-red-500/10 border border-red-500/30">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-red-400 flex-1 leading-tight">
                  {transferError}
                </p>
                <button
                  onClick={() => setTransferError(null)}
                  className="text-red-400/60 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {!clipboardLoaded ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin text-[#737373]" />
              </div>
            ) : clipboardEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-4">
                <Clipboard className="w-8 h-8 text-[#737373]" />
                <p className="text-sm text-[#737373]">
                  No captured images yet.
                </p>
                <p className="text-xs text-[#737373]">
                  Visit Gemini or AI Studio to capture generated images.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {clipboardEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex gap-2.5 p-2 rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] hover:border-[rgba(255,255,255,0.12)] transition-colors"
                  >
                    {/* Thumbnail */}
                    <div className="flex-shrink-0 w-14 h-14 rounded-md overflow-hidden bg-[rgba(255,255,255,0.08)] flex items-center justify-center">
                      <img
                        src={
                          entry.thumbnailDataUrl ??
                          entry.dataUrl ??
                          entry.imageUrl
                        }
                        alt="Captured"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          const img = e.currentTarget as HTMLImageElement;
                          img.style.display = "none";
                          const parent = img.parentElement;
                          if (
                            parent &&
                            !parent.querySelector(".gal-img-placeholder")
                          ) {
                            const svg = document.createElementNS(
                              "http://www.w3.org/2000/svg",
                              "svg",
                            );
                            svg.setAttribute("viewBox", "0 0 24 24");
                            svg.setAttribute("fill", "none");
                            svg.setAttribute("stroke", "currentColor");
                            svg.setAttribute("stroke-width", "1.5");
                            svg.setAttribute(
                              "class",
                              "gal-img-placeholder w-6 h-6 text-[#737373]",
                            );
                            svg.innerHTML =
                              '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>';
                            parent.appendChild(svg);
                          }
                        }}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.08)] text-[9px] text-[#a1a1a1] font-medium capitalize">
                            {entry.platform}
                          </span>
                          <span className="text-[9px] text-[#737373]">
                            {formatRelativeTime(entry.capturedAt)}
                          </span>
                        </div>
                        {entry.prompt && (
                          <p className="text-[10px] text-[#a1a1a1] truncate leading-tight">
                            {entry.prompt}
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1 mt-1">
                        <button
                          onClick={() => handleClipboardTransfer(entry)}
                          disabled={transferringId === entry.id}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-gal-accent/15 border border-gal-accent/30 text-gal-accent hover:bg-gal-accent/25 transition-colors disabled:opacity-50"
                          title="Use on this page"
                        >
                          {transferringId === entry.id ? (
                            <Loader2 className="w-2.5 h-2.5 animate-spin" />
                          ) : (
                            <Upload className="w-2.5 h-2.5" />
                          )}
                          Use here
                        </button>
                        <button
                          onClick={() => handleCopyImageToClipboard(entry)}
                          disabled={copiedImageId === entry.id}
                          className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                            copiedImageId === entry.id
                              ? "bg-gal-accent/15 border border-gal-accent/30 text-gal-accent"
                              : "bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.12)] text-[#a1a1a1] hover:text-[#ededed]"
                          }`}
                          title="Copy image to clipboard"
                        >
                          {copiedImageId === entry.id ? (
                            <Check className="w-2.5 h-2.5" />
                          ) : (
                            <Copy className="w-2.5 h-2.5" />
                          )}
                          {copiedImageId === entry.id ? "Copied!" : "Copy"}
                        </button>
                        <button
                          onClick={async () => {
                            const granted = await chrome.permissions.request({
                              permissions: ["downloads"],
                            });
                            if (!granted) return;
                            const src = entry.dataUrl ?? entry.imageUrl;
                            const mime = src.startsWith("data:")
                              ? src.match(/:(.*?);/)?.[1] || "image/png"
                              : "image/png";
                            const filename = `gal-clipboard-${entry.id}.${mime.split("/")[1] || "png"}`;
                            chrome.runtime.sendMessage({
                              type: "GAL_DOWNLOAD_IMAGE",
                              url: src,
                              filename,
                            });
                          }}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.12)] text-[#a1a1a1] hover:text-[#ededed] transition-colors"
                          title="Download"
                        >
                          <Download className="w-2.5 h-2.5" />
                          Download
                        </button>
                        <button
                          onClick={async () => {
                            const updated = clipboardEntries.filter(
                              (e) => e.id !== entry.id,
                            );
                            await chrome.storage.local.set({
                              galAssetClipboard: JSON.stringify(updated),
                            });
                            setClipboardEntries(updated);
                          }}
                          className="ml-auto p-1 rounded text-[#737373] hover:text-red-400 transition-colors"
                          title="Remove"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-2 border-t border-[rgba(255,255,255,0.08)]">
        {/* In-field button toggle */}
        <label className="flex items-center justify-between cursor-pointer mb-1.5 px-0.5">
          <span className="text-[10px] text-[#a1a1a1]">
            Show workflow button in chatbox
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={!inFieldButtonDisabled}
            onClick={() => {
              const newDisabled = !inFieldButtonDisabled;
              setInFieldButtonDisabled(newDisabled);
              setSyncPreference("inFieldButtonDisabled", newDisabled);
              trackEvent("extension.button_toggled", {
                button_enabled: !newDisabled,
              });
            }}
            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
              !inFieldButtonDisabled
                ? "bg-gal-accent"
                : "bg-[rgba(255,255,255,0.12)]"
            }`}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${
                !inFieldButtonDisabled ? "translate-x-3.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </label>
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-[#737373]">
            {activeTab === "workflows"
              ? `${commands.length} workflow${commands.length !== 1 ? "s" : ""} available`
              : `${clipboardEntries.length} / 20 images`}
          </p>
          <a
            href="https://app.gal.run"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-[#737373] hover:text-gal-accent transition-colors"
          >
            Open Dashboard
            <ExternalLink className="w-2.5 h-2.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
