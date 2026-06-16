/**
 * Environment configuration for Dashboard.
 *
 * Migration from Vite: import.meta.env.VITE_* → process.env.NEXT_PUBLIC_*
 *
 * This module centralizes all environment variable access so the rest of
 * the codebase can import from here instead of referencing process.env directly.
 */

// ADMIN_ORGS imports removed (Issue #2637)

export const config = {
  // API
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',

  // GitHub
  githubAppSlug: process.env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? 'gal-dev-local-github-app',
  backgroundAgentGitHubRepo: process.env.NEXT_PUBLIC_BACKGROUND_AGENT_GITHUB_REPO ?? '',

  // Firebase
  firebase: {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    databaseUrl: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? '',
  },

  // Observability
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',

  // Derived
  isProduction: process.env.NODE_ENV === 'production',
  isDev: process.env.NODE_ENV === 'development',
} as const

/**
 * Environment-specific configuration
 *
 * These values change based on the deployment environment:
 * - dev: Local CLI via pnpm link
 * - production: Production CLI from pnpm
 */

type Environment = 'dev' | 'prod';

function resolveEnvironment(): Environment {
  const raw = process.env['NEXT_PUBLIC_ENVIRONMENT'] as string | undefined;
  if (raw === 'production' || raw === 'prod') return 'prod';
  return 'dev';
}

const environment: Environment = resolveEnvironment();

/**
 * CLI package name (consistent across all environments)
 */
export const CLI_PACKAGE_NAME = '@scheduler-systems/gal-run';

/**
 * Get the CLI install command (always shows production command).
 *
 * User-facing pages should always display the public install command
 * regardless of the dashboard's deployment environment.
 *
 * Primary install path is Homebrew. When gal.run/install.sh is ready,
 * this should return the curl command and the Get Started page should
 * show multiple install method tabs (see issue #2807).
 */
export function getCliInstallCommand(): string {
  return `curl -fsSL https://gal.run/install.sh | sh`;
}

/**
 * Get the npx CLI command for the current environment
 *
 * - Production: npx @scheduler-systems/gal-run
 * - Dev (local): gal (use linked local CLI)
 */
export function getNpxCliCommand(): string {
  // Dev (local) uses linked local CLI directly
  if (environment === 'dev') {
    return 'gal';
  }
  // Production uses npx from npm
  return `npx ${CLI_PACKAGE_NAME}`;
}

/**
 * Check if current environment is production
 */
export function isProduction(): boolean {
  return environment === 'prod';
}

/**
 * Check if current environment is development
 */
export function isNonProduction(): boolean {
  return environment === 'dev';
}

/**
 * Get the current environment name
 */
export function getEnvironment(): Environment {
  return environment;
}

/**
 * Environment display labels
 */
export function getEnvironmentLabel(): string {
  switch (environment) {
    case 'prod':
      return 'Production';
    case 'dev':
    default:
      return 'Development';
  }
}

/**
 * VS Code Extension configuration
 */
export const VSCODE_EXTENSION_ID = 'scheduler-systems.gal-run';
export const VSCODE_EXTENSION_NAME = 'gal-run';
/**
 * Internal install guide route used by dashboard CTAs.
 */
export const VSCODE_INSTALL_GUIDE_PATH = '/vscode';

/**
 * Chrome Extension configuration
 */
export const CHROME_EXTENSION_ID = process.env.NEXT_PUBLIC_CHROME_EXTENSION_ID ?? 'gal-governance-chrome-extension';
export const CHROME_WEB_STORE_URL = `https://chromewebstore.google.com/detail/${CHROME_EXTENSION_ID}`;
export const CHROME_INSTALL_GUIDE_PATH = '/chrome-extension';

/**
 * Extension marketplace URLs.
 */
export const VSCODE_MARKETPLACE_URL = `https://marketplace.visualstudio.com/items?itemName=${VSCODE_EXTENSION_ID}`;
export const OPEN_VSX_URL = `https://open-vsx.org/extension/scheduler-systems/gal-run`;

/**
 * IDE categories for install link routing.
 *
 * - 'vscode-compatible': VS Code, Cursor, Windsurf — use VS Code Marketplace
 * - 'open-vsx-compatible': VSCodium and other open-source VS Code forks — use Open VSX Registry
 * - 'unknown': Cannot be determined — show both options
 */
export type IdeCategory = 'vscode-compatible' | 'open-vsx-compatible' | 'unknown';

/**
 * Detect which IDE category the user is likely running in, based on the
 * browser user-agent string.
 *
 * VS Code, Cursor, and Windsurf all embed a modified Electron/Chromium
 * webview whose user-agent contains their product name.
 * VSCodium embeds the same webview but identifies itself as "VSCodium".
 *
 * Because this runs in a browser context (Next.js client component), it
 * is only callable client-side. Returns 'unknown' during SSR.
 */
export function detectIdeCategory(): IdeCategory {
  if (typeof window === 'undefined') return 'unknown';
  const ua = window.navigator.userAgent;
  // Cursor and Windsurf embed their name in the UA
  if (/Cursor/i.test(ua) || /Windsurf/i.test(ua) || /Code\/[\d.]+/.test(ua)) {
    return 'vscode-compatible';
  }
  if (/VSCodium/i.test(ua)) {
    return 'open-vsx-compatible';
  }
  return 'unknown';
}

/**
 * Return the install URL for the detected IDE category.
 * When the IDE is unknown, returns null (caller should show both options).
 */
export function getExtensionInstallUrl(category: IdeCategory): string | null {
  if (category === 'vscode-compatible') return VSCODE_MARKETPLACE_URL;
  if (category === 'open-vsx-compatible') return OPEN_VSX_URL;
  return null;
}

/**
 * Human-readable label for an IDE category, used in CTA copy.
 */
export function getIdeCategoryLabel(category: IdeCategory): string {
  if (category === 'vscode-compatible') return 'VS Code / Cursor / Windsurf';
  if (category === 'open-vsx-compatible') return 'VSCodium / Open VSX';
  return 'your IDE';
}

/**
 * Get the VS Code extension install command (always shows production command).
 */
export function getVscodeInstallCommand(): string {
  return `code --install-extension ${VSCODE_EXTENSION_ID}`;
}

/**
 * Get VSIX download URL (if applicable).
 *
 * We currently install from the marketplace (production) or a locally built VSIX (dev),
 * so there's no external VSIX download URL.
 */
export function getVsixDownloadUrl(): string | null {
  return null;
}

/**
 * VS Code extension is always installed from the marketplace for end users.
 */
export function isVscodeMarketplaceInstall(): boolean {
  return true;
}

// INTERNAL_ORG_NAME, INTERNAL_ORG_NAMES, isAdminOrg removed (Issue #2637).
// Feature visibility now uses audience-based flags from the API.
