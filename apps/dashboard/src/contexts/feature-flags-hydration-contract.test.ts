/**
 * Regression contract for React hydration mismatch fix (#3990).
 *
 * These tests enforce that FeatureFlagsContext does NOT read window/location
 * during the initial render (useState initializer or module-level evaluation).
 * Reading browser-only globals at that point causes React error #418 because
 * the server renders a different HTML tree than the client.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const featureFlagsContextSource = readFileSync(
  join(__dirname, 'FeatureFlagsContext.tsx'),
  'utf8',
)

describe('feature flags hydration contracts (#3990)', () => {
  it('defines an SSR-safe environment constant for use in initial state (#3990)', () => {
    // The SSR_SAFE_ENVIRONMENT constant must exist and must NOT call getFallbackEnvironment()
    expect(featureFlagsContextSource).toContain('const SSR_SAFE_ENVIRONMENT: EnvironmentInfo = {')
    // Must use a static value, not a function call that reads window
    expect(featureFlagsContextSource).toContain("environment: 'dev'")
    expect(featureFlagsContextSource).toContain('isProduction: false')
  })

  it('uses SSR_SAFE_ENVIRONMENT as the useState initial value (not getFallbackEnvironment()) (#3990)', () => {
    // The useState call must reference SSR_SAFE_ENVIRONMENT, not getFallbackEnvironment()
    // which would read window.location and cause a hydration mismatch.
    expect(featureFlagsContextSource).toContain('environment: SSR_SAFE_ENVIRONMENT,')
    // getFallbackEnvironment() must NOT appear inside a useState() call
    const useStateCallRegex = /useState\s*\(\s*\{[^}]*getFallbackEnvironment\(\)/
    expect(useStateCallRegex.test(featureFlagsContextSource)).toBe(false)
  })

  it('hydrates the real environment from window.location in a useEffect, not during render (#3990)', () => {
    // The client-side environment resolution must happen in useEffect
    expect(featureFlagsContextSource).toContain('getFallbackEnvironment()')
    // Verify getFallbackEnvironment is still called — but inside a useEffect
    const effectWithFallback = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{[^}]*getFallbackEnvironment\(\)/s
    expect(effectWithFallback.test(featureFlagsContextSource)).toBe(true)
  })

  it('uses SSR_SAFE_ENVIRONMENT in FEATURE_FLAGS_FALLBACK (not getFallbackEnvironment() at module level) (#3990)', () => {
    // The HMR fallback must also use the SSR-safe value to avoid window access at module load time
    expect(featureFlagsContextSource).toContain('environment: SSR_SAFE_ENVIRONMENT,')
    // There must be NO bare getFallbackEnvironment() call outside a function body
    // (i.e., at module evaluation time in FEATURE_FLAGS_FALLBACK)
    const fallbackSectionMatch = featureFlagsContextSource.match(
      /const FEATURE_FLAGS_FALLBACK[\s\S]*?^}/m
    )
    if (fallbackSectionMatch) {
      expect(fallbackSectionMatch[0]).not.toContain('getFallbackEnvironment()')
    }
  })
})
