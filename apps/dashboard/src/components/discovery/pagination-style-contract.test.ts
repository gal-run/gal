import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const paginationSource = readFileSync(
  join(__dirname, 'Pagination.tsx'),
  'utf8',
)

describe('pagination style contracts', () => {
  it('keeps active page numbers legible through accent/on-accent token pairing (#2752)', () => {
    expect(paginationSource).toContain('const isActive = pageNum === currentPage')
    expect(paginationSource).toContain("backgroundColor: isActive ? 'var(--accent)' : 'var(--bg-tertiary)'")
    expect(paginationSource).toContain("color: isActive ? 'var(--text-on-accent)' : 'var(--text-primary)'")
    expect(paginationSource).toContain("border: isActive ? 'none' : '1px solid var(--border-subtle)'")
  })
})
