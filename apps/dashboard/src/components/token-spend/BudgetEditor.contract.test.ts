import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const budgetEditorSource = readFileSync(
  join(__dirname, 'BudgetEditor.tsx'),
  'utf8',
)

describe('BudgetEditor contract (#6297)', () => {
  it('keeps create and edit flows wired to the token budget API', () => {
    expect(budgetEditorSource).toContain('/api/admin/token-budgets')
    expect(budgetEditorSource).toContain('editingBudgetId')
    expect(budgetEditorSource).toContain("method: isEditing ? 'PUT' : 'POST'")
    expect(budgetEditorSource).toContain('Update Budget')
    expect(budgetEditorSource).toContain('Edit Budget')
    expect(budgetEditorSource).toContain('+ Add webhook')
    expect(budgetEditorSource).toContain('toggleWebhookEnabledInForm')
    expect(budgetEditorSource).toContain('dedupeHours')
    expect(budgetEditorSource).toContain('Number.parseInt(e.target.value, 10) || 1')
    expect(budgetEditorSource).toContain('enabled')
  })
})
