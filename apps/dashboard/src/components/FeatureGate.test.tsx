import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const featureGateSource = readFileSync(join(__dirname, 'FeatureGate.tsx'), 'utf8')

describe('FeatureGate', () => {
  it('exports FeatureGate function component', () => {
    expect(featureGateSource).toContain('export function FeatureGate')
  })

  it('accepts pageId prop', () => {
    expect(featureGateSource).toContain('pageId: PageId')
  })

  it('accepts optional title prop', () => {
    expect(featureGateSource).toContain('title?: string')
  })

  it('accepts optional message prop', () => {
    expect(featureGateSource).toContain('message?: string')
  })

  it('has meta for background-agents pageId', () => {
    expect(featureGateSource).toContain("'background-agents': {")
    expect(featureGateSource).toContain("title: 'Background Agents Unavailable'")
    expect(featureGateSource).toContain('Background agents and sessions are not available')
  })

  it('has meta for billing pageId', () => {
    expect(featureGateSource).toContain("'billing': {")
    expect(featureGateSource).toContain("title: 'Billing Unavailable'")
  })

  it('renders with centering container (min-h-[60vh])', () => {
    expect(featureGateSource).toContain('min-h-[60vh]')
    expect(featureGateSource).toContain('justify-center')
    expect(featureGateSource).toContain('items-center')
  })

  it('renders an icon component', () => {
    expect(featureGateSource).toContain('Icon')
    expect(featureGateSource).toContain('w-12 h-12')
  })

  it('supports custom title override', () => {
    expect(featureGateSource).toContain("title ?? meta?.title")
  })

  it('supports custom message override', () => {
    expect(featureGateSource).toContain("message ?? meta?.message")
  })

  it('has fallback title for unknown pageIds', () => {
    expect(featureGateSource).toContain("'Feature Unavailable'")
  })

  it('has fallback message for unknown pageIds', () => {
    expect(featureGateSource).toContain('This feature is not available for your current workspace')
  })

  const knownPages = [
    'background-agents',
    'billing',
    'workflow-testing',
    'token-spend',
    'proposals',
    'enforcement-overrides',
    'enforcement-policies',
    'enforcement-audit',
    'enforcement-domains',
    'enforcement-hooks',
    'enforcement-sdlc',
    'enforcement-security',
    'enforcement-tools',
    'enforcement-system',
    'audit-logs',
    'browser-profiles',
    'domain-compliance',
    'tool-compliance',
  ]

  it('defines meta for all known pageIds', () => {
    for (const pageId of knownPages) {
      expect(featureGateSource).toContain(`'${pageId}':`)
    }
  })
})
