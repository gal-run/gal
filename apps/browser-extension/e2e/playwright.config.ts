import { defineConfig } from '@playwright/test'
import path from 'path'

/**
 * Playwright configuration for Chrome extension E2E tests.
 *
 * Extension E2E tests require a real Chromium browser with the unpacked
 * extension loaded via --load-extension. Headless mode is supported via
 * --headless=new (Chrome 112+).
 *
 * Usage:
 *   pnpm test:e2e            - run all extension E2E tests
 *   pnpm test:e2e --headed   - run with visible browser
 */

const EXTENSION_PATH = path.resolve(__dirname, '../dist')

export default defineConfig({
  testDir: './tests',
  fullyParallel: false, // Extension tests share a browser profile; run serially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Single worker: one Chrome instance with the extension loaded
  timeout: process.env.CI ? 60_000 : 30_000,
  reporter: [
    ['html', { open: 'never' }],
    ['list', { printSteps: true }],
  ],

  use: {
    // Screenshot/trace on failure for debugging
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      name: 'chrome-extension',
      use: {
        // Chrome is the only browser that supports loading unpacked extensions
        // via command-line flags in Playwright.
        browserName: 'chromium',
        channel: 'chromium', // use bundled chromium, not system Chrome
        // Launch args that load the unpacked extension
        launchOptions: {
          args: [
            `--disable-extensions-except=${EXTENSION_PATH}`,
            `--load-extension=${EXTENSION_PATH}`,
            // Allow extension in headless mode (Chrome 112+)
            '--headless=new',
          ],
          headless: false, // headless=new is set via args above
        },
      },
    },
  ],
})
