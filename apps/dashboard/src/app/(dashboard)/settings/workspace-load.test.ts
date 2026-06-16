import { describe, expect, it } from 'vitest'

import type { Organization } from '@/lib/api'

import { resolveOrganizationsResponse } from './workspace-load'

const SAMPLE_ORGS = [
  { name: 'Scheduler-Systems' },
] as Organization[]

describe('resolveOrganizationsResponse', () => {
  it('returns the fetched organizations when the API responds with data', () => {
    const result = resolveOrganizationsResponse(SAMPLE_ORGS, [], 'initial-load')

    expect(result.organizations).toEqual(SAMPLE_ORGS)
    expect(result.errorMessage).toBeNull()
  })

  it('surfaces a visible initial-load error when the API returns undefined (#5927 BUG-007)', () => {
    const result = resolveOrganizationsResponse(undefined, [], 'initial-load')

    expect(result.organizations).toEqual([])
    expect(result.errorMessage).toContain('could not load your workspace list')
  })

  it('preserves the current workspace list on sync-refresh undefined responses', () => {
    const result = resolveOrganizationsResponse(undefined, SAMPLE_ORGS, 'sync-refresh')

    expect(result.organizations).toEqual(SAMPLE_ORGS)
    expect(result.errorMessage).toContain('could not refresh the workspace list')
  })
})
