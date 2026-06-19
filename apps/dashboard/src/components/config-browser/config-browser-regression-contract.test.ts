import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const configBrowserSource = readFileSync(
  join(__dirname, 'ConfigBrowser.tsx'),
  'utf8',
)

const configListSource = readFileSync(
  join(__dirname, 'ConfigList.tsx'),
  'utf8',
)

const configListItemSource = readFileSync(
  join(__dirname, 'ConfigListItem.tsx'),
  'utf8',
)

const configViewerSource = readFileSync(
  join(__dirname, 'ConfigViewer.tsx'),
  'utf8',
)

const configViewerToolbarSource = readFileSync(
  join(__dirname, 'ConfigViewerToolbar.tsx'),
  'utf8',
)

const configPresentationSource = readFileSync(
  join(__dirname, 'configPresentation.ts'),
  'utf8',
)

const sourcePickerPopoverSource = readFileSync(
  join(__dirname, 'SourcePickerPopover.tsx'),
  'utf8',
)

describe('config-browser regression contracts', () => {
  it('keeps source-picker popover semantics and recommendation badges (#3617)', () => {
    expect(sourcePickerPopoverSource).toContain('aria-label="Select source repository"')
    expect(sourcePickerPopoverSource).toContain('getRecommendedInstanceIndex')
    expect(sourcePickerPopoverSource).toContain('Recommended')
    expect(sourcePickerPopoverSource).toContain('Published')
    expect(sourcePickerPopoverSource).toContain('Latest')
  })

  it('keeps source-picker trigger and selected source wiring in list items (#3617)', () => {
    expect(configListItemSource).toContain('<SourcePickerPopover')
    expect(configListItemSource).toContain('selectedIndex={selectedVersionIndex}')
    expect(configListItemSource).toContain('onSelect={onSelectVersion}')
    expect(configListItemSource).toContain('title="Choose source repository"')
  })

  it('keeps Select All / Deselect All bulk selection controls in config list (#3054)', () => {
    expect(configListSource).toContain('Select All (')
    expect(configListSource).toContain('Deselect All')
    expect(configListSource).toContain('bulkSelection.selectAll(visibleKeys)')
    expect(configListSource).toContain('bulkSelection.clearAll()')
    expect(configListSource).toContain("aria-label={allSelected ? 'Deselect all configs' : 'Select all configs'}")
  })

  it('keeps multi-select checkbox reveal and selected-counter affordances (#3618)', () => {
    expect(configListItemSource).toContain('const revealCheckbox = isHovered || isChecked || anySelected')
    expect(configListSource).toContain('{selectionCount} selected')
    expect(configListSource).toContain('{bulkSelection.count} selected')
  })

  it('keeps Scan Now button wired via onRefreshScan into ConfigBrowser (#5649, #5662)', () => {
    // #5662: Scan Now moved to Discovery page header; ConfigBrowser accepts + calls onRefreshScan
    expect(configBrowserSource).toContain('onRefreshScan')
    expect(configBrowserSource).toContain('await onRefreshScan()')
  })

  it('keeps config-preview unavailability messaging aligned with re-sync guidance (#5904)', () => {
    expect(configBrowserSource).toContain('Config preview unavailable')
    expect(configBrowserSource).toContain('Settings > GitHub')
    expect(configBrowserSource).not.toContain('Try rescanning after installing the GitHub App')
  })

  it('keeps selection synced to the visible filtered list so the right panel cannot stay stale (#5905)', () => {
    expect(configBrowserSource).toContain('getVisibleConfigGroups(groups, {')
    expect(configBrowserSource).toContain('const selectedStillVisible =')
    expect(configBrowserSource).toContain('if (visibleGroups.length === 0) {')
    expect(configBrowserSource).toContain('setSelectedConfigKey(null)')
    expect(configViewerSource).toContain('Select a config from the list to view its content')
  })

  it('keeps URL-driven type and item selection hooks wired through ConfigBrowser (#5916)', () => {
    expect(configBrowserSource).toContain('externalSelectedConfigKey?: string | null')
    expect(configBrowserSource).toContain('onSelectedConfigChange?: (key: string | null) => void')
    expect(configBrowserSource).toContain('onExternalTypeFilterChange?: (type: string | null) => void')
    expect(configBrowserSource).toContain('hasExternalSelectedItemParam?: boolean')
    expect(configBrowserSource).toContain('setSelectedConfigKey(externalSelectedConfigKey ?? null)')
    expect(configBrowserSource).toContain('onSelectedConfigChange?.(key)')
    expect(configBrowserSource).toContain('onSelectedConfigChange?.(nextKey)')
    expect(configBrowserSource).toContain('const shouldDeferAutoSelect =')
    expect(configBrowserSource).toContain('deferAutoSelect={shouldDeferAutoSelect}')
    expect(configBrowserSource).toContain("onExternalTypeFilterChange?.(nextTypeFilter === 'all' ? null : nextTypeFilter)")
  })

  it('keeps warning-status icons keyboard accessible with explicit labels (#5905)', () => {
    expect(configListItemSource).toContain('aria-label={consistencyTooltip}')
    expect(configListItemSource).toContain('title={consistencyTooltip}')
    expect(configListItemSource).toContain('tabIndex={0}')
    expect(configListItemSource).toContain('onFocus={show}')
  })

  it('keeps config-preview failures sticky per item and marks failed entries in the list (#5909)', () => {
    expect(configBrowserSource).toContain('const [contentFetchStates, setContentFetchStates]')
    expect(configBrowserSource).toContain('contentFetchStates.get(selectedConfigKey)')
    expect(configBrowserSource).toContain('contentStatusByKey={new Map(')
    expect(configBrowserSource).toContain('reportConfigPreviewFailure(')
    expect(configBrowserSource).toContain("if (failure.status === 'unavailable')")
    expect(configBrowserSource).toContain("scope.setLevel('warning')")
    expect(configBrowserSource).toContain('Sentry.captureException')
    expect(configListItemSource).toContain("contentStatus === 'partial'")
    expect(configListItemSource).toContain('const contentStatusTooltip =')
    expect(configListItemSource).toContain('aria-label={contentStatusTooltip}')
    expect(configListItemSource).toContain('Config preview unavailable')
    expect(configListItemSource).toContain('Config preview partially available')
  })

  it('keeps TOML files syntax-highlighted in the config viewer (#5915)', () => {
    expect(configViewerSource).toContain("if (path.endsWith('.toml')) return 'toml'")
  })

  it('keeps the Source/Rendered toggle non-submitting and exposes active state (#5912)', () => {
    expect(configViewerToolbarSource).toContain('aria-label="Preview mode"')
    expect(configViewerToolbarSource).toContain("aria-pressed={viewMode === 'source'}")
    expect(configViewerToolbarSource).toContain("aria-pressed={viewMode === 'rendered'}")
    expect(configViewerToolbarSource).toContain('type="button"')
  })

  it('keeps the config viewer toolbar stacked and truncates long paths while wrapping actions (#5946)', () => {
    expect(configViewerToolbarSource).toContain('className="flex flex-col gap-3"')
    expect(configViewerToolbarSource).toContain('className="block min-w-0 max-w-full truncate text-xs"')
    expect(configViewerToolbarSource).toContain('className="flex w-full min-w-0 flex-wrap items-center gap-2"')
    expect(configViewerToolbarSource).toContain('className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"')
  })

  it('keeps platform-aware settings badges and embedded MCP labels visible in the config browser (#5910, #5914)', () => {
    expect(configListItemSource).toContain('typeInfo.platformBadge')
    expect(configViewerToolbarSource).toContain('presentation.platformBadge')
    expect(configPresentationSource).toContain("label: 'Embedded MCP'")
    expect(configPresentationSource).toContain('Extracted from .gemini/settings.json')
    expect(configPresentationSource).toContain('Extracted from .codex/config.toml')
  })
})
