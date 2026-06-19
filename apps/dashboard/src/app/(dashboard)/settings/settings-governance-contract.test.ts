import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const settingsPageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

describe('settings governance contracts', () => {
  it('keeps visible shortcuts for rate cards and token spend from Settings (#6296, #6297)', () => {
    expect(settingsPageSource).toContain('href="/settings/rate-cards"')
    expect(settingsPageSource).toContain('href="/governance/token-spend"')
    expect(settingsPageSource).toContain('Edit model prices used for token spend calculations.')
    expect(settingsPageSource).toContain('Review usage and manage budget alerts with webhooks.')
    expect(settingsPageSource).toContain('Governance')
  })
})
