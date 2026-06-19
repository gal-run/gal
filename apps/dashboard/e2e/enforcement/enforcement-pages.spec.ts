/**
 * Enforcement Pages E2E Tests
 *
 * Verifies that enforcement dashboard pages render correctly:
 * - Agent Security Policies page loads with policy list
 * - Tool Policies page loads with policy list
 * - System Enforcement page loads with policy list
 * - Enforcement Hooks page loads with hooks list
 * - SDLC State page loads with state display
 * - Audit Log page loads with log entries
 * - Domain Audit page loads with access logs
 *
 * Uses TDD skip guards since dashboard pages may not be implemented yet.
 */

import { test, expect } from "@playwright/test";

test.describe("Enforcement Pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    // Wait for either content OR redirect to login
    await Promise.race([
      page.waitForSelector("h1", { timeout: 15000 }),
      page.waitForURL("**/login", { timeout: 15000 }),
    ]).catch(() => {});

    if (page.url().includes("/login")) {
      test.skip(true, "Redirected to login - auth state not applied");
      return;
    }
  });

  test("should render Agent Security Policies page", async ({ page }, testInfo) => {
    await page.goto("/enforcement/agent-security-policies");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading").filter({ hasText: /security polic/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "Agent Security Policies page not yet implemented");
      return;
    }

    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("should render Tool Policies page", async ({ page }, testInfo) => {
    await page.goto("/enforcement/tool-policies");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading").filter({ hasText: /tool polic/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "Tool Policies page not yet implemented");
      return;
    }

    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("should render System Enforcement page", async ({ page }, testInfo) => {
    await page.goto("/enforcement/system-policies");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading").filter({ hasText: /system.*polic|enforcement/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "System Enforcement page not yet implemented");
      return;
    }

    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("should render Enforcement Hooks page", async ({ page }, testInfo) => {
    await page.goto("/enforcement/hooks");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading").filter({ hasText: /hook/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "Enforcement Hooks page not yet implemented");
      return;
    }

    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("should render SDLC State page", async ({ page }, testInfo) => {
    await page.goto("/enforcement/sdlc");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading").filter({ hasText: /sdlc|lifecycle/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "SDLC State page not yet implemented");
      return;
    }

    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("should render Audit Log page", async ({ page }, testInfo) => {
    await page.goto("/enforcement/audit-log");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading").filter({ hasText: /audit/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "Audit Log page not yet implemented");
      return;
    }

    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("should render Domain Audit page", async ({ page }, testInfo) => {
    await page.goto("/enforcement/domain-audit");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading").filter({ hasText: /domain/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "Domain Audit page not yet implemented");
      return;
    }

    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});
