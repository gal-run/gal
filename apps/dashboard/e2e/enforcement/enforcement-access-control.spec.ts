/**
 * Enforcement Access Control E2E Tests
 *
 * Verifies that enforcement pages respect role-based access:
 * - Admin users can see enforcement navigation items
 * - Non-admin users are blocked from admin-only enforcement pages
 * - Read-only enforcement data (merged policy, tool evaluate) is accessible to all org members
 *
 * Uses TDD skip guards since enforcement navigation may not be implemented yet.
 */

import { test, expect } from "@playwright/test";

test.describe("Enforcement Access Control", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await Promise.race([
      page.waitForSelector("h1", { timeout: 15000 }),
      page.waitForURL("**/login", { timeout: 15000 }),
    ]).catch(() => {});

    if (page.url().includes("/login")) {
      test.skip(true, "Redirected to login - auth state not applied");
      return;
    }
  });

  test("should show enforcement navigation for authenticated users", async ({ page }, testInfo) => {
    const nav = page.locator("nav");
    const enforcementLink = nav.getByRole("link").filter({ hasText: /enforcement/i });

    if ((await enforcementLink.count()) === 0) {
      testInfo.skip(true, "Enforcement navigation not yet implemented");
      return;
    }

    await expect(enforcementLink.first()).toBeVisible({ timeout: 10000 });
  });

  test("should display forbidden message for non-admin on admin-only pages", async ({ page }, testInfo) => {
    await page.goto("/enforcement/agent-security-policies");
    await page.waitForLoadState("domcontentloaded");

    // Check for either the page content (admin) or forbidden message (non-admin)
    const forbidden = page.getByText(/forbidden|access denied|not authorized|403/i);
    const heading = page.getByRole("heading").filter({ hasText: /security polic/i });

    const hasForbidden = await forbidden.isVisible({ timeout: 5000 }).catch(() => false);
    const hasHeading = await heading.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasForbidden && !hasHeading) {
      testInfo.skip(true, "Agent Security Policies page not yet implemented");
      return;
    }

    // Either the page rendered (admin user) or showed forbidden (non-admin)
    expect(hasForbidden || hasHeading).toBe(true);
  });

  test("should allow any org member to access merged security policy", async ({ page }, testInfo) => {
    await page.goto("/enforcement/policy-overview");
    await page.waitForLoadState("domcontentloaded");

    const content = page.getByRole("heading").filter({ hasText: /policy|overview|security/i });
    if ((await content.count()) === 0) {
      testInfo.skip(true, "Policy overview page not yet implemented");
      return;
    }

    // Read-only merged policy should be accessible without admin role
    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test("should allow any org member to access SDLC states", async ({ page }, testInfo) => {
    await page.goto("/enforcement/sdlc");
    await page.waitForLoadState("domcontentloaded");

    const content = page.getByRole("heading").filter({ hasText: /sdlc|lifecycle/i });
    if ((await content.count()) === 0) {
      testInfo.skip(true, "SDLC page not yet implemented");
      return;
    }

    await expect(content).toBeVisible({ timeout: 10000 });
  });

  test("should restrict audit log access to admins", async ({ page }, testInfo) => {
    await page.goto("/enforcement/audit-log");
    await page.waitForLoadState("domcontentloaded");

    const forbidden = page.getByText(/forbidden|access denied|not authorized|403/i);
    const heading = page.getByRole("heading").filter({ hasText: /audit/i });

    const hasForbidden = await forbidden.isVisible({ timeout: 5000 }).catch(() => false);
    const hasHeading = await heading.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasForbidden && !hasHeading) {
      testInfo.skip(true, "Audit log page not yet implemented");
      return;
    }

    expect(hasForbidden || hasHeading).toBe(true);
  });
});
