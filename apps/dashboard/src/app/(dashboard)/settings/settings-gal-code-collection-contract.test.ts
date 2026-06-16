import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const settingsPageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

describe('settings GAL Code collection contract', () => {
  it('surfaces the shared GAL Code interactive session collection toggle in dashboard settings', () => {
    expect(settingsPageSource).toContain('GAL Code Session Collection')
    expect(settingsPageSource).toContain('api.getUserSettings()')
    expect(settingsPageSource).toContain('api.updateUserSettings(nextSettings)')
    expect(settingsPageSource).toContain('gal config set galCodeSessionCollection false')
  })
})
