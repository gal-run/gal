import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const featureFlagsContextSource = readFileSync(
  join(__dirname, 'FeatureFlagsContext.tsx'),
  'utf8',
)

describe('feature flags stability contracts', () => {
  it('memoizes fetch and exported helpers to avoid provider churn loops', () => {
    expect(featureFlagsContextSource).toContain('const fetchFlags = useCallback(async () => {')
    expect(featureFlagsContextSource).toContain('useEffect(() => {\n    fetchFlags()\n  }, [fetchFlags])')
    expect(featureFlagsContextSource).toContain('const isPageEnabled = useCallback((pageId: PageId): boolean => {')
    expect(featureFlagsContextSource).toContain('const isPageVisibleForUser = useCallback((pageId: PageId, userOrgs: string[], workspace?: string | null): boolean => {')
    expect(featureFlagsContextSource).toContain('const isFeatureEnabled = useCallback((featureId: string): boolean => {')
    expect(featureFlagsContextSource).toContain('const getEnabledPages = useCallback((): PageFlagWithStatus[] => {')
    expect(featureFlagsContextSource).toContain('const getEnabledPagesByLayer = useCallback((layer: PageLayer): PageFlagWithStatus[] => {')
    expect(featureFlagsContextSource).toContain('const value = useMemo<FeatureFlagsContextValue>(() => ({')
  })
})
