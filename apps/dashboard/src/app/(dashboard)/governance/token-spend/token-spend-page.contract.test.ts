import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const tokenSpendPageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

describe('token spend page contract (#6297)', () => {
  it('keeps the budget editor mounted in the governance page', () => {
    expect(tokenSpendPageSource).toContain('import { BudgetEditor } from')
    expect(tokenSpendPageSource).toContain('<BudgetEditor />')
    expect(tokenSpendPageSource).toContain('aria-label="Budget Alerts"')
  })
})
