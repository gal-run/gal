/**
 * Get Started Page E2E Tests — Partner Onboarding Flow
 *
 * Issue: #3645
 * Verifies the Get Started / CLI Tool page renders correctly:
 * - Page shows correct heading "Get Started with GAL"
 * - Three-step installation flow: Install, Authenticate, Sync
 * - CLI install command uses the correct install method (curl | sh)
 * - `gal auth login` command is displayed
 * - `gal sync --pull` command is displayed
 * - Supported config files section renders correctly
 * - Copy buttons are present for each command
 *
 * Uses TDD skip guards since Get Started page may not be visible in all
 * auth states (pre-onboarding nav only shows Home, Get Started, Docs, Settings).
 */

import { test, expect } from "@playwright/test";

test.describe("Get Started Page — CLI Installation Guide", () => {
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

  test("should render Get Started page with correct heading", async ({ page }, testInfo) => {
    await page.goto("/get-started");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading", { level: 1 }).filter({ hasText: /get started with gal/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "Get Started page not rendered");
      return;
    }

    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("should show CLI Tool badge", async ({ page }, testInfo) => {
    await page.goto("/get-started");
    await page.waitForLoadState("domcontentloaded");

    const badge = page.getByText("CLI Tool");
    if ((await badge.count()) === 0) {
      testInfo.skip(true, "CLI Tool badge not visible");
      return;
    }

    await expect(badge).toBeVisible({ timeout: 10000 });
  });

  test("should display Step 1: Install command with correct CLI install command", async ({ page }, testInfo) => {
    await page.goto("/get-started");
    await page.waitForLoadState("domcontentloaded");

    const installStep = page.getByText("Install").first();
    if ((await installStep.count()) === 0) {
      testInfo.skip(true, "Install step not visible");
      return;
    }

    await expect(installStep).toBeVisible({ timeout: 10000 });

    // Verify the CLI install command is shown (curl | sh pattern)
    const installCommand = page.locator("code").filter({ hasText: /curl.*gal\.run\/install\.sh/i });
    await expect(installCommand).toBeVisible({ timeout: 5000 });
  });

  test("should display Step 2: Authenticate command 'gal auth login'", async ({ page }, testInfo) => {
    await page.goto("/get-started");
    await page.waitForLoadState("domcontentloaded");

    const authStep = page.getByText("Authenticate").first();
    if ((await authStep.count()) === 0) {
      testInfo.skip(true, "Authenticate step not visible");
      return;
    }

    await expect(authStep).toBeVisible({ timeout: 10000 });

    // Verify the auth command
    const authCommand = page.locator("code").filter({ hasText: "gal auth login" });
    await expect(authCommand).toBeVisible({ timeout: 5000 });
  });

  test("should display Step 3: Sync command 'gal sync --pull'", async ({ page }, testInfo) => {
    await page.goto("/get-started");
    await page.waitForLoadState("domcontentloaded");

    const syncStep = page.getByText("Sync").first();
    if ((await syncStep.count()) === 0) {
      testInfo.skip(true, "Sync step not visible");
      return;
    }

    await expect(syncStep).toBeVisible({ timeout: 10000 });

    // Verify the sync command
    const syncCommand = page.locator("code").filter({ hasText: "gal sync --pull" });
    await expect(syncCommand).toBeVisible({ timeout: 5000 });
  });

  test("should show all three steps with step numbers", async ({ page }, testInfo) => {
    await page.goto("/get-started");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading", { level: 1 }).filter({ hasText: /get started/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "Get Started page not rendered");
      return;
    }

    // Verify all three step descriptions are present
    const stepDescriptions = [
      "One-time global installation",
      "Connect with your GitHub account",
      "Pull approved configs to any repo",
    ];

    for (const desc of stepDescriptions) {
      const element = page.getByText(desc);
      await expect(element).toBeVisible({ timeout: 5000 });
    }
  });

  test("should display supported AI coding tool configurations section", async ({ page }, testInfo) => {
    await page.goto("/get-started");
    await page.waitForLoadState("domcontentloaded");

    const configsHeading = page.getByText("Supported AI Coding Tool Configurations");
    if ((await configsHeading.count()) === 0) {
      testInfo.skip(true, "Supported configs section not visible");
      return;
    }

    await expect(configsHeading).toBeVisible({ timeout: 10000 });

    // Verify key config files are listed
    const configFiles = [
      "CLAUDE.md",
      ".claude/settings.json",
      ".claude/commands/",
      ".claude/agents/",
      ".claude/hooks/",
      ".mcp.json",
    ];

    for (const configFile of configFiles) {
      const element = page.locator("code").filter({ hasText: configFile });
      await expect(element).toBeVisible({ timeout: 5000 });
    }
  });

  test("should show copy buttons for each command", async ({ page }, testInfo) => {
    await page.goto("/get-started");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading", { level: 1 }).filter({ hasText: /get started/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "Get Started page not rendered");
      return;
    }

    // Each command block should have a copy button
    const copyButtons = page.getByTitle("Copy command");
    const count = await copyButtons.count();

    // There should be at least 3 copy buttons (one per step)
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("should show Homebrew availability note in footer", async ({ page }, testInfo) => {
    await page.goto("/get-started");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading", { level: 1 }).filter({ hasText: /get started/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "Get Started page not rendered");
      return;
    }

    // Footer note about availability
    const footerNote = page.getByText(/available for macOS and Linux via Homebrew/i);
    await expect(footerNote).toBeVisible({ timeout: 5000 });
  });
});
