import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/browser-profiles',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  reporter: [
    ['html', { open: 'never' }],
    ['list', { printSteps: true }],
  ],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
})
