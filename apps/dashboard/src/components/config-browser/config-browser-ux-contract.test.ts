import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const approvedConfigClientSource = readFileSync(
  join(__dirname, '../../app/(dashboard)/approved-config/ApprovedConfigClient.tsx'),
  'utf8',
)

const codeViewerSource = readFileSync(
  join(__dirname, 'CodeViewer.tsx'),
  'utf8',
)

const configDiffSource = readFileSync(
  join(__dirname, 'ConfigDiff.tsx'),
  'utf8',
)

const configDiffHeaderSource = readFileSync(
  join(__dirname, 'ConfigDiffHeader.tsx'),
  'utf8',
)

const configDiffMultiSource = readFileSync(
  join(__dirname, 'ConfigDiffMulti.tsx'),
  'utf8',
)

describe('config-browser UX regression contracts', () => {
  it('keeps per-item file preview controls and modal state in Approved Config (#3052)', () => {
    expect(approvedConfigClientSource).toContain('// Per-item file preview modal state (#3052)')
    expect(approvedConfigClientSource).toContain('const [filePreviewItem, setFilePreviewItem] = useState<')
    expect(approvedConfigClientSource).toContain('title="Preview file content"')
    expect(approvedConfigClientSource).toContain('{/* Per-Item File Preview Modal (#3052) */}')
  })

  it('keeps compare view full-height with independent scrollable diff content in modal layout (#2894)', () => {
    expect(configDiffSource).toContain('flex h-full min-h-0 flex-col overflow-hidden')
    expect(configDiffSource).toContain('flex-1 min-h-0 overflow-y-auto')
    expect(configDiffMultiSource).toContain('relative flex h-full min-h-0 flex-col overflow-hidden')
    expect(configDiffMultiSource).toContain('h-full overflow-y-auto p-4 pb-6')
  })

  it('keeps compare-view header identity and sticky controls for multi-file diff UX (#2888, #2887)', () => {
    expect(configDiffHeaderSource).toContain('data-config-diff-header')
    expect(configDiffHeaderSource).toContain('Compare changes')
    expect(configDiffHeaderSource).toContain('Select left comparison repo')
    expect(configDiffHeaderSource).toContain('Select right comparison repo')
    expect(configDiffHeaderSource).toContain('sticky top-0 z-40')
    expect(configDiffHeaderSource).toContain('Compare all')
  })

  it('keeps code viewer theme-background stripping so lines are not globally highlighted in dark mode (#2892)', () => {
    expect(codeViewerSource).toContain('oneDark')
    expect(codeViewerSource).toContain("background: 'transparent'")
    expect(codeViewerSource).toContain("backgroundColor: 'var(--bg-code)'")
    expect(codeViewerSource).toContain('making every line look highlighted')
  })
})
