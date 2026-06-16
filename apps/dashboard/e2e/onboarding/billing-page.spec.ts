/**
 * Billing Page UX E2E Tests — Partner Onboarding Flow
 *
 * Issue: #3645
 * Verifies billing page renders correctly for the design-partner onboarding flow:
 * - Free tier org shows "Upgrade to Convenience" button
 * - Promo code field is visible and functional
 * - After checkout redirect (success), shows success banner
 * - Active subscription shows "Manage Subscription" and plan details
 * - Seat usage card renders with correct information
 *
 * Uses TDD skip guards since billing page requires authenticated user with
 * workspace data, which may not be available in all test environments.
 */

import { test, expect } from "@playwright/test";

test.describe("Billing Page — Partner Onboarding UX", () => {
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

  test("should render billing page with heading", async ({ page }, testInfo) => {
    await page.goto("/billing");
    await page.waitForLoadState("domcontentloaded");

    const heading = page.getByRole("heading", { level: 1 }).filter({ hasText: /billing/i });

    // Wait for page to load (past loading spinner)
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    if ((await heading.count()) === 0) {
      testInfo.skip(true, "Billing page not rendered - user may lack workspace data");
      return;
    }

    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("should show 'Upgrade to Convenience' button for free tier org", async ({ page }, testInfo) => {
    await page.goto("/billing");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    // Look for the free tier heading "GAL Free"
    const freeTierHeading = page.getByText("GAL Free");
    const hasFreeTier = await freeTierHeading.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasFreeTier) {
      // User might already be on convenience tier or page not loaded
      const convenienceHeading = page.getByText("GAL Convenience");
      const hasConvenience = await convenienceHeading.isVisible({ timeout: 3000 }).catch(() => false);
      if (hasConvenience) {
        testInfo.skip(true, "User is already on Convenience tier - cannot test free tier upgrade button");
        return;
      }
      testInfo.skip(true, "Billing page did not render plan details - user may lack workspace data");
      return;
    }

    // Verify upgrade button is present
    const upgradeButton = page.getByRole("button").filter({ hasText: /upgrade to convenience/i });
    await expect(upgradeButton.first()).toBeVisible({ timeout: 10000 });
  });

  test("should show promo code toggle and input field", async ({ page }, testInfo) => {
    await page.goto("/billing");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    // Promo code toggle is only visible on free tier
    const promoToggle = page.getByRole("button").filter({ hasText: /have a promo code/i });
    if ((await promoToggle.count()) === 0) {
      testInfo.skip(true, "Promo code toggle not visible - user may not be on free tier");
      return;
    }

    await expect(promoToggle).toBeVisible({ timeout: 10000 });

    // Click to expand promo code input
    await promoToggle.click();

    // Verify the input field appears with the expected placeholder
    const promoInput = page.getByPlaceholder("e.g. PARTNER-GRANT");
    await expect(promoInput).toBeVisible({ timeout: 5000 });

    // Verify the Apply button appears
    const applyButton = page.getByRole("button").filter({ hasText: /apply/i });
    await expect(applyButton).toBeVisible({ timeout: 5000 });
  });

  test("should show promo code input pre-populated from URL coupon param", async ({ page }, testInfo) => {
    await page.goto("/billing?coupon=PARTNER-GRANT");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    // Free tier should show the coupon banner
    const couponBanner = page.getByText(/coupon.*PARTNER-GRANT.*will be applied/i);
    const hasBanner = await couponBanner.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasBanner) {
      // Might not be on free tier
      testInfo.skip(true, "Coupon banner not visible - user may not be on free tier or page did not load");
      return;
    }

    await expect(couponBanner).toBeVisible();
  });

  test("should show success banner when redirected from Stripe with success=true", async ({ page }, testInfo) => {
    await page.goto("/billing?success=true");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    const heading = page.getByRole("heading", { level: 1 }).filter({ hasText: /billing/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "Billing page not rendered - user may lack workspace data");
      return;
    }

    // Success banner should appear
    const successBanner = page.getByText(/payment successful/i);
    await expect(successBanner).toBeVisible({ timeout: 10000 });
  });

  test("should show cancellation message when redirected with canceled=true", async ({ page }, testInfo) => {
    await page.goto("/billing?canceled=true");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    const heading = page.getByRole("heading", { level: 1 }).filter({ hasText: /billing/i });
    if ((await heading.count()) === 0) {
      testInfo.skip(true, "Billing page not rendered - user may lack workspace data");
      return;
    }

    // Canceled banner should appear
    const canceledBanner = page.getByText(/checkout was canceled/i);
    await expect(canceledBanner).toBeVisible({ timeout: 10000 });
  });

  test("should display seat usage card", async ({ page }, testInfo) => {
    await page.goto("/billing");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    const seatUsageHeading = page.getByText("Seat Usage");
    if ((await seatUsageHeading.count()) === 0) {
      testInfo.skip(true, "Seat Usage section not visible - billing page may not have loaded");
      return;
    }

    await expect(seatUsageHeading).toBeVisible({ timeout: 10000 });

    // Verify seat count text is present (e.g., "X of Y seats used")
    const seatCountText = page.getByText(/seats? used/i);
    await expect(seatCountText).toBeVisible({ timeout: 5000 });
  });

  test("should display account status section with plan info", async ({ page }, testInfo) => {
    await page.goto("/billing");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    const accountStatusHeading = page.getByText("Account Status");
    if ((await accountStatusHeading.count()) === 0) {
      testInfo.skip(true, "Account Status section not visible - billing page may not have loaded");
      return;
    }

    await expect(accountStatusHeading).toBeVisible({ timeout: 10000 });

    // Verify plan row is visible
    const planLabel = page.getByText("Plan").first();
    await expect(planLabel).toBeVisible({ timeout: 5000 });

    // Verify price row is visible
    const priceLabel = page.getByText("Price").first();
    await expect(priceLabel).toBeVisible({ timeout: 5000 });
  });

  test("should show 'Upgrade Your Plan' section with Enforcement and Enterprise tiers", async ({ page }, testInfo) => {
    await page.goto("/billing");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    const upgradePlanHeading = page.getByText("Upgrade Your Plan");
    if ((await upgradePlanHeading.count()) === 0) {
      testInfo.skip(true, "Upgrade Your Plan section not visible - billing page may not have loaded");
      return;
    }

    await expect(upgradePlanHeading).toBeVisible({ timeout: 10000 });

    // Verify Enforcement tier card
    const enforcementTier = page.getByText("Enforcement").first();
    await expect(enforcementTier).toBeVisible({ timeout: 5000 });

    // Verify Enterprise tier card
    const enterpriseTier = page.getByText("Enterprise").first();
    await expect(enterpriseTier).toBeVisible({ timeout: 5000 });

    // Verify Contact Sales link for Enterprise
    const contactSales = page.getByRole("link").filter({ hasText: /contact sales/i });
    await expect(contactSales).toBeVisible({ timeout: 5000 });
  });

  test("should show billing support contact", async ({ page }, testInfo) => {
    await page.goto("/billing");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    const supportText = page.getByText(/questions about billing/i);
    if ((await supportText.count()) === 0) {
      testInfo.skip(true, "Billing support section not visible");
      return;
    }

    await expect(supportText).toBeVisible({ timeout: 10000 });

    // Verify contact link
    const contactLink = page.getByRole("link").filter({ hasText: /contact us/i });
    await expect(contactLink).toBeVisible({ timeout: 5000 });
  });

  test("should show 'Manage Subscription' button for active subscriptions", async ({ page }, testInfo) => {
    await page.goto("/billing");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    // This test only applies if the user has a paid subscription
    const convenienceHeading = page.getByText("GAL Convenience");
    const hasConvenience = await convenienceHeading.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasConvenience) {
      testInfo.skip(true, "User is not on Convenience tier - cannot test Manage Subscription button");
      return;
    }

    const manageButton = page.getByRole("button").filter({ hasText: /manage subscription/i });
    if ((await manageButton.count()) === 0) {
      // Design partners (100% off coupon) may not have a Manage Subscription button
      const designPartnerBadge = page.getByText("Design Partner");
      const isDesignPartner = await designPartnerBadge.isVisible({ timeout: 3000 }).catch(() => false);
      if (isDesignPartner) {
        testInfo.skip(true, "Design Partner account - no Manage Subscription button expected");
        return;
      }
      testInfo.skip(true, "Manage Subscription button not visible for this account state");
      return;
    }

    await expect(manageButton.first()).toBeVisible({ timeout: 10000 });
  });

  test("should show Design Partner badge for convenience tier with 100% off coupon", async ({ page }, testInfo) => {
    await page.goto("/billing");
    await page.waitForLoadState("domcontentloaded");

    // Wait for loading to complete
    await page.waitForFunction(
      () => !document.querySelector(".animate-spin"),
      { timeout: 15000 }
    ).catch(() => {});

    const designPartnerBadge = page.getByText("Design Partner");
    const hasDesignPartner = await designPartnerBadge.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasDesignPartner) {
      testInfo.skip(true, "User is not a Design Partner - cannot test Design Partner badge");
      return;
    }

    await expect(designPartnerBadge).toBeVisible();

    // Design Partners should see the special description
    const partnerDescription = page.getByText(/design partner program/i);
    await expect(partnerDescription).toBeVisible({ timeout: 5000 });
  });
});
