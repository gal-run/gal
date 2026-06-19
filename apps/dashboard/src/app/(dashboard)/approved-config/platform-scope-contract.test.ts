import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const approvedConfigClientSource = readFileSync(
  join(__dirname, 'ApprovedConfigClient.tsx'),
  'utf8',
)

describe('approved-config platform scoping contracts', () => {
  it('keeps approved-config publishing scoped to the unified Claude platform until multi-platform staging is enabled (#1099)', () => {
    expect(approvedConfigClientSource).toContain(
      "const APPROVED_CONFIG_PLATFORM: AgentPlatform = 'claude'",
    )
    expect(approvedConfigClientSource).toContain(
      'const claudeSelections = payload.selections.filter(s => !s.platform || s.platform === \'claude\')',
    )
    expect(approvedConfigClientSource).toContain(
      'non-Claude platform staging not yet supported',
    )
  })
})
