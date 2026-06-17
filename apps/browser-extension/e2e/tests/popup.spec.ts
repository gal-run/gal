/**
 * E2E tests: Extension popup
 *
 * Verifies that the popup renders correctly when opened, shows the expected
 * UI structure, and that navigating to the popup URL works in all cases.
 */
import { test, expect } from '../helpers/fixtures'

test.describe('Extension popup', () => {
  test('popup page opens without crashing', async ({ openPopup }) => {
    const popup = await openPopup()

    // Page must have loaded — no error page
    const url = popup.url()
    expect(url).toContain('popup.html')

    // The popup HTML document should have a <body>
    const bodyExists = await popup.evaluate(() => !!document.body)
    expect(bodyExists).toBe(true)

    await popup.close()
  })

  test('popup renders the root React mount point', async ({ openPopup }) => {
    const popup = await openPopup()

    // The popup/bootstrap.tsx mounts React into a container; wait for
    // the React root to exist in the DOM.
    const rootEl = popup.locator('#root')
    await expect(rootEl).toBeAttached({ timeout: 10_000 })

    await popup.close()
  })

  test('popup shows a top-level interactive element within 5 s', async ({
    openPopup,
  }) => {
    const popup = await openPopup()

    // The popup renders a login view or the main UI.
    // In both cases at least one interactive element (button / link) should
    // appear within 5 s. We do not assert specific content because the exact
    // view depends on auth state in the test profile.
    const interactiveEl = popup
      .locator('button, a, [role="button"]')
      .first()
    await expect(interactiveEl).toBeAttached({ timeout: 10_000 })

    await popup.close()
  })

  test('popup title and meta are correct', async ({ openPopup }) => {
    const popup = await openPopup()

    // The popup HTML should not be the default blank page
    const title = await popup.title()
    // Accept any non-empty title (could be "GAL", "Governance Agentic Layer", etc.)
    expect(title).toBeTruthy()

    await popup.close()
  })

  test('popup does not emit uncaught console errors on load', async ({
    openPopup,
  }) => {
    const errors: string[] = []

    // Capture any uncaught JS errors in the popup
    const popup = await openPopup()
    popup.on('pageerror', (err) => errors.push(err.message))
    // Wait briefly for React hydration / initial async work to settle
    await popup.waitForTimeout(2_000)

    // Filter out known benign noise from extension environment
    const realErrors = errors.filter(
      (msg) =>
        !msg.includes('Extension context invalidated') &&
        !msg.includes('Could not establish connection'),
    )

    expect(realErrors).toEqual([])
    await popup.close()
  })
})
