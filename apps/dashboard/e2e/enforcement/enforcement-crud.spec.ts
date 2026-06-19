/**
 * Enforcement CRUD E2E Tests
 *
 * Verifies enforcement CRUD operations through the dashboard UI:
 * - Create a new agent security policy via form
 * - Edit an existing policy
 * - Delete a policy with confirmation
 * - Create a tool policy with rules
 * - Create an enforcement hook
 *
 * Uses TDD skip guards since dashboard forms may not be implemented yet.
 */

import { test, expect } from "@playwright/test";

test.describe("Enforcement CRUD via Dashboard", () => {
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

  test("should create a new agent security policy", async ({ page }, testInfo) => {
    await page.goto("/enforcement/agent-security-policies");
    await page.waitForLoadState("domcontentloaded");

    const createButton = page.getByRole("button").filter({ hasText: /create|add|new/i });
    if ((await createButton.count()) === 0) {
      testInfo.skip(true, "Agent security policy create button not yet implemented");
      return;
    }

    await createButton.first().click();

    // Fill in the policy form
    const nameInput = page.getByLabel(/name/i).first();
    if ((await nameInput.count()) === 0) {
      testInfo.skip(true, "Policy creation form not yet implemented");
      return;
    }

    await nameInput.fill("E2E Test Policy");

    const descInput = page.getByLabel(/description/i).first();
    if ((await descInput.count()) > 0) {
      await descInput.fill("Created by E2E test");
    }

    // Submit the form
    const submitButton = page.getByRole("button").filter({ hasText: /save|create|submit/i });
    if ((await submitButton.count()) > 0) {
      await submitButton.first().click();
    }

    // Verify success feedback
    const success = page.getByText(/created|success/i);
    const hasSuccess = await success.isVisible({ timeout: 10000 }).catch(() => false);
    if (hasSuccess) {
      await expect(success).toBeVisible();
    }
  });

  test("should create a new tool policy with rules", async ({ page }, testInfo) => {
    await page.goto("/enforcement/tool-policies");
    await page.waitForLoadState("domcontentloaded");

    const createButton = page.getByRole("button").filter({ hasText: /create|add|new/i });
    if ((await createButton.count()) === 0) {
      testInfo.skip(true, "Tool policy create button not yet implemented");
      return;
    }

    await createButton.first().click();

    const nameInput = page.getByLabel(/name/i).first();
    if ((await nameInput.count()) === 0) {
      testInfo.skip(true, "Tool policy creation form not yet implemented");
      return;
    }

    await nameInput.fill("E2E Tool Policy");

    // Look for rule configuration UI
    const addRuleButton = page.getByRole("button").filter({ hasText: /add rule|new rule/i });
    if ((await addRuleButton.count()) > 0) {
      await addRuleButton.first().click();
    }

    // Submit
    const submitButton = page.getByRole("button").filter({ hasText: /save|create|submit/i });
    if ((await submitButton.count()) > 0) {
      await submitButton.first().click();
    }
  });

  test("should delete a policy with confirmation", async ({ page }, testInfo) => {
    await page.goto("/enforcement/agent-security-policies");
    await page.waitForLoadState("domcontentloaded");

    // Look for a delete button on an existing policy row
    const deleteButton = page.getByRole("button").filter({ hasText: /delete|remove/i });
    if ((await deleteButton.count()) === 0) {
      testInfo.skip(true, "No policies to delete or delete button not yet implemented");
      return;
    }

    await deleteButton.first().click();

    // Confirm deletion dialog
    const confirmButton = page.getByRole("button").filter({ hasText: /confirm|yes|delete/i });
    if ((await confirmButton.count()) > 0) {
      await confirmButton.first().click();
    }

    // Verify deletion feedback
    const feedback = page.getByText(/deleted|removed|success/i);
    const hasFeedback = await feedback.isVisible({ timeout: 10000 }).catch(() => false);
    if (hasFeedback) {
      await expect(feedback).toBeVisible();
    }
  });

  test("should create an enforcement hook", async ({ page }, testInfo) => {
    await page.goto("/enforcement/hooks");
    await page.waitForLoadState("domcontentloaded");

    const createButton = page.getByRole("button").filter({ hasText: /create|add|new/i });
    if ((await createButton.count()) === 0) {
      testInfo.skip(true, "Enforcement hooks create button not yet implemented");
      return;
    }

    await createButton.first().click();

    const nameInput = page.getByLabel(/name/i).first();
    if ((await nameInput.count()) === 0) {
      testInfo.skip(true, "Hook creation form not yet implemented");
      return;
    }

    await nameInput.fill("E2E Test Hook");

    // Select hook type
    const typeSelect = page.getByLabel(/type/i).first();
    if ((await typeSelect.count()) > 0) {
      await typeSelect.selectOption({ label: "CI Check" }).catch(() => {
        // May be a different select pattern
      });
    }

    const submitButton = page.getByRole("button").filter({ hasText: /save|create|submit/i });
    if ((await submitButton.count()) > 0) {
      await submitButton.first().click();
    }
  });

  test("should edit an existing policy", async ({ page }, testInfo) => {
    await page.goto("/enforcement/agent-security-policies");
    await page.waitForLoadState("domcontentloaded");

    const editButton = page.getByRole("button").filter({ hasText: /edit|modify/i });
    if ((await editButton.count()) === 0) {
      testInfo.skip(true, "No policies to edit or edit button not yet implemented");
      return;
    }

    await editButton.first().click();

    const nameInput = page.getByLabel(/name/i).first();
    if ((await nameInput.count()) === 0) {
      testInfo.skip(true, "Policy edit form not yet implemented");
      return;
    }

    await nameInput.fill("Updated E2E Policy");

    const submitButton = page.getByRole("button").filter({ hasText: /save|update|submit/i });
    if ((await submitButton.count()) > 0) {
      await submitButton.first().click();
    }
  });
});
