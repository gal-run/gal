/**
 * @fileoverview Website Configuration - Environment-aware constants
 * @module config
 *
 * Configuration Layer (Clean Architecture)
 * -----------------------------------------
 * This module contains all configuration constants for the GAL marketing
 * website. Values are sourced from environment variables with sensible
 * defaults for development.
 *
 * Architecture Notes:
 * - All environment-dependent values should be defined here
 * - Components should NEVER read process.env directly
 * - Enables easy testing and environment switching
 *
 * Environment Variables:
 * - VITE_DASHBOARD_URL: URL to the GAL dashboard (default: production)
 * - VITE_API_URL: URL to the GAL API (default: production)
 * - VITE_INTERCOM_APP_ID: Intercom app ID for chat widget
 */

// ============================================================================
// URLs Configuration
// ============================================================================

/**
 * Dashboard URL for login and app links.
 *
 * @remarks
 * Defaults to production URL. Override with VITE_DASHBOARD_URL environment
 * variable if needed for development.
 */
export const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_URL || "https://app.gal.run";

/**
 * API URL for any direct API calls.
 *
 * @remarks
 * Currently the marketing site doesn't make API calls directly,
 * but this is available for future use (e.g., early access signup).
 */
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://api.gal.run";

/**
 * Documentation URL for links to docs.
 */
export const DOCS_URL = "https://docs.gal.run";

// ============================================================================
// Third-Party Integrations
// ============================================================================

/**
 * Intercom app ID for chat widget.
 *
 * @remarks
 * This is the Scheduler Systems Intercom workspace ID.
 * The widget provides live chat support for potential customers.
 *
 * SECURITY: No fallback value - must be set via environment variable.
 * Set VITE_INTERCOM_APP_ID in .env or build process.
 */
export const INTERCOM_APP_ID = process.env.NEXT_PUBLIC_INTERCOM_APP_ID as
  | string
  | undefined;

/**
 * Intercom API base URL.
 */
export const INTERCOM_API_BASE = "https://api-iam.intercom.io";

// ============================================================================
// Navigation Configuration
// ============================================================================

/**
 * Navigation links for header/footer.
 */
export const NAV_LINKS = [
  { href: "#features", label: "FEATURES" },
  { href: "#pricing", label: "PRICING" },
  { href: "/blog", label: "BLOG" },
  { href: DOCS_URL, label: "DOCS", external: true },
] as const;

/**
 * Social media links for footer.
 */
export const SOCIAL_LINKS = {
  github: "https://github.com/gal-run/gal",
  twitter: "https://x.com/gal_runtime",
  linkedin: "https://linkedin.com/company/gal-run",
} as const;

// ============================================================================
// Pricing Configuration
// ============================================================================

/**
 * Pricing tiers for the pricing section.
 *
 * @remarks
 * These are the four GAL product tiers with their features and pricing.
 */
export const PRICING_TIERS = [
  {
    name: "Convenience",
    price: "$10",
    unit: "per developer/month",
    description: "Discover, centralize, and sync AI agent configs",
    features: [
      "Auto-discover agent configs",
      "Centralized config management",
      "CLI sync tool",
      "Basic analytics",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Enforcement",
    price: "$25",
    unit: "per developer/month",
    description: "Policy enforcement at the CLI level",
    features: [
      "Everything in Convenience",
      "Policy enforcement hooks (coming in v1.0)",
      "Command blocking (coming in v1.0)",
      "Audit logging",
    ],
    cta: "Get Started",
    highlighted: true,
  },
  {
    name: "Automation",
    price: "$50",
    unit: "per developer/month",
    description: "Automated compliance workflows",
    features: [
      "Everything in Enforcement",
      "Automated remediation (coming in v1.0)",
      "Custom workflows",
      "Advanced reporting",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
  {
    name: "Enterprise",
    price: "Custom",
    unit: "contact for pricing",
    description: "Full governance suite for large organizations",
    features: [
      "Everything in Automation",
      "SSO/SAML",
      "Dedicated support",
      "Custom integrations",
    ],
    cta: "Contact Sales",
    highlighted: false,
  },
] as const;

// ============================================================================
// Feature Flags
// ============================================================================

/**
 * Feature flags for conditional rendering.
 *
 * @remarks
 * Used to enable/disable features in different environments.
 */
export const FEATURE_FLAGS = {
  showPricing: true,
  showDemoVideo: false,
  showEarlyAccessForm: true,
} as const;
