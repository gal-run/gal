import { expect, test } from '@playwright/test'

test.describe('enforcement tier onboarding smoke', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/enforcement')
    await page.waitForLoadState('domcontentloaded')

    await Promise.race([
      page.waitForSelector('h1', { timeout: 15000 }),
      page.waitForURL('**/login', { timeout: 15000 }),
    ]).catch(() => {})

    if (page.url().includes('/login')) {
      test.skip(true, 'Redirected to login - auth state not applied')
    }
  })

  test('renders enforcement onboarding landing', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Enforcement' })).toBeVisible()
    await expect(page.getByText('Onboarding Checklist')).toBeVisible()
  })

  test('renders settings and compliance surfaces', async ({ page }) => {
    await page.goto('/enforcement/settings')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: 'Enforcement Settings' })).toBeVisible()

    await page.goto('/enforcement/compliance')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByRole('heading', { name: 'Compliance Status' })).toBeVisible()
  })
})
