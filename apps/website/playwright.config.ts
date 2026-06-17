import { defineConfig, devices } from '@playwright/test'

// Use different port for CI to avoid conflicts with dev server on self-hosted runners
const BASE_PORT = process.env.CI ? 4174 : 4173
const LOCAL_URL = `http://localhost:${BASE_PORT}`

// Use BASE_URL from environment if provided (for deployed previews), otherwise use localhost
const BASE_URL = process.env.BASE_URL || LOCAL_URL
const IS_DEPLOYED = !!process.env.BASE_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0, // More retries in CI
  // STABILITY: 1 worker in CI to prevent race conditions
  // Local: auto workers for fast development feedback
  workers: process.env.CI ? 1 : undefined, // undefined = auto
  timeout: process.env.CI ? 60000 : 30000, // Longer timeout in CI
  reporter: [
    ['html', { open: 'never' }],
    ['list', { printSteps: true }]
  ],
  testIgnore: [
    '**/demos/**'
  ],

  use: {
    baseURL: BASE_URL,
    // trace viewer provides better debugging than videos
    trace: 'retain-on-failure', // Full trace on failure (timeline + network + DOM)
    screenshot: 'only-on-failure',
    video: 'off', // Traces are more comprehensive than videos
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // When testing deployed previews (BASE_URL set), skip webServer
  // Otherwise start local preview server
  webServer: IS_DEPLOYED ? undefined : {
    command: process.env.CI
      ? `pnpm preview --port ${BASE_PORT}`
      : 'pnpm build && pnpm preview',
    url: LOCAL_URL,
    reuseExistingServer: !process.env.CI, // Don't reuse in CI - we want fresh server
    timeout: 120000,
  },
})
