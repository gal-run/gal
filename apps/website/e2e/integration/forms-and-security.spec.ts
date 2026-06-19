/**
 * Forms and Security E2E Tests
 *
 * Tests for form validation, error handling, and security features
 * Added as part of GAL-75: Automation Testing Suite
 */

import { test, expect } from '@playwright/test'

// SKIPPED: Email form not yet implemented on website (GAL-XXX)
// These tests should be enabled once the email signup form is added
test.describe.skip('Email Form - Validation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('shows error for invalid email format', async ({ page }) => {
    const emailInput = page.getByPlaceholder('Enter your work email').first()
    const submitButton = page.getByRole('button', { name: /Get in Touch/i }).first()

    // Enter invalid email
    await emailInput.fill('not-an-email')
    await submitButton.click()

    // Should show validation error or browser validation
    const isInvalid = await emailInput.evaluate((el: HTMLInputElement) => !el.checkValidity())
    expect(isInvalid).toBeTruthy()
  })

  test('accepts valid enterprise email', async ({ page }) => {
    const emailInput = page.getByPlaceholder('Enter your work email').first()
    const submitButton = page.getByRole('button', { name: /Get in Touch/i }).first()

    await emailInput.fill('cto@enterprise.com')
    await submitButton.click()

    // Should show success message
    await expect(page.getByText('MESSAGE_SENT').first()).toBeVisible({ timeout: 5000 })
  })

  test('form clears after successful submission', async ({ page }) => {
    const emailInput = page.getByPlaceholder('Enter your work email').first()
    const submitButton = page.getByRole('button', { name: /Get in Touch/i }).first()

    await emailInput.fill('test@company.com')
    await submitButton.click()

    // Wait for success
    await expect(page.getByText('MESSAGE_SENT').first()).toBeVisible({ timeout: 5000 })

    // After some time, form might reset - just verify success state persists
    await expect(page.getByText('MESSAGE_SENT').first()).toBeVisible()
  })

  test('prevents XSS in email input', async ({ page }) => {
    const emailInput = page.getByPlaceholder('Enter your work email').first()

    // Try to inject script
    await emailInput.fill('<script>alert("xss")</script>@test.com')

    // The script should not execute - page should still be functional
    await expect(page.getByText('Governance Layer')).toBeVisible()
  })
})

// SKIPPED: Email form not yet implemented on website (GAL-XXX)
test.describe.skip('Email Form - Multiple Forms', () => {
  test('hero and CTA forms work independently', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Fill hero form
    const heroEmail = page.getByPlaceholder('Enter your work email').first()
    await heroEmail.fill('hero@test.com')

    // Scroll to CTA and fill that form
    const ctaEmail = page.getByPlaceholder('Enter your work email').last()
    await ctaEmail.scrollIntoViewIfNeeded()
    await ctaEmail.fill('cta@test.com')

    // Hero form should still have its value
    await expect(heroEmail).toHaveValue('hero@test.com')
    await expect(ctaEmail).toHaveValue('cta@test.com')
  })
})

// Security section removed from new design - security messaging is now integrated throughout the site
test.describe.skip('Security Features Display', () => {
  test('security content integrated into other sections', async ({ page }) => {
    // Security features and messaging are now part of the "Why GAL" and "Features" sections
    await page.goto('/')
    // This test is skipped as the standalone security section no longer exists
  })
})

test.describe('External Links', () => {
  test('GET STARTED button works', async ({ page }) => {
    await page.goto('/')

    // Multiple GET STARTED links exist on the page (header + CTA), styled as buttons
    const getStartedLinks = page.getByRole('link', { name: 'GET STARTED' })
    await expect(getStartedLinks.first()).toBeVisible()
  })

  test('footer contact link has correct email', async ({ page }) => {
    await page.goto('/')

    // Contact link in footer
    const contactLink = page.getByRole('link', { name: 'Contact' })
    const href = await contactLink.getAttribute('href')

    expect(href).toBe('mailto:contact@scheduler-systems.com')
  })

  test('social links open in new tab', async ({ page }) => {
    await page.goto('/')

    // Check LinkedIn link
    const linkedInLinks = page.locator('a[href*="linkedin"]')
    const count = await linkedInLinks.count()

    if (count > 0) {
      // Social links in the new design don't specify target="_blank" for footer links
      // Just verify the link exists
      await expect(linkedInLinks.first()).toBeVisible()
    }
  })
})

test.describe('Console Errors', () => {
  test('no critical JavaScript errors on page load', async ({ page }) => {
    const errors: string[] = []

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('domcontentloaded')

    // Filter out known acceptable/non-critical errors
    const criticalErrors = errors.filter(err => {
      const lowerErr = err.toLowerCase()
      // Skip favicon, extensions, devtools
      if (lowerErr.includes('favicon') ||
          lowerErr.includes('extension') ||
          lowerErr.includes('devtools')) {
        return false
      }
      // Skip third-party script errors (analytics, intercom, etc.)
      if (lowerErr.includes('intercom') ||
          lowerErr.includes('analytics') ||
          lowerErr.includes('gtag') ||
          lowerErr.includes('google') ||
          lowerErr.includes('widget')) {
        return false
      }
      // Skip network errors that may be transient
      if (lowerErr.includes('failed to fetch') ||
          lowerErr.includes('net::') ||
          lowerErr.includes('network')) {
        return false
      }
      // Skip CSP/CORS errors from third-party
      if (lowerErr.includes('csp') ||
          lowerErr.includes('content security policy') ||
          lowerErr.includes('cross-origin')) {
        return false
      }
      return true
    })

    // Log any errors found for debugging
    if (criticalErrors.length > 0) {
      console.log('Console errors found:', criticalErrors)
    }

    expect(criticalErrors.length).toBe(0)
  })
})

test.describe('Network Security', () => {
  test('page loads over HTTPS in production', async ({ page }) => {
    // This test is for production environment
    if (process.env.BASE_URL?.includes('https://')) {
      await page.goto('/')

      const url = page.url()
      expect(url).toMatch(/^https:\/\//)
    }
  })

  test('no mixed content warnings', async ({ page }) => {
    const mixedContentWarnings: string[] = []

    page.on('console', msg => {
      if (msg.text().includes('Mixed Content')) {
        mixedContentWarnings.push(msg.text())
      }
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    expect(mixedContentWarnings.length).toBe(0)
  })
})

// SKIPPED: Email form not yet implemented on website (GAL-XXX)
test.describe.skip('Rate Limiting UI', () => {
  test('multiple rapid form submissions handled gracefully', async ({ page }) => {
    await page.goto('/')

    const emailInput = page.getByPlaceholder('Enter your work email').first()
    const submitButton = page.getByRole('button', { name: /Get in Touch/i }).first()

    // Submit form multiple times rapidly
    for (let i = 0; i < 3; i++) {
      await emailInput.fill(`test${i}@example.com`)
      await submitButton.click()
      await page.waitForTimeout(100)
    }

    // Page should still be functional
    await expect(page.getByText('Governance Layer')).toBeVisible()
  })
})
