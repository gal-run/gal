import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const themeContextSource = readFileSync(
  join(__dirname, 'ThemeContext.tsx'),
  'utf8',
)

describe('theme hydration contracts', () => {
  it('keeps SSR-safe theme defaults and client-only storage hydration pass with persisted light/dark consistency (#2668, #1905, #1889, #2669, #2671)', () => {
    expect(themeContextSource).toContain("SSR-safe defaults — 'dark' for resolved, 'system' for preference")
    expect(themeContextSource).toContain("const [preference, setPreferenceState] = useState<ThemePreference>('system')")
    expect(themeContextSource).toContain("const [resolved, setResolved] = useState<ColorMode>('dark')")
    expect(themeContextSource).toContain('Two-pass render: read localStorage only after mount (client-side)')
    expect(themeContextSource).toContain("const COLOR_STORAGE_KEY = 'gal-theme'")
    expect(themeContextSource).toContain('const stored = localStorage.getItem(COLOR_STORAGE_KEY)')
    expect(themeContextSource).toContain("root.classList.remove('light', 'dark')")
    expect(themeContextSource).toContain('root.classList.add(resolved)')
  })
})
