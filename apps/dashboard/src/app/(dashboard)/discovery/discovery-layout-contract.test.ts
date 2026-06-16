import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const discoverySource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

describe('discovery layout regression contracts', () => {
  it('keeps Discovery wired to the three-panel ConfigBrowser surface (#2816)', () => {
    expect(discoverySource).toContain('Three-panel Config Browser')
    expect(discoverySource).toContain('<ConfigBrowser')
    expect(discoverySource).toContain('groups={configGroups}')
    expect(discoverySource).toContain('approvedConfigs={approvedConfigs}')
    expect(discoverySource).toContain('onBulkApprove={handleBulkApprove}')
  })

  it('keeps Discovery in a single-page flow without legacy tab-state routing (#2827)', () => {
    expect(discoverySource).toContain('Auto-Discovery')
    expect(discoverySource).not.toContain('const [activeTab, setActiveTab]')
    expect(discoverySource).not.toContain('TabsList')
    expect(discoverySource).not.toContain('TabsTrigger')
  })
})
