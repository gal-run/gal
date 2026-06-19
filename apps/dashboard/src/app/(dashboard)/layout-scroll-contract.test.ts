import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dashboardLayoutSource = readFileSync(
  join(__dirname, 'layout.tsx'),
  'utf8',
)

const homeContentSource = readFileSync(
  join(__dirname, 'HomeContent.tsx'),
  'utf8',
)

const dashboardPageSource = readFileSync(
  join(__dirname, 'dashboard/page.tsx'),
  'utf8',
)

// #6430: nested overflow-auto + h-full creates scroll traps on home/dashboard screens.
// The shell <main> in layout.tsx is the ONE scroll container.
// Page-level content must NOT add a second overflow-auto on top of h-full.
describe('dashboard scroll container contract (#6430)', () => {
  it('layout.tsx shell keeps overflow-auto on <main> as the single scroll container', () => {
    expect(dashboardLayoutSource).toContain('<main')
    expect(dashboardLayoutSource).toContain('overflow-auto')
  })

  it('HomeContent.tsx root div does not trap scroll with h-full overflow-auto combo', () => {
    // The root div must not combine h-full with overflow-auto — that creates a
    // nested scroll container that intercepts wheel/trackpad events (#6430).
    expect(homeContentSource).not.toMatch(/h-full[^"]*overflow-auto|overflow-auto[^"]*h-full/)
  })

  it('dashboard/page.tsx does not trap scroll with h-full overflow-auto combo', () => {
    // Same contract: the no-org fallback view must not nest a scroll container.
    expect(dashboardPageSource).not.toMatch(/h-full[^"]*overflow-auto|overflow-auto[^"]*h-full/)
  })
})
