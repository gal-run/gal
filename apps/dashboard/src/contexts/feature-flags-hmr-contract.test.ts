import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const featureFlagsContextSource = readFileSync(
  join(__dirname, 'FeatureFlagsContext.tsx'),
  'utf8',
)

describe('feature flags HMR fallback contracts', () => {
  it('keeps safe fallback context behavior when provider is temporarily missing during HMR (#2736)', () => {
    expect(featureFlagsContextSource).toContain('Default value returned when FeatureFlagsProvider is missing (e.g., during HMR reloads).')
    expect(featureFlagsContextSource).toContain('This prevents the "useFeatureFlags must be used within a FeatureFlagsProvider" crash (GAL-DASHBOARD-1).')
    expect(featureFlagsContextSource).toContain('const FEATURE_FLAGS_FALLBACK: FeatureFlagsContextValue = {')
    expect(featureFlagsContextSource).toContain('return FEATURE_FLAGS_FALLBACK')
    expect(featureFlagsContextSource).toContain("throw new Error('useFeatureFlags must be used within a FeatureFlagsProvider')")
  })
})
