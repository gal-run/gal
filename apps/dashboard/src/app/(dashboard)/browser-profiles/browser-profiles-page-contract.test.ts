import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const browserProfilesPageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

describe('browser profiles page UX contracts', () => {
  it('keeps extension-first guidance and storageState JSON import as the fallback', () => {
    expect(browserProfilesPageSource).toContain('Browser profiles allow background agents to access authenticated web resources.')
    expect(browserProfilesPageSource).toContain('Use the GAL Chrome extension to capture cookies and storage state from authenticated')
    expect(browserProfilesPageSource).toContain('Upload Profile')
    expect(browserProfilesPageSource).toContain('Paste your storageState JSON from the Chrome extension...')
    expect(browserProfilesPageSource).toContain('You can also paste storageState JSON directly using')
    expect(browserProfilesPageSource).toContain('If you keep more than one active profile,')
  })
})
