import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const approvedConfigClientSource = readFileSync(
  join(__dirname, 'ApprovedConfigClient.tsx'),
  'utf8',
)

const configListSource = readFileSync(
  join(__dirname, '../../../components/config-browser/ConfigList.tsx'),
  'utf8',
)

const configListItemSource = readFileSync(
  join(__dirname, '../../../components/config-browser/ConfigListItem.tsx'),
  'utf8',
)

const bulkApproveDialogSource = readFileSync(
  join(__dirname, '../../../components/discovery/BulkApproveDialog.tsx'),
  'utf8',
)

const policySelectorSource = readFileSync(
  join(__dirname, '../../../components/approved-config/PolicySelector.tsx'),
  'utf8',
)

const globalsCssSource = readFileSync(
  join(__dirname, '../../../app/globals.css'),
  'utf8',
)

describe('approved-config layout/style contracts', () => {
  it('keeps approved-config page constrained and modal bodies scrollable for long content (#1100, #2815)', () => {
    expect(approvedConfigClientSource).toContain('className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto"')
    expect(approvedConfigClientSource).toContain('max-h-[85vh] overflow-hidden flex flex-col')
    expect(approvedConfigClientSource).toContain('flex-1 overflow-y-auto min-h-0')
  })

  it('keeps modal action rows visible while long modal content scrolls (#2811, #2813, #2814)', () => {
    expect(approvedConfigClientSource).toContain('max-h-[85vh] overflow-hidden flex flex-col')
    expect(approvedConfigClientSource).toContain('className="p-6 flex-1 overflow-y-auto min-h-0"')
    expect(approvedConfigClientSource).toContain('className="flex justify-end gap-3 p-6 pt-4"')
    expect(approvedConfigClientSource).toContain('className="flex justify-between gap-3 p-6 pt-4"')

    expect(bulkApproveDialogSource).toContain('className="relative w-full max-w-2xl mx-4 rounded-xl shadow-2xl max-h-[85vh] flex flex-col"')
    expect(bulkApproveDialogSource).toContain('className="p-6 overflow-y-auto flex-1"')
    expect(bulkApproveDialogSource).toContain('className="flex items-center justify-between gap-3 p-4 border-t flex-shrink-0"')
  })

  it('keeps config list cards and text color tokens compatible with dark mode surfaces (#2268)', () => {
    expect(configListSource).toContain("style={{ backgroundColor: 'var(--bg-secondary)' }}")
    expect(configListItemSource).toContain("backgroundColor: isSelected ? 'var(--accent-bg)' : 'var(--bg-tertiary)'")
    expect(configListItemSource).toContain("border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)'")
    expect(configListItemSource).toContain("style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}")
  })

  it('keeps active policy badges tokenized for contrast across themes (#4739)', () => {
    expect(policySelectorSource).toContain("style={{ background: 'var(--badge-active-bg)', color: 'var(--badge-active-text)' }}")
    expect(globalsCssSource).toContain('--badge-active-bg: #000000;')
    expect(globalsCssSource).toContain('--badge-active-text: #ffffff;')
    expect(globalsCssSource).toContain('--badge-active-bg: #ffffff;')
    expect(globalsCssSource).toContain('--badge-active-text: #000000;')
  })

  it('marks the built-in SDLC policy and hides destructive actions for it', () => {
    expect(policySelectorSource).toContain('Built-in GAL template')
    expect(policySelectorSource).toContain('policy.isBuiltin')
    expect(policySelectorSource).toContain('!policy.isBuiltin && (')
  })

  // NOTE: The companion guard for the CLI session-start sync notification
  // (postinstall.cjs embeds state.policyName in its syncMessage, #4677 Bug 1)
  // lives in the separate gal CLI repo, which is not part of this OSS monorepo.
  // It is enforced there, not here.

  it('handleSelectPolicy loads selected policy config into configBundle (#4677 Bug 3)', () => {
    // Clicking a policy in the PolicySelector must immediately populate configBundle
    // so the config sections below update to show that policy's contents.
    expect(approvedConfigClientSource).toContain('const handleSelectPolicy = (policy: ConfigPolicyItem) => {')
    expect(approvedConfigClientSource).toContain('setSelectedPolicyId(policy.id)')
    expect(approvedConfigClientSource).toContain('setConfigBundle(')
    expect(approvedConfigClientSource).toContain('policyName: policy.name,')
  })
})
