import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pageSource = readFileSync(join(__dirname, 'page.tsx'), 'utf8')

describe('browser profiles page internal guard (#5442)', () => {
  it('gates the page behind internal workspace visibility before loading profile data', () => {
    expect(pageSource).toContain("useIsInternalWorkspace")
    expect(pageSource).toContain("useSelectedWorkspace")
    expect(pageSource).toContain("isPageVisibleForUser('browser-profiles', userOrgs, selectedWorkspace)")
    expect(pageSource).toContain('const isVisible = isInternalWorkspace && isPageVisibleForUser(\'browser-profiles\', userOrgs, selectedWorkspace)')
    expect(pageSource).toContain('if (!isVisible)')
    expect(pageSource).toContain('Browser profiles are only available to internal users.')
  })
})
