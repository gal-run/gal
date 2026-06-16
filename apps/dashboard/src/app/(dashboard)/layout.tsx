"use client";

// Force dynamic rendering for all dashboard pages - they use useAuth(), localStorage,
// and various contexts that require browser runtime
export const dynamic = "force-dynamic";

import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Home as HomeIcon,
  Bot,
  Rocket,
  Settings,
  BookOpen,
  LogIn,
  LogOut,
  User,
  Menu,
  X,
  CreditCard,
  Loader2,
  Shield,
  Terminal,
  Zap,
  FileText,
  Search,
  FileCheck,
  ShieldCheck,
  Lock,
  Wrench,
  Server,
  GitBranch,
  Webhook,
  Globe,
  ScrollText,
  ClipboardCheck,
  ExternalLink,
  FlaskConical,
  ChevronLeft,
  BarChart3,
  Network,
  Ban,
} from "lucide-react";

// Contexts & hooks
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureFlags } from "@/contexts/FeatureFlagsContext";
import { WorkspaceProvider } from "@/contexts/WorkspaceContext";
import { useIsOnboardingComplete } from "@/hooks/useIsOnboardingComplete";
import { useSelectedWorkspace } from "@/hooks/useSelectedWorkspace";
import {
  useIsInternalWorkspace,
  useIsPartnerWorkspace,
  useIsWorkspaceAdmin,
} from "@/hooks/useWorkspaceAudienceTier";

// Components
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FlagBadge } from "@/components/FlagBadge";
import { PreviewBadge } from "@/components/PreviewBadge";
import { FeedbackWidget } from "@/components/FeedbackWidget";
import { ResearchPreviewBanner } from "@/components/ResearchPreviewBanner";
import { DemoBanner } from "@/components/DemoBanner";
import { PaymentWarningBanner } from "@/components/PaymentWarningBanner";
import { TermsGate } from "@/components/TermsGate";
import { PlanBadge } from "@/components/PlanBadge";

// Lib
import { api } from "@/lib/api";
import { BRANDING } from "@/lib/branding";
import { getEnvironmentLabel } from "@/lib/config";
import { isDemoMode } from "@/lib/demo-guard";
import { isEeEnabled } from "@/ee/license.js";
import {
  subscribeOrganizationsUpdated,
  notifyOrganizationsUpdated,
} from "@/lib/organizationEvents";
import { DashboardProviders } from "@/providers";

// Types
import type { PageId } from "@gal/types";

// ---------------------------------------------------------------------------
// Navigation configuration
// ---------------------------------------------------------------------------

interface NavItem {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
  pageId: PageId | null; // null means always visible (no feature flag check)
  ee?: boolean; // Enterprise-only nav item — hidden entirely in the free build
}

const navItems: NavItem[] = [
  { path: "/", icon: HomeIcon, label: "Home", pageId: null },
  {
    path: "/dashboard",
    icon: LayoutDashboard,
    label: "Dashboard",
    pageId: "dashboard",
  },
  { path: "/discovery", icon: Search, label: "Discovery", pageId: "discovery" },
  {
    path: "/approved-config",
    icon: FileCheck,
    label: "Approved Config",
    pageId: "project-scope-configs",
  },
  {
    path: "/proposals",
    icon: FileText,
    label: "Proposals",
    pageId: "proposals",
  },
  {
    path: "/enforcement",
    icon: Shield,
    label: "Enforcement",
    pageId: "enforcement-compliance",
  },
  {
    path: "/enforcement/settings",
    icon: Shield,
    label: "Enforcement Settings",
    pageId: "enforcement-compliance",
  },
  {
    path: "/enforcement/overrides",
    icon: ShieldCheck,
    label: "Overrides",
    pageId: "enforcement-overrides",
  },
  {
    path: "/enforcement/policies",
    icon: ShieldCheck,
    label: "Policies",
    pageId: "enforcement-policies",
  },
  {
    path: "/enforcement/compliance",
    icon: ClipboardCheck,
    label: "Compliance",
    pageId: "enforcement-compliance",
  },
  {
    path: "/enforcement/audit",
    icon: ScrollText,
    label: "Audit Log",
    pageId: "enforcement-audit",
  },
  {
    path: "/enforcement/domains",
    icon: Globe,
    label: "Domains",
    pageId: "enforcement-domains",
  },
  {
    path: "/enforcement/hooks",
    icon: Webhook,
    label: "Hooks",
    pageId: "enforcement-hooks",
  },
  {
    path: "/enforcement/sdlc",
    icon: GitBranch,
    label: "SDLC",
    pageId: "enforcement-sdlc",
  },
  {
    path: "/enforcement/security",
    icon: Lock,
    label: "Security",
    pageId: "enforcement-security",
  },
  {
    path: "/enforcement/tools",
    icon: Wrench,
    label: "Tools",
    pageId: "enforcement-tools",
  },
  {
    path: "/enforcement/system",
    icon: Server,
    label: "System",
    pageId: "enforcement-system",
  },
  {
    path: "/compliance/developers",
    icon: Shield,
    label: "Compliance",
    pageId: "enforcement-overrides",
  },
  {
    path: "/compliance/sdlc",
    icon: ShieldCheck,
    label: "SDLC Compliance",
    pageId: "enforcement-overrides",
  },
  {
    path: "/compliance/domains",
    icon: Shield,
    label: "Domain Compliance",
    pageId: "domain-compliance",
  },
  {
    path: "/compliance/tools",
    icon: Shield,
    label: "Tool Compliance",
    pageId: "tool-compliance",
  },
  {
    path: "/audit-logs",
    icon: ScrollText,
    label: "Audit Logs",
    pageId: "audit-logs",
  },
  {
    path: "/agents",
    icon: Bot,
    label: "Agents",
    pageId: "background-agents",
  },
  {
    path: "/evals",
    icon: FlaskConical,
    label: "Evals",
    pageId: "background-agents",
  },
  {
    path: "/sessions",
    icon: Terminal,
    label: "Sessions",
    pageId: "background-agents",
  },
  {
    path: "/agent-network",
    icon: Network,
    label: "Agent Network",
    pageId: "background-agents",
  },
  {
    path: "/swarm",
    icon: Zap,
    label: "Swarm",
    pageId: "swarm",
  },
  {
    path: "/gal",
    icon: Ban,
    label: "GAL",
    pageId: null,
  },
  {
    path: "/browser-profiles",
    icon: Globe,
    label: "Browser Profiles",
    pageId: "browser-profiles",
  },
  {
    path: "/workflow-testing",
    icon: FlaskConical,
    label: "Workflow Testing",
    pageId: "workflow-testing", // #2901: Internal only
  },
  {
    path: "/governance/token-spend",
    icon: BarChart3,
    label: "Token Spend",
    pageId: "token-spend", // #6285: Internal only until #6296/#6297 ship
  },
  {
    path: "/policies",
    icon: ShieldCheck,
    label: "Policies",
    pageId: "policies",
  },
  { path: "/team", icon: Shield, label: "Team", pageId: "team", ee: true },
  { path: "/get-started", icon: Rocket, label: "Get Started", pageId: "cli" },
  { path: "/docs", icon: BookOpen, label: "Docs", pageId: "docs" },
  {
    path: "/billing",
    icon: CreditCard,
    label: "Billing",
    pageId: "billing",
    ee: true,
  },
  {
    path: "/managed-agents",
    icon: Bot,
    label: "Managed Agents",
    pageId: "background-agents",
    ee: true,
  },
  {
    path: "/settings/rate-cards",
    icon: CreditCard,
    label: "Rate Cards",
    pageId: "billing",
    ee: true,
  },
  { path: "/settings", icon: Settings, label: "Settings", pageId: "settings" },
];

const PRE_ONBOARDING_NAV_PATHS = new Set([
  "/",
  "/get-started",
  "/docs",
  "/settings",
]);

const SIDEBAR_COLLAPSED_KEY = "gal-sidebar-collapsed";

// Dividers between nav groups:
// Group 1: Dashboard, Discovery, Approved Config, Proposals
// Group 2: Enforcement (landing + sub-pages)
// Group 3: Compliance, Audit Logs
// Group 4: Sessions, Team
// Group 5: Get Started, Docs
// Group 6: Billing, Settings
const DIVIDER_BEFORE_PATHS = new Set([
  "/enforcement",
  "/compliance/developers",
  "/sessions",
  "/get-started",
  "/billing",
]);

// Advanced/internal enforcement and enterprise nav items that should only be
// visible to internal orgs. Productized enforcement surfaces (/enforcement,
// /enforcement/settings, /enforcement/compliance) stay public-tier.
const INTERNAL_ONLY_PATH_PREFIXES = [
  "/enforcement/overrides",
  "/enforcement/policies",
  "/enforcement/audit",
  "/enforcement/domains",
  "/enforcement/hooks",
  "/enforcement/sdlc",
  "/enforcement/security",
  "/enforcement/tools",
  "/enforcement/system",
  "/compliance",
  "/audit-logs",
  "/browser-profiles",
  "/proposals",
];

// ---------------------------------------------------------------------------
// User section component (sidebar footer)
// ---------------------------------------------------------------------------

function UserSection({
  galOrgsCount,
  collapsed,
}: {
  galOrgsCount: number | null;
  collapsed: boolean;
}) {
  const { user, isLoading, login, logout } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async (): Promise<void> => {
    setIsLoggingOut(true);
    try {
      await logout();
      router.push("/login?force_select=true");
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (isLoading || isLoggingOut) {
    return (
      <div
        className={`py-3 ${collapsed ? "px-2" : "px-3"}`}
        style={{ borderTop: "1px solid var(--sidebar-divider)" }}
      >
        <div
          className={`animate-pulse flex items-center rounded-lg bg-[var(--sidebar-hover-bg)] ${collapsed ? "justify-center p-2" : "gap-3 px-3 py-2.5"}`}
        >
          <div className="w-8 h-8 bg-[var(--sidebar-hover-bg)] rounded-full flex items-center justify-center flex-shrink-0">
            {isLoggingOut && (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--sidebar-text-muted)]" />
            )}
          </div>
          {!collapsed && (
            <div className="flex-1">
              <div className="h-3.5 bg-[var(--sidebar-hover-bg)] rounded w-20" />
              {isLoggingOut && (
                <p className="text-[10px] text-[var(--sidebar-text-muted)] mt-1">
                  Signing out...
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={`py-3 ${collapsed ? "px-2" : "px-3"}`}
        style={{ borderTop: "1px solid var(--sidebar-divider)" }}
      >
        <button
          onClick={() => login()}
          className={`w-full flex items-center justify-center rounded-lg text-sm bg-[var(--interactive-primary)] text-[var(--text-on-accent)] hover:bg-[var(--interactive-primary-hover)] transition-all duration-200 ${collapsed ? "p-2" : "gap-2 px-3 py-2"}`}
          title={collapsed ? "Sign in" : undefined}
        >
          <LogIn className="w-4 h-4" />
          {!collapsed && <span className="font-medium">Sign in</span>}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative z-10 py-3 ${collapsed ? "px-2" : "px-3"}`}
      style={{
        borderTop: "1px solid var(--sidebar-divider)",
        background: "var(--sidebar-bg)",
      }}
    >
      <div
        className={`flex items-center rounded-lg hover:bg-[var(--sidebar-hover-bg)] transition-all duration-200 group bg-[var(--sidebar-active-bg)] ${collapsed ? "justify-center p-2" : "gap-3 px-3 py-2.5"}`}
      >
        {user.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt={user.login}
            className="w-8 h-8 rounded-full flex-shrink-0"
            style={{ boxShadow: "0 0 0 2px var(--sidebar-divider)" }}
            title={collapsed ? user.name || user.login : undefined}
          />
        ) : (
          <div
            className="w-8 h-8 rounded-full bg-[var(--sidebar-hover-bg)] flex items-center justify-center flex-shrink-0"
            title={collapsed ? user.name || user.login : undefined}
          >
            <User className="w-4 h-4 text-[var(--sidebar-text-dim)]" />
          </div>
        )}
        {!collapsed && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-[var(--sidebar-text)] truncate leading-tight">
                {user.name || user.login}
              </p>
              <p className="text-xs text-[var(--sidebar-text-muted)] truncate mt-0.5">
                {galOrgsCount === null
                  ? null
                  : galOrgsCount > 0
                    ? `${galOrgsCount} workspace${galOrgsCount !== 1 ? "s" : ""}`
                    : "No workspaces"}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-[var(--sidebar-hover-bg)] text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)] transition-all duration-200"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard layout
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// #3050: Empty state when all workspaces have been deleted
// ---------------------------------------------------------------------------

function NoWorkspacesEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
        style={{
          backgroundColor: "var(--surface-sunken)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        <Settings className="w-8 h-8 text-[var(--text-muted)]" />
      </div>
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
        No workspaces connected
      </h2>
      <p className="text-sm text-[var(--text-secondary)] max-w-md mb-6">
        Connect a workspace to get started. Install the GAL GitHub App on your
        organization or personal account to begin scanning and managing agent
        configurations.
      </p>
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors bg-[var(--interactive-primary)] text-[var(--text-on-accent)] hover:bg-[var(--interactive-primary-hover)]"
      >
        <Settings className="w-4 h-4" />
        Go to Settings
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // #3990: Use SSR-safe initial value (false) to prevent React hydration mismatch.
  // The lazy initializer that read localStorage caused error #418 because the server
  // always rendered with `false` while the client could render with `true` if the
  // user had previously collapsed the sidebar. We now hydrate from localStorage in
  // a useEffect (two-pass render) to keep server and client initial HTML identical.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true") {
        setSidebarCollapsed(true);
      }
    } catch {
      // Ignore localStorage errors (e.g. private browsing)
    }
  }, []);
  const [galOrgsCount, setGalOrgsCount] = useState<number | null>(null);
  // #3050: Track Firestore workspace count independently from GitHub App status.
  // After deleting the last workspace, galOrgsCount (from GitHub API) may still
  // be > 0 because the GitHub App installation remains. firestoreOrgsCount
  // tracks actual workspaces in our database.
  const [firestoreOrgsCount, setFirestoreOrgsCount] = useState<number | null>(
    null,
  );
  const {
    isPageVisibleForUser,
    loading: flagsLoading,
    environment,
  } = useFeatureFlags();
  const { user, checkAuth } = useAuth();
  const { isOnboardingComplete } = useIsOnboardingComplete();
  const selectedWorkspace = useSelectedWorkspace();
  const isInternalWorkspace = useIsInternalWorkspace();
  const isPartnerWorkspace = useIsPartnerWorkspace();
  const isWorkspaceAdmin = useIsWorkspaceAdmin();
  const userOrgs = user?.organizations ?? [];
  const autoSyncAttempted = useRef(false);
  const lastSyncTime = useRef<number>(0);

  // ---- Installation count ----

  const fetchInstallationCount = useCallback(async (): Promise<void> => {
    if (!user) return;
    // In demo mode, show 1 workspace without hitting the real API
    if (isDemoMode()) {
      setGalOrgsCount(1);
      setFirestoreOrgsCount(1);
      return;
    }
    try {
      const [status, orgs] = await Promise.all([
        api.getGitHubAppStatus(),
        api.getOrganizations().catch(() => []),
      ]);
      setGalOrgsCount(
        status.totalInstalled ?? status.installations?.length ?? 0,
      );
      setFirestoreOrgsCount(orgs.length);
    } catch {
      setGalOrgsCount(0);
      setFirestoreOrgsCount(0);
    }
  }, [user]);

  // Quick-sync Firestore on first visit so pages (Team, Discovery, etc.) have fresh data.
  useEffect(() => {
    if (!user || autoSyncAttempted.current) return;
    autoSyncAttempted.current = true;
    lastSyncTime.current = Date.now();
    // Skip real sync in demo mode — no real Firestore to sync
    if (isDemoMode()) {
      notifyOrganizationsUpdated();
      fetchInstallationCount();
      return;
    }
    api
      .quickSyncOrganizations()
      .then(() => {
        // #2917: Refresh JWT session so newly-installed workspaces are in the org list
        return api.refreshSession();
      })
      .then(() => {
        notifyOrganizationsUpdated();
        fetchInstallationCount();
      })
      .catch(() => {});
  }, [user, fetchInstallationCount]);

  // Refetch on route change
  useEffect(() => {
    fetchInstallationCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, pathname]);

  // Re-sync when window regains focus after 5+ minutes of inactivity
  useEffect(() => {
    const STALE_THRESHOLD_MS = 5 * 60 * 1000;
    const handleFocus = (): void => {
      fetchInstallationCount();
      if (user && Date.now() - lastSyncTime.current > STALE_THRESHOLD_MS) {
        lastSyncTime.current = Date.now();
        api
          .quickSyncOrganizations()
          .then(() => {
            // #2917: Refresh JWT session after re-sync
            return api.refreshSession();
          })
          .then(() => {
            notifyOrganizationsUpdated();
          })
          .catch(() => {});
      }
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Re-fetch installation count when organizations change.
  // #5668: Also re-check auth so user.organizations is updated after a GitHub
  // App install — this ensures useIsOnboardingComplete() re-evaluates and the
  // sidebar nav items (Home, Team, Discovery, etc.) populate without a manual
  // page refresh.
  useEffect(() => {
    if (!user) return;
    return subscribeOrganizationsUpdated(() => {
      fetchInstallationCount();
      checkAuth();
    });
  }, [fetchInstallationCount, checkAuth, user]);

  // #3050: Use Firestore count as the authoritative source for whether
  // workspaces exist. GitHub App status may still show installations after
  // all workspaces are deleted from GAL.
  // While counts are still loading (both null), assume orgs exist to avoid
  // briefly hiding the nav on every page load.
  const orgsLoading = firestoreOrgsCount === null && galOrgsCount === null;
  const hasConnectedOrgs =
    orgsLoading || (firestoreOrgsCount ?? 0) > 0 || (galOrgsCount ?? 0) > 0;

  // ---- Page visibility ----

  const isPageVisible = (pageId: PageId): boolean => {
    return isPageVisibleForUser(pageId, userOrgs, selectedWorkspace);
  };

  // ---- Mobile sidebar close on route change ----

  const prevPathnameRef = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPathnameRef.current) {
      prevPathnameRef.current = pathname;
      setSidebarOpen(false);
    }
  }, [pathname]);

  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // ---- Environment label ----

  const envLabel = (() => {
    if (isDemoMode()) return "DEMO";
    const env = environment.environment;
    switch (env) {
      case "dev":
        return "DEV";
      case "prod":
        return "LIVE";
      default:
        return "UNKNOWN";
    }
  })();

  // ---- Sidebar collapse toggle ----

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Ignore localStorage errors
      }
      return next;
    });
  }, []);

  // ---- Filter nav items ----

  const filteredNavItems = navItems.filter((item) => {
    // Enterprise gate (defense-in-depth, runs FIRST): EE nav items never render
    // in the free build (no GAL Enterprise license key). This sits before the
    // feature-flag check so the EE surface is hidden regardless of flag state.
    if (item.ee && !isEeEnabled()) {
      return false;
    }
    // Feature flag check — while flags are still loading, skip the flag-based
    // filter so nav items are visible immediately (avoids full-page loading block).
    if (!flagsLoading && item.pageId !== null && !isPageVisible(item.pageId)) {
      return false;
    }
    // #4029: Enforcement and enterprise features are internal-only.
    // Completely hide them for non-internal workspaces (don't show locked versions).
    if (
      !isInternalWorkspace &&
      INTERNAL_ONLY_PATH_PREFIXES.some((prefix) => item.path.startsWith(prefix))
    ) {
      return false;
    }
    // #4203: Hide billing for internal/partner orgs (defense-in-depth — feature
    // flags already gate billing to audience='public', but this is an explicit check).
    if (
      item.path === "/billing" &&
      (isInternalWorkspace || isPartnerWorkspace)
    ) {
      return false;
    }
    // #4203: Hide billing for non-admin users in public-tier orgs.
    // Only admin/owner should see the billing nav item.
    if (
      item.path === "/billing" &&
      !isInternalWorkspace &&
      !isPartnerWorkspace &&
      !isWorkspaceAdmin
    ) {
      return false;
    }
    // Pre-onboarding or no workspaces (#3050): show only minimal set
    if (!isOnboardingComplete && !hasConnectedOrgs) {
      return PRE_ONBOARDING_NAV_PATHS.has(item.path);
    }
    // #3050: When all workspaces are deleted, suppress feature pages
    if (!hasConnectedOrgs) {
      return PRE_ONBOARDING_NAV_PATHS.has(item.path);
    }
    // Post-onboarding: hide Home (redirect handled by page itself)
    return item.path !== "/";
  });

  // ---- Determine active state ----

  const isActive = (path: string): boolean => {
    if (path === "/") return pathname === "/";
    return pathname === path || pathname.startsWith(path + "/");
  };

  // ---- Render ----

  return (
    <div className="flex h-screen bg-[var(--bg-primary)]">
      {/* Mobile Header */}
      <div
        className="mobile-header lg:hidden fixed top-0 left-0 right-0 z-40 h-16 flex items-center justify-between px-4"
        style={{
          background: "var(--sidebar-bg)",
          borderBottom: "1px solid var(--sidebar-divider)",
        }}
      >
        <a
          href={BRANDING.siteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 transition-opacity duration-200 hover:opacity-80"
          title={`Visit ${BRANDING.siteHost}`}
        >
          <div className="w-8 h-8 rounded-lg bg-[var(--sidebar-hover-bg)] flex items-center justify-center">
            <svg
              viewBox="0 0 36 36"
              fill="none"
              className="w-5 h-5"
              data-testid="logo"
              aria-label={BRANDING.logoLabel}
            >
              <path
                d="M8 12L18 6L28 12V18L18 12L8 18V12Z"
                fill="var(--brand-gal)"
              />
              <path
                d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
                fill="var(--brand-gal)"
                fillOpacity="0.6"
              />
              <path
                d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
                fill="var(--brand-gal)"
                fillOpacity="0.3"
              />
            </svg>
          </div>
          <span className="text-lg font-bold tracking-tight text-[var(--sidebar-text)]">
            {BRANDING.shortName}
          </span>
        </a>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg hover:bg-[var(--sidebar-hover-bg)] text-[var(--sidebar-text-dim)] hover:text-[var(--sidebar-text)] transition-colors duration-200"
        >
          {sidebarOpen ? (
            <X className="w-6 h-6" />
          ) : (
            <Menu className="w-6 h-6" />
          )}
        </button>
      </div>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          sidebar flex flex-col overflow-hidden
          fixed lg:relative inset-y-0 left-0 z-50
          transform transition-all duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${sidebarCollapsed ? "lg:w-[68px]" : "w-60"}
        `}
      >
        {/* Logo */}
        <div
          className={`h-16 flex items-center group ${sidebarCollapsed ? "px-3 justify-center" : "px-5"}`}
          style={{ borderBottom: "1px solid var(--sidebar-divider)" }}
        >
          <a
            href={BRANDING.siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center cursor-pointer transition-opacity duration-200 hover:opacity-80 ${sidebarCollapsed ? "" : "gap-3"}`}
            title={`Visit ${BRANDING.siteHost}`}
          >
            <div className="w-9 h-9 rounded-lg bg-[var(--sidebar-hover-bg)] flex items-center justify-center flex-shrink-0">
              <svg
                viewBox="0 0 36 36"
                fill="none"
                className="w-6 h-6"
                data-testid="logo"
                aria-label={BRANDING.logoLabel}
              >
                <path
                  d="M8 12L18 6L28 12V18L18 12L8 18V12Z"
                  fill="var(--brand-gal)"
                />
                <path
                  d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
                  fill="var(--brand-gal)"
                  fillOpacity="0.6"
                />
                <path
                  d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
                  fill="var(--brand-gal)"
                  fillOpacity="0.3"
                />
              </svg>
            </div>
            {!sidebarCollapsed && (
              <div className="flex flex-col overflow-hidden">
                <span className="text-sm font-bold tracking-tight text-[var(--sidebar-text)] whitespace-nowrap">
                  {BRANDING.shortName}
                </span>
                <span className="text-[10px] text-[var(--sidebar-text-muted)] tracking-wide uppercase whitespace-nowrap">
                  Governance
                </span>
              </div>
            )}
          </a>
        </div>

        {/* Workspace Switcher */}
        {!sidebarCollapsed && <WorkspaceSwitcher />}

        {/* Navigation */}
        <nav className="flex-1 px-3 py-2 overflow-y-auto">
          <div className="space-y-0.5">
            {filteredNavItems.map((item, index) => {
              const showDivider =
                index > 0 && DIVIDER_BEFORE_PATHS.has(item.path);
              const active = isActive(item.path);

              return (
                <Fragment key={item.path}>
                  {showDivider && (
                    <div
                      className="my-2 mx-1"
                      style={{
                        height: "1px",
                        background: "var(--sidebar-divider)",
                      }}
                    />
                  )}
                  <Link
                    href={item.path}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`sidebar-nav-item flex items-center rounded-lg text-[13px] transition-all duration-200 ease-in-out relative ${
                      sidebarCollapsed
                        ? "justify-center px-2 py-[7px]"
                        : "gap-2.5 px-2.5 py-[7px]"
                    } ${
                      active
                        ? "bg-[var(--sidebar-active-bg)] text-[var(--sidebar-active-text)] font-medium"
                        : "text-[var(--sidebar-text-dim)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-text)]"
                    }`}
                  >
                    {/* Left accent bar for active state */}
                    {active && (
                      <div
                        className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full"
                        style={{ background: "var(--sidebar-text)" }}
                      />
                    )}
                    <item.icon
                      className={`w-4 h-4 flex-shrink-0 ${active ? "text-[var(--sidebar-active-text)]" : ""}`}
                    />
                    {!sidebarCollapsed && (
                      <>
                        <span className="flex-1">{item.label}</span>
                        {item.pageId && <PreviewBadge pageId={item.pageId} />}
                        {item.pageId && <FlagBadge pageId={item.pageId} />}
                      </>
                    )}
                  </Link>
                </Fragment>
              );
            })}
          </div>
        </nav>

        {/* Plan Badge (#4203) */}
        <PlanBadge collapsed={sidebarCollapsed} />

        {/* User Section */}
        <UserSection galOrgsCount={galOrgsCount} collapsed={sidebarCollapsed} />

        {/* Unified sidebar footer — Visit link + env badge + theme toggle + collapse */}
        <footer
          className={`relative z-10 flex flex-wrap items-center gap-1 py-2 ${sidebarCollapsed ? "lg:px-2 lg:justify-center lg:flex-col px-3 justify-between" : "px-3 justify-between"}`}
          style={{
            borderTop: "1px solid var(--sidebar-divider)",
            background: "var(--sidebar-bg)",
          }}
        >
          {/* Visit gal.run link — icon-only on mobile, text+icon on wide sidebar */}
          {!sidebarCollapsed && (
            <a
              href="https://app.gal.run"
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[12px] text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)] transition-colors duration-150"
              title="Visit gal.run"
            >
              <span className="hidden sm:inline">Visit gal.run</span>
              <ExternalLink className="external-link-icon w-3 h-3 sm:opacity-40 sm:group-hover:opacity-100" />
            </a>
          )}

          {/* Spacer when not collapsed */}
          {!sidebarCollapsed && <span className="flex-1 min-w-0" />}

          {/* Environment status badge — hidden on narrow viewports to save space */}
          {!sidebarCollapsed &&
            (() => {
              if (envLabel === "LIVE") {
                return (
                  <span
                    className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold"
                    style={{
                      background:
                        "color-mix(in srgb, #22c55e 12%, transparent)",
                      color: "#16a34a",
                    }}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span
                        className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                        style={{ background: "#22c55e" }}
                      />
                      <span
                        className="relative inline-flex rounded-full h-1.5 w-1.5"
                        style={{ background: "#22c55e" }}
                      />
                    </span>
                    live
                  </span>
                );
              }
              if (envLabel === "DEV") {
                return (
                  <span
                    className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold"
                    style={{
                      background:
                        "color-mix(in srgb, #f59e0b 12%, transparent)",
                      color: "#d97706",
                    }}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span
                        className="relative inline-flex rounded-full h-1.5 w-1.5"
                        style={{ background: "#f59e0b" }}
                      />
                    </span>
                    dev
                  </span>
                );
              }
              if (envLabel === "DEMO") {
                return (
                  <span
                    className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-semibold"
                    style={{
                      background:
                        "color-mix(in srgb, #8b5cf6 12%, transparent)",
                      color: "#7c3aed",
                    }}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span
                        className="relative inline-flex rounded-full h-1.5 w-1.5"
                        style={{ background: "#8b5cf6" }}
                      />
                    </span>
                    demo
                  </span>
                );
              }
              return null;
            })()}

          {/* Theme toggle — compact (icon-only) when sidebar collapsed or on narrow viewport */}
          <ThemeToggle compact={sidebarCollapsed} />

          {/* Collapse button — desktop only */}
          <button
            onClick={toggleSidebarCollapsed}
            className="hidden lg:flex items-center justify-center rounded-[7px] text-[var(--sidebar-text-muted)] hover:text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover-bg)] transition-all duration-200"
            style={{ width: 28, height: 28 }}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
          >
            <ChevronLeft
              className="w-4 h-4 transition-transform duration-300"
              style={{
                transform: sidebarCollapsed ? "rotate(180deg)" : "rotate(0deg)",
                transitionTimingFunction: "cubic-bezier(0.4,0,0.2,1)",
              }}
            />
          </button>
        </footer>
      </aside>

      {/* Main Content — keyed by workspace so pages fully remount on switch (#2278) */}
      <div className="flex-1 flex flex-col overflow-auto pt-16 lg:pt-0 relative z-0">
        <DemoBanner />
        <ResearchPreviewBanner />
        <PaymentWarningBanner />
        <main
          className="flex-1 overflow-auto"
          style={{ background: "var(--surface-base)" }}
        >
          {/* #3050: Show empty-state when no workspaces and not on allowed page */}
          {!hasConnectedOrgs &&
          firestoreOrgsCount !== null &&
          !PRE_ONBOARDING_NAV_PATHS.has(pathname) ? (
            <NoWorkspacesEmptyState />
          ) : (
            <Fragment key={selectedWorkspace ?? "__none__"}>
              {children}
            </Fragment>
          )}
        </main>
      </div>

      {/* Feedback Widget */}
      <FeedbackWidget context={{ location: pathname }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported layout wraps with WorkspaceProvider
// ---------------------------------------------------------------------------

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardProviders>
      <WorkspaceProvider>
        <TermsGate>
          <DashboardLayoutInner>{children}</DashboardLayoutInner>
        </TermsGate>
      </WorkspaceProvider>
    </DashboardProviders>
  );
}
