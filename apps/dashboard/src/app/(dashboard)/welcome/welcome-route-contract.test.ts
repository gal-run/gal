import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const welcomePageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

const extensionServiceWorkerSource = readFileSync(
  join(__dirname, '../../../../../chrome-extension/src/background/service-worker.ts'),
  'utf8',
)

describe('welcome route contracts', () => {
  it('keeps dashboard welcome route and extension open-url alignment to avoid install-time 404s (#2797)', () => {
    expect(welcomePageSource).toContain('Route: /welcome')
    expect(welcomePageSource).toContain('Welcome to GAL')
    expect(extensionServiceWorkerSource).toContain('chrome.tabs.create({ url: "https://app.gal.run/welcome" });')
  })
})
