/**
 * Landing Page E2E Tests
 *
 * Comprehensive tests for the GAL marketing website including:
 * - Header navigation
 * - Hero section with email signup
 * - All content sections
 * - Mobile responsiveness
 * - Form submissions
 */

import { test, expect } from '@playwright/test'

test.describe('Landing Page - Header', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('displays logo and brand name', async ({ page }) => {
    await expect(page.getByText('GAL').first()).toBeVisible()
  })

  test('displays navigation links', async ({ page }) => {
    // Scope to header nav to avoid matching mobile menu links
    const headerNav = page.locator('header nav')
    await expect(headerNav.getByRole('link', { name: 'HOW IT WORKS' })).toBeVisible()
    await expect(headerNav.getByRole('link', { name: 'FEATURES' })).toBeVisible()
    await expect(headerNav.getByRole('link', { name: 'PRICING' })).toBeVisible()
  })

  test('displays GET STARTED button', async ({ page }) => {
    // Header has GET STARTED link (styled as button)
    const getStartedLinks = page.getByRole('link', { name: 'GET STARTED' })
    await expect(getStartedLinks.first()).toBeVisible()
  })

  test('navigation links scroll to sections', async ({ page }) => {
    // Scope to header nav to avoid matching mobile menu links
    await page.locator('header nav').getByRole('link', { name: 'FEATURES' }).click()
    await expect(page.locator('#features')).toBeInViewport()
  })
})

// Regression test: dashboard links should use the environment-configured URL
test.describe('Landing Page - Dashboard Links', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('GET STARTED link points to configured dashboard URL, not hardcoded production (#988)', async ({ page }) => {
    // Get the GET STARTED link href
    const getStartedLink = page.getByRole('link', { name: 'GET STARTED' }).first()
    const href = await getStartedLink.getAttribute('href')

    // In dev/Docker environment, VITE_DASHBOARD_URL should be set
    // The href should NOT be the hardcoded production URL
    // This test will FAIL if VITE_DASHBOARD_URL is missing (falls back to production)
    expect(href).not.toBeNull()

    // If running in local dev or Docker, href should contain localhost or configured URL
    // The key assertion: it should NOT be hardcoded to production when in non-prod environment
    const baseUrl = process.env.BASE_URL || 'http://localhost:4173'
    if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
      // Local/Docker environment - should NOT point to production
      expect(href).not.toContain('app.gal.run')
      expect(href).toContain('localhost')
    }
    // In production, app.gal.run is expected
  })

  test('Sign In link points to configured dashboard URL (#988)', async ({ page }) => {
    // Scroll to CTA section where Sign In link is
    const signInLink = page.getByRole('link', { name: 'Sign In' })
    await signInLink.scrollIntoViewIfNeeded()
    const href = await signInLink.getAttribute('href')

    expect(href).not.toBeNull()
    expect(href).toContain('/login')

    // Same check as above - in dev environment, should not hardcode to production
    const baseUrl = process.env.BASE_URL || 'http://localhost:4173'
    if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1')) {
      expect(href).not.toContain('app.gal.run')
    }
  })
})

test.describe('Landing Page - Hero Section', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('displays main headline', async ({ page }) => {
    // Use exact match to avoid matching "2. Governance Layer" in diagram
    await expect(page.getByText('Governance Layer', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('for Coding Agents').first()).toBeVisible()
  })

  test('displays subheading', async ({ page }) => {
    await expect(page.getByText(/config-and-policy control plane/i)).toBeVisible()
  })

  // SKIPPED: Email form not yet implemented on website
  test.skip('displays email signup form', async ({ page }) => {
    await expect(page.getByPlaceholder('Enter your work email').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Get in Touch/i }).first()).toBeVisible()
  })

  test('displays integration diagram with coding agents', async ({ page }) => {
    // The hero section shows a visual diagram with various AI coding agents
    // These agents are represented as icons in the diagram
    // Just verify the diagram container is visible
    const heroSection = page.locator('section').first()
    await expect(heroSection).toBeVisible()
  })

  // SKIPPED: Email form not yet implemented on website
  test.skip('email form shows success message on submit', async ({ page }) => {
    const emailInput = page.getByPlaceholder('Enter your work email').first()
    const submitButton = page.getByRole('button', { name: /Get in Touch/i }).first()

    await emailInput.fill('test@example.com')
    await submitButton.click()

    // Wait for success message
    await expect(page.getByText('MESSAGE_SENT').first()).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Landing Page - Terminal Demo', () => {
  test('displays terminal with demo commands', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check for terminal demo content - now showing Claude Code session with GAL hooks
    await expect(page.getByText('AI Agent — your-project')).toBeVisible()
    // Check for user prompt
    await expect(page.getByText(/playwright mcp extensions/i)).toBeVisible()
    // Check for GAL hook notification
    await expect(page.getByText(/GAL: Authentication required/i)).toBeVisible()
  })
})

test.describe('Landing Page - Problem Section', () => {
  test('displays the problem headline', async ({ page }) => {
    await page.goto('/')
    await page.locator('#why-gal').scrollIntoViewIfNeeded()

    await expect(page.getByText('Agent Configs Are')).toBeVisible()
    await expect(page.getByText('Everywhere')).toBeVisible()
  })

  test('displays problem cards', async ({ page }) => {
    await page.goto('/')

    await expect(page.getByText('No Central Control')).toBeVisible()
    await expect(page.getByText("Can't Find")).toBeVisible()
    await expect(page.getByText("Can't Standardize")).toBeVisible()
    await expect(page.getByText("Can't Distribute")).toBeVisible()
  })
})

test.describe('Landing Page - Solution Section', () => {
  test('displays solution headline', async ({ page }) => {
    await page.goto('/')
    await page.locator('#how-it-works').scrollIntoViewIfNeeded()

    await expect(page.getByText('One source of truth.')).toBeVisible()
    await expect(page.getByText('For every agent.')).toBeVisible()
  })

  test('displays 3D sandbox visualization', async ({ page }) => {
    await page.goto('/')

    // Check for the visualization labels
    await expect(page.getByText('1. SANDBOX')).toBeVisible()
    await expect(page.getByText('2. Governance Layer')).toBeVisible()
    await expect(page.getByText('3. AI AGENT')).toBeVisible()
    await expect(page.getByText('4. WORKFLOWS')).toBeVisible()
  })
})

test.describe('Landing Page - Features Section', () => {
  test('displays features headline', async ({ page }) => {
    await page.goto('/')
    await page.locator('#features').scrollIntoViewIfNeeded()

    await expect(page.getByText('Configure Agents')).toBeVisible()
    await expect(page.getByText('With Confidence')).toBeVisible()
  })

  test('displays all feature cards', async ({ page }) => {
    await page.goto('/')

    const features = [
      'Config Discovery',
      'Approved Config',
      'CLI Sync',
      'GitHub Integration',
      'Test & Approve'
    ]

    for (const feature of features) {
      await expect(page.getByText(feature).first()).toBeVisible()
    }
  })
})

// Security section removed from new design - benefits are now incorporated into other sections
test.describe.skip('Landing Page - Enterprise Security Section', () => {
  test('security content integrated into other sections', async ({ page }) => {
    // Security messaging is now part of the "Why GAL" benefits section
    await page.goto('/')
    // This test is skipped as the standalone security section no longer exists
  })
})

// Team section tests skipped - section removed from current design
test.describe.skip('Landing Page - Team Section', () => {
  test('displays team section', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const teamSection = page.locator('#team')
    await teamSection.scrollIntoViewIfNeeded()

    await expect(page.getByText('THE_TEAM')).toBeVisible({ timeout: 10000 })
  })

  test('displays team members', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const teamSection = page.locator('#team')
    await teamSection.scrollIntoViewIfNeeded()
    await expect(teamSection).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Landing Page - CTA Section', () => {
  test('displays CTA headline', async ({ page }) => {
    await page.goto('/')

    // Use .first() in case of multiple matches
    await expect(page.getByText('See GAL in Action').first()).toBeVisible()
  })

  test('displays CTA buttons', async ({ page }) => {
    await page.goto('/')

    // Check for "See a Demo" button
    await expect(page.getByRole('button', { name: /See a Demo/i })).toBeVisible()
    // Check for "Sign In" link
    await expect(page.getByRole('link', { name: 'Sign In' })).toBeVisible()
  })
})

test.describe('Landing Page - Footer', () => {
  test('displays footer content', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Scroll to footer and wait for it to be visible
    const footer = page.locator('footer')
    await footer.scrollIntoViewIfNeeded()
    await expect(footer).toBeVisible({ timeout: 5000 })

    // Check footer links exist
    await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('link', { name: 'Terms' })).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('link', { name: 'Contact' })).toBeVisible({ timeout: 5000 })
    // Check copyright text
    await expect(page.getByText(/Scheduler Systems Ltd/i)).toBeVisible({ timeout: 5000 })
  })

  // Regression test: copyright year should be dynamic
  // This test mocks the clock to 2027 to verify year is NOT hardcoded
  test('displays dynamic year in copyright - not hardcoded', async ({ page }) => {
    // Mock clock to January 1, 2027
    await page.clock.install({ time: new Date('2027-01-01T00:00:00') })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    const footer = page.locator('footer')
    await footer.scrollIntoViewIfNeeded()

    // Footer should display 2027 (mocked year), NOT hardcoded 2026
    // If hardcoded, this test will FAIL
    await expect(page.getByText('© 2027 Scheduler Systems Ltd.')).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Landing Page - Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('header adapts to mobile', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Logo should still be visible
    await expect(page.getByText('gal.run').first()).toBeVisible()
    // On mobile, hamburger menu button should be visible
    const hamburgerButton = page.getByRole('button', { name: 'Toggle mobile menu' })
    await expect(hamburgerButton).toBeVisible()
  })

  // SKIPPED: Email form not yet implemented on website
  test.skip('hero section is usable on mobile', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Email form should be visible and usable
    await expect(page.getByPlaceholder('Enter your work email').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Get in Touch/i }).first()).toBeVisible()
  })

  // SKIPPED: Claude Code agent icons removed from current design
  test.skip('compatible agents wrap on mobile', async ({ page }) => {
    await page.goto('/')

    // Agent icons were removed from the hero section in the current design
    // This test should be updated when agent icons are added back
  })
})

test.describe('Landing Page - Accessibility', () => {
  test('page has proper heading hierarchy', async ({ page }) => {
    await page.goto('/')

    // Check for h1
    const h1Count = await page.locator('h1').count()
    expect(h1Count).toBeGreaterThanOrEqual(1)

    // Check for h2 headings in sections
    const h2Count = await page.locator('h2').count()
    expect(h2Count).toBeGreaterThan(0)
  })

  test('images have alt text or are decorative', async ({ page }) => {
    await page.goto('/')

    // SVG icons are decorative, check that main images have alt
    const images = page.locator('img')
    const count = await images.count()

    for (let i = 0; i < count; i++) {
      const img = images.nth(i)
      const alt = await img.getAttribute('alt')
      const role = await img.getAttribute('role')
      // Either has alt text or is marked as decorative/presentation
      expect(alt !== null || role === 'presentation' || role === 'img').toBeTruthy()
    }
  })

  // SKIPPED: Email form not yet implemented on website
  test.skip('form inputs have labels', async ({ page }) => {
    await page.goto('/')

    // Email inputs should be accessible
    const emailInputs = page.getByPlaceholder('Enter your work email')
    const count = await emailInputs.count()
    expect(count).toBeGreaterThan(0)
  })

  test('buttons are keyboard accessible', async ({ page }) => {
    await page.goto('/')

    // Tab to the first interactive element and check focus
    await page.keyboard.press('Tab')
    const focusedElement = page.locator(':focus')
    await expect(focusedElement).toBeVisible()
  })
})

test.describe('Landing Page - Performance', () => {
  test('page loads within acceptable time', async ({ page }) => {
    const startTime = Date.now()
    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')
    const loadTime = Date.now() - startTime

    // Page should load DOM within 5 seconds
    expect(loadTime).toBeLessThan(5000)
  })

  test('hero section is visible quickly', async ({ page }) => {
    await page.goto('/')

    // Hero content should be visible almost immediately
    // Use exact match to avoid matching "2. Governance Layer" in diagram
    await expect(page.getByText('Governance Layer', { exact: true }).first()).toBeVisible({ timeout: 3000 })
  })
})
