/**
 * Contract tests for EnvironmentsTab (Issue #4462)
 *
 * These tests verify the key structural contracts of the Environments settings
 * UI — ensuring env vars, secrets, and runtime config sections are present
 * and that auth + CRUD wiring is correct.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// __dirname = .../apps/dashboard-next/src/components/settings/
const tabSource = readFileSync(join(__dirname, 'EnvironmentsTab.tsx'), 'utf8')

const pageSource = readFileSync(
  join(__dirname, '../../app/(dashboard)/settings/page.tsx'),
  'utf8',
)

describe('EnvironmentsTab contracts', () => {
  it('renders the Environments heading', () => {
    expect(tabSource).toContain('Environments')
  })

  it('includes an env vars section', () => {
    expect(tabSource).toContain('Environment Variables')
  })

  it('includes a secrets references section', () => {
    expect(tabSource).toContain('Secret References')
  })

  it('includes a runtime/image section', () => {
    expect(tabSource).toContain('Runtime')
  })

  it('calls api.listEnvironments on mount', () => {
    expect(tabSource).toContain('api.listEnvironments')
  })

  it('calls api.createEnvironment for new environments', () => {
    expect(tabSource).toContain('api.createEnvironment')
  })

  it('calls api.updateEnvironment for edits', () => {
    expect(tabSource).toContain('api.updateEnvironment')
  })

  it('calls api.deleteEnvironment for deletions', () => {
    expect(tabSource).toContain('api.deleteEnvironment')
  })

  it('validates env var key format', () => {
    expect(tabSource).toContain('A-Za-z_')
  })

  it('masks env var values by default (password input)', () => {
    expect(tabSource).toContain('type="password"')
  })

  it('has a toggle to show/hide env var values', () => {
    expect(tabSource).toContain('Eye')
    expect(tabSource).toContain('EyeOff')
  })

  it('shows a delete confirmation before deleting', () => {
    expect(tabSource).toContain('DeleteConfirmModal')
    expect(tabSource).toContain('permanently deleted')
  })
})

describe('Settings page wires Environments tab', () => {
  it('imports EnvironmentsTab', () => {
    expect(pageSource).toContain("from '@/components/settings/EnvironmentsTab'")
  })

  it('adds "environments" to the SettingsTab union type', () => {
    expect(pageSource).toContain("'environments'")
  })

  it('includes environments in allTabs', () => {
    expect(pageSource).toMatch(/allTabs.*environments/)
  })

  it('gates environments tab behind internal feature flag', () => {
    // internalOnlyTabs should include environments
    const match = pageSource.match(/internalOnlyTabs[^\n]+/)
    expect(match?.[0] ?? '').toContain('environments')
  })

  it('renders EnvironmentsTab when environments tab is active', () => {
    expect(pageSource).toContain('<EnvironmentsTab />')
  })

  it('adds a nav item with Layers icon for Environments', () => {
    expect(pageSource).toContain('Layers')
    expect(pageSource).toContain('label="Environments"')
  })
})
