import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const discoverySource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

const configFiltersSource = readFileSync(
  join(__dirname, '../../../components/config-browser/ConfigFilters.tsx'),
  'utf8',
)

const discoveryTypeGuidanceSource = readFileSync(
  join(__dirname, '../../../lib/discoveryTypeGuidance.ts'),
  'utf8',
)

describe('discovery page regression contracts', () => {
  it('keeps Config Types cards clickable and wired into ConfigBrowser filtering (#3017, #3295)', () => {
    expect(discoverySource).toContain('parseDiscoveryTypeParam(searchParams.get(\'type\'))')
    expect(discoverySource).toContain('handleTypeFilterChange(isActive ? null : filterType)')
    expect(discoverySource).toContain('externalTypeFilter={activeTypeFilter}')
    expect(discoverySource).toContain('onExternalTypeFilterChange={handleTypeFilterChange}')
    expect(discoverySource).toContain('Clear filter')
    expect(discoverySource).toContain("aria-label={`Filter by ${label}${isActive ? ' (active)' : ''}`}")
  })

  it('keeps AGENTS.md naming and config-type coverage in Discovery filters (#2461, #3295)', () => {
    expect(discoverySource).toContain('DISCOVERY_TYPE_GUIDES')
    expect(discoveryTypeGuidanceSource).toContain("key: 'instructions'")
    expect(discoveryTypeGuidanceSource).toContain("label: 'AGENTS.md'")
    expect(configFiltersSource).toContain('<option value="instructions">AGENTS.md</option>')
    expect(configFiltersSource).toContain('<option value="subagent">Subagents</option>')
    expect(configFiltersSource).toContain('<option value="skill">Skills</option>')
    expect(configFiltersSource).toContain('<option value="policy">Policies</option>')
    expect(configFiltersSource).toContain('<option value="workflow">Workflows</option>')
    expect(configFiltersSource).toContain('<option value="prompt">Prompts</option>')
    expect(configFiltersSource).toContain('<option value="agent">Agents</option>')
  })

  it('keeps Pick-by-AI recommendation and publish wiring in Discovery UI (#3296)', () => {
    expect(discoverySource).toContain('Pick by AI')
    // #5673 Option B: prompt input below button row with label — uses pickByAiPrompt state
    expect(discoverySource).toContain('pickByAiPrompt')
    expect(discoverySource).toContain('AI prompt:')
    expect(discoverySource).toContain('intention:')
    // #4032: batch manifest approach — single call replaces per-config loop
    expect(discoverySource).toContain('api.pickConfigsByAiManifest')
    expect(discoverySource).toContain("policyMutationKey === 'ai-publish-policy'")
    expect(discoverySource).toContain('Publish Policy')
  })

  it('propagates batchResult.source to each result item so deterministic fallback UI activates (#5672)', () => {
    // The source field from the API response must be forwarded to each result entry.
    // Without this, isAiFallback is always false and the raw "Deterministic fallback: ..." message shows.
    expect(discoverySource).toContain('source: batchResult.source')
    // isAiFallback detection must use the source field
    expect(discoverySource).toContain("r.source === 'deterministic-fallback'")
    // Notice banner must be shown in fallback mode
    expect(discoverySource).toContain('AI ranking is temporarily unavailable')
    // Confidence badge must be hidden in fallback mode
    expect(discoverySource).toContain('!isAiFallback && (')
    // Raw reasoning text must be hidden in fallback mode
    expect(discoverySource).toContain('!isAiFallback && result.reasoning')
  })

  it('keeps a visible retry path for bootstrap rate limits instead of an endless spinner (#5906)', () => {
    expect(discoverySource).toContain('const [bootstrapError, setBootstrapError]')
    expect(discoverySource).toContain('const [loadingTimedOut, setLoadingTimedOut]')
    expect(discoverySource).toContain("getUserFriendlyError(error, 'Failed to load discovery data.')")
    expect(discoverySource).toContain('Retry loading')
    expect(discoverySource).toContain('Loading is taking longer than expected')
  })

  it('keeps config-type summary cards aligned with grouped browser counts (#5905)', () => {
    expect(discoverySource).toContain('summarizeDiscoveryConfigTypeStats')
  })

  it('keeps config-type descriptions and empty-state guidance wired for dormant categories (#5907)', () => {
    expect(discoverySource).toContain('title={description}')
    expect(discoverySource).toContain('text-[10px]')
    expect(discoveryTypeGuidanceSource).toContain(".github/prompts/*.prompt.md")
    expect(discoveryTypeGuidanceSource).toContain(".gemini/policies/*.toml")
    expect(discoveryTypeGuidanceSource).toContain('Legacy alias; current scans appear under Subagents')
  })

  it('keeps Discovery filter and selection state synchronized through URL params (#5916)', () => {
    expect(discoverySource).toContain('useSearchParams')
    expect(discoverySource).toContain("resolveDiscoverySelectedConfigKey(configGroups, selectedItemParam, activeTypeFilter)")
    expect(discoverySource).toContain('router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : \'\'}${hash}`')
    expect(discoverySource).toContain('externalSelectedConfigKey={selectedConfigKeyFromUrl}')
    expect(discoverySource).toContain('onSelectedConfigChange={handleSelectedConfigChange}')
    expect(discoverySource).toContain('hasExternalSelectedItemParam={Boolean(selectedItemParam)}')
    expect(discoverySource).toContain('const [hasFetchedConfigGroups, setHasFetchedConfigGroups]')
    expect(discoverySource).toContain('!hasFetchedConfigGroups')
  })
})
