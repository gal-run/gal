import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const layoutSource = readFileSync(
  join(__dirname, 'layout.tsx'),
  'utf8',
)

describe('dashboard layout seo contracts', () => {
  it('keeps app.gal.run pages out of search indexing (#4184)', () => {
    expect(layoutSource).toContain("metadataBase: new URL('https://app.gal.run')")
    expect(layoutSource).toContain('index: false')
    expect(layoutSource).toContain('follow: false')
    expect(layoutSource).toContain('noimageindex: true')
  })
})
