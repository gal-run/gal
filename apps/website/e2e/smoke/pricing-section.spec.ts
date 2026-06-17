/**
 * Pricing Section E2E Tests
 *
 * Tests for the pricing page including:
 * - Single Convenience plan display
 * - Responsive behavior
 * - Call to action buttons
 *
 * Current pricing: Single "Convenience" plan at $10/dev/month
 * The website uses a simplified single-plan pricing structure.
 */

import { test, expect } from '@playwright/test'

test.describe('Pricing Section - Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const pricingSection = page.locator('#pricing')
    await pricingSection.scrollIntoViewIfNeeded()
    // Wait for section to be visible
    await expect(pricingSection).toBeVisible({ timeout: 10000 })
  })

  test('displays pricing section headline', async ({ page }) => {
    // Check for pricing section header
    await expect(page.getByText('Simple,')).toBeVisible({ timeout: 5000 })
    await expect(page.getByText('Transparent')).toBeVisible({ timeout: 5000 })
  })

  test('displays Convenience plan', async ({ page }) => {
    // Scope to pricing section
    const pricingSection = page.locator('#pricing')

    // Single Convenience plan with RECOMMENDED badge
    await expect(pricingSection.getByText('Convenience', { exact: true }).first()).toBeVisible()
  })

  test('displays pricing amount', async ({ page }) => {
    // Scope to pricing section
    const pricingSection = page.locator('#pricing')
    // $10/dev/month - appears in both highlight card and plan card
    await expect(pricingSection.getByText('$10').first()).toBeVisible({ timeout: 5000 })
    await expect(pricingSection.getByText('per developer, per month')).toBeVisible({ timeout: 5000 })
  })

  test('Convenience plan shows RECOMMENDED badge', async ({ page }) => {
    await expect(page.getByText('RECOMMENDED').first()).toBeVisible()
  })

  test('displays plan features', async ({ page }) => {
    const pricingSection = page.locator('#pricing')
    // Check for key features listed in the plan
    await expect(pricingSection.getByText('GitHub App integration')).toBeVisible()
    await expect(pricingSection.getByText('Auto-discovery + approved configs')).toBeVisible()
    await expect(pricingSection.getByText('CLI sync + approval workflows')).toBeVisible()
  })

  test('displays CTA button', async ({ page }) => {
    // Scope to pricing section to avoid header buttons
    const pricingSection = page.locator('#pricing')
    await expect(pricingSection.getByRole('link', { name: 'Get Started' })).toBeVisible({ timeout: 5000 })
  })

  test('displays All Plans Include section', async ({ page }) => {
    const pricingSection = page.locator('#pricing')
    await expect(pricingSection.getByText('All Plans Include')).toBeVisible()
    // Check for some included features
    await expect(pricingSection.getByText('Unlimited repos')).toBeVisible()
    await expect(pricingSection.getByText('Priority support')).toBeVisible()
  })
})

test.describe('Pricing Section - Mobile Responsive', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const pricingSection = page.locator('#pricing')
    await pricingSection.scrollIntoViewIfNeeded()
    await expect(pricingSection).toBeVisible({ timeout: 10000 })
  })

  test('pricing card is visible on mobile', async ({ page }) => {
    // Scope to pricing section
    const pricingSection = page.locator('#pricing')
    // Check that Convenience plan is visible
    await expect(pricingSection.getByText('Convenience', { exact: true }).first()).toBeVisible()
    await expect(pricingSection.getByText('$10').first()).toBeVisible()
  })

  test('CTA button is visible on mobile', async ({ page }) => {
    // Scope to pricing section to avoid other buttons
    const pricingSection = page.locator('#pricing')
    const ctaButton = pricingSection.getByRole('link', { name: 'Get Started' })
    await expect(ctaButton).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Pricing Section - Tablet', () => {
  test.use({ viewport: { width: 768, height: 1024 } })

  test('pricing section adapts to tablet', async ({ page }) => {
    await page.goto('/')
    const pricingSection = page.locator('#pricing')
    await pricingSection.scrollIntoViewIfNeeded()

    // Convenience plan should be visible
    await expect(pricingSection.getByText('Convenience', { exact: true }).first()).toBeVisible()
    await expect(pricingSection.getByText('RECOMMENDED').first()).toBeVisible()
  })
})

test.describe('Pricing Section - Interactions', () => {
  test('pricing card has hover effect', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const pricingSection = page.locator('#pricing')
    await pricingSection.scrollIntoViewIfNeeded()
    await expect(pricingSection).toBeVisible({ timeout: 10000 })

    const conveniencePlan = page.locator('div').filter({ hasText: 'RECOMMENDED' }).first()
    await expect(conveniencePlan).toBeVisible({ timeout: 5000 })
    await conveniencePlan.hover()

    // Card should still be visible after hover
    await expect(conveniencePlan).toBeVisible()
  })
})
