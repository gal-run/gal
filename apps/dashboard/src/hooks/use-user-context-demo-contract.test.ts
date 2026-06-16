import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const useUserContextSource = readFileSync(
  join(__dirname, 'useUserContext.ts'),
  'utf8',
)

describe('useUserContext demo-mode contracts', () => {
  it('keeps demo-mode guard in place before user-context network fetches (#3047)', () => {
    expect(useUserContextSource).toContain('if (isDemoMode()) {')
    expect(useUserContextSource).toContain('setContext(DEMO_USER_CONTEXT)')
    expect(useUserContextSource).toContain('return;')
    expect(useUserContextSource).toContain("await fetch(`${API_BASE_URL}/api/user/context`, {")
  })
})
