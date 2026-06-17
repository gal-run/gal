/**
 * GAL Marketing Demo Recording Script
 *
 * Creates a smooth demo video for marketing purposes.
 * Records the landing page with all animations and key features.
 *
 * Run with: npx playwright test marketing-demo-recording.spec.ts --headed --project=chromium
 *
 * For video recording, use:
 * npx playwright test marketing-demo-recording.spec.ts --headed --project=chromium --video=on
 */

import { test } from '@playwright/test'
import type { Page } from '@playwright/test'

// Timing constants for smooth recording
const SCENE_PAUSE = 4000      // Main scene pauses
const SCROLL_PAUSE = 2000     // Pause after scrolling
const ELEMENT_PAUSE = 1500    // Pause after element interactions
const ANIMATION_PAUSE = 3000  // Wait for animations

async function smoothScroll(page: Page, selector: string) {
  await page.locator(selector).scrollIntoViewIfNeeded()
  await page.waitForTimeout(SCROLL_PAUSE)
}

async function pause(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Configure video recording and viewport at file level
test.use({
  viewport: { width: 1920, height: 1080 },
  video: 'on',
  launchOptions: {
    slowMo: 100 // Smooth animations
  }
})

test.describe('GAL Marketing Demo Recording', () => {
  // Extended timeout for demo recording
  test.setTimeout(300000)

  test('Complete Landing Page Demo - Full Tour', async ({ page }) => {
    // ═══════════════════════════════════════════════════════════════════
    // SCENE 1: HERO SECTION - Matrix Rain & Value Proposition
    // ═══════════════════════════════════════════════════════════════════
    console.log('\n--- SCENE 1: Hero Section ---')

    await page.goto('/', { waitUntil: 'networkidle' })

    // Let Matrix rain animation play
    await pause(ANIMATION_PAUSE)

    // Take hero screenshot
    await page.screenshot({
      path: 'demo-screenshots/01-hero-matrix-rain.png',
      fullPage: false
    })

    await pause(SCENE_PAUSE)

    // ═══════════════════════════════════════════════════════════════════
    // SCENE 2: COMPATIBLE AGENTS
    // ═══════════════════════════════════════════════════════════════════
    console.log('--- SCENE 2: Compatible Agents ---')

    // Hover over compatible agents to show interactivity
    const agents = ['Claude Code', 'Cursor', 'Windsurf', 'GitHub Copilot', 'Devin']
    for (const agent of agents) {
      await page.getByText(agent).first().hover()
      await pause(400)
    }

    await page.screenshot({
      path: 'demo-screenshots/02-compatible-agents.png',
      fullPage: false
    })

    await pause(ELEMENT_PAUSE)

    // ═══════════════════════════════════════════════════════════════════
    // SCENE 3: TERMINAL DEMO - Live Security
    // ═══════════════════════════════════════════════════════════════════
    console.log('--- SCENE 3: Terminal Demo ---')

    await smoothScroll(page, '.terminal')

    await page.screenshot({
      path: 'demo-screenshots/03-terminal-demo.png',
      fullPage: false
    })

    await pause(SCENE_PAUSE)

    // ═══════════════════════════════════════════════════════════════════
    // SCENE 4: THE PROBLEM
    // ═══════════════════════════════════════════════════════════════════
    console.log('--- SCENE 4: The Problem ---')

    await smoothScroll(page, '#why-gal')

    // Hover over problem cards
    const problemCards = page.locator('.glass-card').filter({ hasText: 'Trap' })
    const problemCount = await problemCards.count()

    for (let i = 0; i < problemCount; i++) {
      await problemCards.nth(i).hover()
      await pause(800)
    }

    await page.screenshot({
      path: 'demo-screenshots/04-problem-statement.png',
      fullPage: false
    })

    await pause(SCENE_PAUSE)

    // ═══════════════════════════════════════════════════════════════════
    // SCENE 5: THE SOLUTION - How GAL Works
    // ═══════════════════════════════════════════════════════════════════
    console.log('--- SCENE 5: How GAL Works ---')

    await smoothScroll(page, '#how-it-works')

    await page.screenshot({
      path: 'demo-screenshots/05-how-it-works.png',
      fullPage: false
    })

    await pause(SCENE_PAUSE)

    // ═══════════════════════════════════════════════════════════════════
    // SCENE 6: CORE FEATURES
    // ═══════════════════════════════════════════════════════════════════
    console.log('--- SCENE 6: Core Features ---')

    await smoothScroll(page, '#features')

    // Hover over feature cards for glow effect
    const featureCards = page.locator('#features .glass-card')
    const featureCount = await featureCards.count()

    for (let i = 0; i < Math.min(featureCount, 6); i++) {
      await featureCards.nth(i).hover()
      await pause(500)
    }

    await page.screenshot({
      path: 'demo-screenshots/06-core-features.png',
      fullPage: false
    })

    await pause(SCENE_PAUSE)

    // ═══════════════════════════════════════════════════════════════════
    // SCENE 7: PRICING
    // ═══════════════════════════════════════════════════════════════════
    console.log('--- SCENE 7: Pricing ---')

    await smoothScroll(page, '#pricing')

    // Highlight Pro plan (popular)
    const proPlan = page.locator('.glass-card').filter({ hasText: 'MOST POPULAR' })
    await proPlan.hover()

    await page.screenshot({
      path: 'demo-screenshots/07-pricing-plans.png',
      fullPage: false
    })

    await pause(ELEMENT_PAUSE)

    // Show full feature comparison
    const showAllButton = page.getByText('Show all features')
    if (await showAllButton.isVisible()) {
      await showAllButton.click()
      await pause(SCROLL_PAUSE)

      await page.screenshot({
        path: 'demo-screenshots/08-feature-comparison.png',
        fullPage: true
      })
    }

    await pause(SCENE_PAUSE)

    // ═══════════════════════════════════════════════════════════════════
    // SCENE 8: LAUNCH COUNTDOWN
    // ═══════════════════════════════════════════════════════════════════
    console.log('--- SCENE 8: Launch Countdown ---')

    await smoothScroll(page, '#waitlist-section')

    await page.screenshot({
      path: 'demo-screenshots/09-countdown-waitlist.png',
      fullPage: false
    })

    await pause(SCENE_PAUSE)

    // ═══════════════════════════════════════════════════════════════════
    // SCENE 9: ENTERPRISE SECURITY
    // ═══════════════════════════════════════════════════════════════════
    console.log('--- SCENE 9: Enterprise Security ---')

    await smoothScroll(page, '#security')

    // Hover over compliance badges
    const badges = page.locator('.compliance-badge, [class*="rounded-lg"]').filter({ hasText: /SOC|GDPR|ISO|HIPAA/i })
    const badgeCount = await badges.count()

    for (let i = 0; i < Math.min(badgeCount, 5); i++) {
      await badges.nth(i).hover()
      await pause(400)
    }

    await page.screenshot({
      path: 'demo-screenshots/10-enterprise-security.png',
      fullPage: false
    })

    await pause(SCENE_PAUSE)

    // ═══════════════════════════════════════════════════════════════════
    // SCENE 10: VISION & CTA
    // ═══════════════════════════════════════════════════════════════════
    console.log('--- SCENE 10: Vision & CTA ---')

    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }))
    await pause(SCROLL_PAUSE)

    await page.screenshot({
      path: 'demo-screenshots/11-vision-cta.png',
      fullPage: false
    })

    await pause(SCENE_PAUSE)

    // ═══════════════════════════════════════════════════════════════════
    // SCENE 11: EMAIL SIGNUP INTERACTION
    // ═══════════════════════════════════════════════════════════════════
    console.log('--- SCENE 11: Email Signup ---')

    await page.goto('/', { waitUntil: 'networkidle' })
    await pause(ELEMENT_PAUSE)

    // Type email slowly for demo effect
    const emailInput = page.getByPlaceholder('Enter your work email').first()
    await emailInput.click()
    await emailInput.type('demo@enterprise.com', { delay: 100 })

    await pause(ELEMENT_PAUSE)

    // Click submit
    await page.getByRole('button', { name: /Get in Touch/i }).first().click()

    // Wait for success animation
    await pause(ANIMATION_PAUSE)

    await page.screenshot({
      path: 'demo-screenshots/12-signup-success.png',
      fullPage: false
    })

    console.log('\n=== DEMO RECORDING COMPLETE ===')
    console.log('Screenshots saved to: demo-screenshots/')
    console.log('Video saved to: test-results/')
  })

  test('Mobile Demo - Responsive Showcase', async ({ page }) => {
    // Mobile viewport
    await page.setViewportSize({ width: 375, height: 812 })

    console.log('\n--- MOBILE DEMO ---')

    await page.goto('/', { waitUntil: 'networkidle' })
    await pause(ANIMATION_PAUSE)

    await page.screenshot({
      path: 'demo-screenshots/mobile-01-hero.png',
      fullPage: false
    })

    // Scroll through mobile view
    await smoothScroll(page, '.terminal')
    await page.screenshot({
      path: 'demo-screenshots/mobile-02-terminal.png',
      fullPage: false
    })

    await smoothScroll(page, '#features')
    await page.screenshot({
      path: 'demo-screenshots/mobile-03-features.png',
      fullPage: false
    })

    await smoothScroll(page, '#pricing')
    await page.screenshot({
      path: 'demo-screenshots/mobile-04-pricing.png',
      fullPage: false
    })

    console.log('=== MOBILE DEMO COMPLETE ===')
  })

  test('Tablet Demo - iPad Showcase', async ({ page }) => {
    // iPad viewport
    await page.setViewportSize({ width: 768, height: 1024 })

    console.log('\n--- TABLET DEMO ---')

    await page.goto('/', { waitUntil: 'networkidle' })
    await pause(ANIMATION_PAUSE)

    await page.screenshot({
      path: 'demo-screenshots/tablet-01-hero.png',
      fullPage: false
    })

    await smoothScroll(page, '#pricing')
    await page.screenshot({
      path: 'demo-screenshots/tablet-02-pricing.png',
      fullPage: false
    })

    console.log('=== TABLET DEMO COMPLETE ===')
  })
})

test.describe('GAL Quick Clips', () => {
  // Short clips for social media
  test.setTimeout(60000)

  test('Matrix Rain Clip - 5 seconds', async ({ page }) => {
    await page.setViewportSize({ width: 1080, height: 1080 }) // Square for Instagram
    await page.goto('/', { waitUntil: 'networkidle' })

    // Just capture the matrix rain effect
    await pause(5000)

    await page.screenshot({
      path: 'demo-screenshots/clip-matrix-square.png',
      fullPage: false
    })
  })

  test('Terminal Demo Clip', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/', { waitUntil: 'networkidle' })

    await smoothScroll(page, '.terminal')
    await pause(3000)

    await page.screenshot({
      path: 'demo-screenshots/clip-terminal.png',
      fullPage: false
    })
  })

  test('Pricing Table Clip', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.goto('/', { waitUntil: 'networkidle' })

    await smoothScroll(page, '#pricing')
    await pause(2000)

    await page.screenshot({
      path: 'demo-screenshots/clip-pricing.png',
      fullPage: false
    })
  })
})
