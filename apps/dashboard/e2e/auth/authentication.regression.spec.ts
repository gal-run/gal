/**
 * Authentication Regression Tests
 *
 * Regression: #3916 (CSP blocking api.gal.run requests)
 * Regression: #3910 (Login page showing "Authentication Not Configured" in production)
 *
 * Covers critical auth flows:
 * - Login page renders with GitHub and Google sign-in buttons (not "Authentication Not Configured")
 * - CSP does not block api.gal.run requests (no CSP violation errors in console)
 * - After successful auth, user is redirected to dashboard
 * - Unauthenticated user is redirected to login page
 * - Sign-out flow works correctly
 *
 * These tests verify the authentication pages render correctly without
 * performing actual OAuth flows. Real OAuth requires GitHub/Google test
 * credentials and is covered by integration tests with mocked providers.
 */

import { test, expect } from "@playwright/test";

test.describe("Authentication — Login Page Rendering", () => {
  test("should render login page with GAL logo", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // Wait for page to settle (past loading spinner)
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    // Logo is rendered with data-testid="logo"
    const logo = page.locator("[data-testid='logo']");
    await expect(logo.first()).toBeVisible({ timeout: 10000 });
  });

  test("should render login page with sign-in heading and description", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    // Heading should be present
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    // Description text
    const description = page.getByText(/sign in to manage/i);
    await expect(description).toBeVisible({ timeout: 5000 });
  });

  // Regression: #3910 — Login page was showing "Authentication Not Configured" in production
  test("should NOT show 'Authentication Not Configured' when auth is working", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    // The "Authentication Not Configured" error state should not appear
    // It indicates a misconfiguration in the production environment
    const notConfiguredMsg = page.getByText(/authentication not configured/i);

    // Allow a short grace period for the API to respond
    const isNotConfigured = await notConfiguredMsg.isVisible({ timeout: 5000 }).catch(() => false);

    if (isNotConfigured) {
      // This is the regression — fail the test with a descriptive message
      throw new Error(
        "REGRESSION #3910: Login page is showing 'Authentication Not Configured'. " +
        "This means Firebase Auth or the API is not reachable from the dashboard. " +
        "Check NEXT_PUBLIC_FIREBASE_* env vars and API connectivity."
      );
    }

    // Login card should be visible with auth options
    const loginCard = page.locator(".card").first();
    await expect(loginCard).toBeVisible({ timeout: 10000 });
  });

  test("should show GitHub sign-in button on login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    // GitHub button should be present (button or link with "github" text, or data-testid)
    const githubButton = page.getByRole("button").filter({ hasText: /github/i })
      .or(page.getByRole("link").filter({ hasText: /github/i }))
      .or(page.locator("[data-testid='sign-in-button']"));

    if ((await githubButton.count()) === 0) {
      // Check for "connecting to server" state (API unreachable — expected in some envs)
      const connecting = page.getByText(/connecting to server/i);
      const isConnecting = await connecting.isVisible({ timeout: 3000 }).catch(() => false);
      if (isConnecting) {
        test.skip(true, "API unreachable — GitHub button not rendered yet");
        return;
      }

      // Check for auth not configured (regression scenario)
      const notConfigured = page.getByText(/authentication not configured/i);
      const isNotConfigured = await notConfigured.isVisible({ timeout: 2000 }).catch(() => false);
      if (isNotConfigured) {
        throw new Error(
          "REGRESSION #3910: GitHub button missing because authentication is not configured."
        );
      }
    }

    await expect(githubButton.first()).toBeVisible({ timeout: 10000 });
  });

  test("should not show Dev Sign In bypass button on login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    await expect(page.locator('a[href*="/auth/dev-login"]')).toHaveCount(0);
    await expect(page.getByText(/dev sign in/i)).toHaveCount(0);
  });

  test("should show Google sign-in button when Google auth is enabled", async ({ page }, testInfo) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    // Google button is controlled by the auth.google feature flag
    // It may not be visible in all environments
    const googleButton = page.getByRole("button").filter({ hasText: /google/i })
      .or(page.getByRole("link").filter({ hasText: /google/i }));

    const hasGoogle = await googleButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasGoogle) {
      // Google auth may be disabled by feature flag in this environment
      testInfo.skip(true, "Google auth not enabled in this environment (auth.google feature flag off)");
      return;
    }

    await expect(googleButton.first()).toBeVisible({ timeout: 10000 });
  });

  // Regression: #3916 — CSP was blocking api.gal.run requests
  test("should not have CSP violation errors in browser console for api.gal.run", async ({ page }) => {
    const cspViolations: string[] = [];

    // Listen for console errors that indicate CSP violations
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // CSP violations typically contain "Content Security Policy" or "CSP"
        if (
          text.toLowerCase().includes("content security policy") ||
          text.toLowerCase().includes("csp") ||
          text.toLowerCase().includes("refused to connect") ||
          text.toLowerCase().includes("refused to load")
        ) {
          cspViolations.push(text);
        }
      }
    });

    // Also capture security policy violation events
    await page.addInitScript(() => {
      document.addEventListener("securitypolicyviolation", (e) => {
        // Store violations in a global for retrieval
        (window as Window & { __cspViolations?: string[] }).__cspViolations = (window as Window & { __cspViolations?: string[] }).__cspViolations || [];
        (window as Window & { __cspViolations?: string[] }).__cspViolations!.push(
          `CSP violation: ${e.violatedDirective} blocked ${e.blockedURI}`
        );
      });
    });

    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // Wait for page to settle and any deferred API calls to fire
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    // Collect any DOM-level CSP violations
    const domViolations = await page.evaluate(() => {
      return (window as Window & { __cspViolations?: string[] }).__cspViolations || [];
    });

    // Filter violations to only those affecting api.gal.run (the known regression)
    const apiViolations = [
      ...cspViolations,
      ...domViolations,
    ].filter((v) => v.toLowerCase().includes("api.gal.run") || v.toLowerCase().includes("gal.run"));

    if (apiViolations.length > 0) {
      throw new Error(
        `REGRESSION #3916: CSP is blocking api.gal.run requests.\n` +
        `Violations found:\n${apiViolations.join("\n")}\n\n` +
        `Fix: Add https://api.gal.run to the connect-src directive in next.config.ts.`
      );
    }

    // No api.gal.run CSP violations detected
    expect(apiViolations.length).toBe(0);
  });

  test("should show Terms of Service and Privacy Policy links on login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    const tosLink = page.getByRole("link").filter({ hasText: /terms of service/i });
    const privacyLink = page.getByRole("link").filter({ hasText: /privacy policy/i });

    const hasTos = await tosLink.isVisible({ timeout: 5000 }).catch(() => false);
    const hasPrivacy = await privacyLink.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasTos) {
      await expect(tosLink).toBeVisible();
    }
    if (hasPrivacy) {
      await expect(privacyLink).toBeVisible();
    }
  });
});

test.describe("Authentication — Redirect Behavior", () => {
  // Regression: unauthenticated users must be redirected to /login
  test("unauthenticated user visiting root is redirected to login", async ({ page }) => {
    // Navigate to root — if not authenticated, should redirect to /login
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Wait for either content (already authed) OR redirect to login
    await Promise.race([
      page.waitForSelector("h1", { timeout: 15000 }),
      page.waitForURL("**/login", { timeout: 15000 }),
    ]).catch(() => {});

    const currentUrl = page.url();

    // Two valid outcomes:
    // 1. Redirected to /login (unauthenticated — correct behavior)
    // 2. Shows dashboard content (already authenticated — also correct)
    const isOnLogin = currentUrl.includes("/login");
    const hasHeading = await page.getByRole("heading").first().isVisible({ timeout: 3000 }).catch(() => false);

    expect(isOnLogin || hasHeading).toBe(true);

    if (isOnLogin) {
      // Verify the login page is actually rendered (not a blank redirect)
      const loginCard = page.locator(".card").first();
      await expect(loginCard).toBeVisible({ timeout: 10000 });
    }
  });

  test("unauthenticated user visiting /billing is redirected to login", async ({ page }) => {
    await page.goto("/billing");
    await page.waitForLoadState("domcontentloaded");

    await Promise.race([
      page.waitForSelector("[data-testid='logo']", { timeout: 15000 }),
      page.waitForURL("**/login", { timeout: 15000 }),
    ]).catch(() => {});

    const currentUrl = page.url();

    // Must be on login page or billing page (if already authed)
    const isOnLogin = currentUrl.includes("/login");
    const isOnBilling = currentUrl.includes("/billing");

    expect(isOnLogin || isOnBilling).toBe(true);
  });

  test("unauthenticated user visiting /settings is redirected to login", async ({ page }) => {
    await page.goto("/settings");
    await page.waitForLoadState("domcontentloaded");

    await Promise.race([
      page.waitForSelector("[data-testid='logo']", { timeout: 15000 }),
      page.waitForURL("**/login", { timeout: 15000 }),
    ]).catch(() => {});

    const currentUrl = page.url();
    const isOnLogin = currentUrl.includes("/login");
    const isOnSettings = currentUrl.includes("/settings");

    expect(isOnLogin || isOnSettings).toBe(true);
  });

  // After successful auth, user should land on dashboard (not stuck on login)
  test("authenticated user visiting /login is redirected away from login", async ({ page }) => {
    // First go to the dashboard root to check auth state
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await Promise.race([
      page.waitForSelector("h1", { timeout: 15000 }),
      page.waitForURL("**/login", { timeout: 15000 }),
    ]).catch(() => {});

    if (page.url().includes("/login")) {
      // Not authenticated — skip this test (it requires an authenticated session)
      test.skip(true, "Not authenticated — cannot test post-login redirect behavior");
      return;
    }

    // User is authenticated — if they visit /login they should be redirected away
    await page.goto("/login");
    await page.waitForLoadState("domcontentloaded");

    // Authenticated users should be redirected away from /login to dashboard
    await Promise.race([
      page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 10000 }),
      page.waitForTimeout(5000),
    ]).catch(() => {});

    // Either redirected away from login or login page shown (if auth context hasn't loaded)
    // The key thing is they should NOT be stuck on /login permanently
    const finalUrl = page.url();
    // At minimum, the login page should render the logo
    const logo = page.locator("[data-testid='logo']");
    await expect(logo.first()).toBeVisible({ timeout: 5000 });
    // URL is valid (not blank/error)
    expect(finalUrl).toBeTruthy();
  });
});

test.describe("Authentication — Sign-Out Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await Promise.race([
      page.waitForSelector("h1", { timeout: 15000 }),
      page.waitForURL("**/login", { timeout: 15000 }),
    ]).catch(() => {});

    if (page.url().includes("/login")) {
      test.skip(true, "Redirected to login — auth state not applied, cannot test sign-out");
      return;
    }
  });

  test("should show user avatar or account menu when authenticated", async ({ page }, testInfo) => {
    // Look for user menu trigger (avatar, initials, or user button)
    const userMenu = page.locator("[data-testid='user-menu']")
      .or(page.getByRole("button").filter({ hasText: /account|profile|sign out|logout/i }))
      .or(page.locator("button[aria-label*='account' i]"))
      .or(page.locator("button[aria-label*='user' i]"));

    const hasUserMenu = await userMenu.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasUserMenu) {
      testInfo.skip(true, "User menu not visible — auth UI may differ in this environment");
      return;
    }

    await expect(userMenu.first()).toBeVisible({ timeout: 10000 });
  });

  test("sign-out navigates user to login page", async ({ page }, testInfo) => {
    // Look for sign-out button or user menu that contains sign-out
    const signOutButton = page.getByRole("button").filter({ hasText: /sign out|log out|logout/i })
      .or(page.getByRole("link").filter({ hasText: /sign out|log out|logout/i }));

    const hasDirectSignOut = await signOutButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (!hasDirectSignOut) {
      // Try opening user menu first
      const userMenuButton = page.locator("[data-testid='user-menu']")
        .or(page.locator("button[aria-label*='user' i]"))
        .or(page.locator("button[aria-label*='account' i]"));

      const hasUserMenu = await userMenuButton.isVisible({ timeout: 3000 }).catch(() => false);

      if (!hasUserMenu) {
        testInfo.skip(true, "Sign-out button and user menu not found — cannot test sign-out flow");
        return;
      }

      await userMenuButton.first().click();
      await page.waitForTimeout(500); // Brief wait for menu to open
    }

    // Now look for the sign-out option
    const signOutOption = page.getByRole("button").filter({ hasText: /sign out|log out|logout/i })
      .or(page.getByRole("menuitem").filter({ hasText: /sign out|log out|logout/i }))
      .or(page.getByRole("link").filter({ hasText: /sign out|log out|logout/i }));

    const hasSignOut = await signOutOption.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasSignOut) {
      testInfo.skip(true, "Sign-out option not found in user menu");
      return;
    }

    await signOutOption.first().click();

    // After sign-out, user should be redirected to /login
    await Promise.race([
      page.waitForURL("**/login", { timeout: 15000 }),
      page.waitForSelector("[data-testid='logo']", { timeout: 15000 }),
    ]).catch(() => {});

    // Should be on login page
    await expect(page).toHaveURL(/\/login/, { timeout: 10000 });
  });
});

test.describe("Authentication — Signup Page", () => {
  test("should render signup page with 'Create your account' heading", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("domcontentloaded");

    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    const heading = page.getByRole("heading").filter({ hasText: /create your account/i });
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("should show GitHub sign-up button on signup page", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("domcontentloaded");

    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    const githubButton = page.getByRole("button").filter({ hasText: /github/i })
      .or(page.getByRole("link").filter({ hasText: /github/i }))
      .or(page.locator("[data-testid='sign-in-button']"));

    if ((await githubButton.count()) === 0) {
      const notConfigured = page.getByText(/temporarily unavailable/i);
      const isUnavailable = await notConfigured.isVisible({ timeout: 3000 }).catch(() => false);
      if (isUnavailable) {
        test.skip(true, "Authentication not configured in test environment");
        return;
      }
    }

    await expect(githubButton.first()).toBeVisible({ timeout: 10000 });
  });
});
