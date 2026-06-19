import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const welcomePageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

// NOTE: The companion guard for the chrome-extension open-url alignment lives
// in the separate gal chrome-extension repo, which is not part of this OSS
// monorepo. It is enforced there, not here. We keep the dashboard-side
// guarantee (the /welcome route exists) so the extension target never 404s.
describe('welcome route contracts', () => {
  it('keeps dashboard welcome route present so the extension open-url never 404s at install time (#2797)', () => {
    expect(welcomePageSource).toContain('Route: /welcome')
    expect(welcomePageSource).toContain('Welcome to GAL')
  })
})
