import { describe, expect, it } from 'vitest'
import {
  getSessionFailureDetails,
  getSessionMetadataWarning,
  getSelectedRepoFullName,
  reconcileSelectedRepo,
  resolveBranchFetchTarget,
  type BackgroundAgentsRepo,
} from './background-agents-page-helpers'

describe('background-agents-page-helpers', () => {
  const repos: BackgroundAgentsRepo[] = [
    { name: 'api', fullName: 'acme/api', hasConfigs: true },
    { name: 'web', fullName: 'acme/web', hasConfigs: false },
  ]

  it('keeps the Sessions page in All Repos mode when there is no prior selection (#2263)', () => {
    expect(reconcileSelectedRepo(null, repos)).toBeNull()
  })

  it('preserves the selected repo only when it still exists in the workspace list (#2263)', () => {
    expect(
      reconcileSelectedRepo({ name: 'api', fullName: 'acme/api' }, repos),
    ).toEqual({ name: 'api', fullName: 'acme/api' })

    expect(
      reconcileSelectedRepo({ name: 'missing', fullName: 'acme/missing' }, repos),
    ).toBeNull()
  })

  it('does not derive a branch fetch target when All Repos is selected (#2263)', () => {
    expect(getSelectedRepoFullName(null)).toBeNull()
    expect(resolveBranchFetchTarget(null, 'acme')).toBeNull()
  })

  it('derives the branch fetch target from either a full repo name or the selected workspace (#2263)', () => {
    expect(resolveBranchFetchTarget('acme/api', 'acme')).toEqual({
      owner: 'acme',
      repo: 'api',
    })
    expect(resolveBranchFetchTarget('api', 'acme')).toEqual({
      owner: 'acme',
      repo: 'api',
    })
  })

  it('prefers command-expansion failure messaging in session metadata warnings (#4765)', () => {
    const warning = getSessionMetadataWarning({
      commandExpansion: {
        attempted: true,
        expanded: false,
        command: 'capture-learnings',
        error: 'not found in approved config',
      },
      preflight: {
        rejectionReason: 'should not be used when command expansion warning exists',
      },
    })

    expect(warning).toBe(
      '[GAL] Command expansion failed for capture-learnings: not found in approved config',
    )
  })

  it('falls back to preflight and dispatch-readiness warnings when command expansion metadata is absent (#4765)', () => {
    expect(
      getSessionMetadataWarning({
        preflight: { rejectionReason: 'missing config: environment:secrets' },
      }),
    ).toBe('missing config: environment:secrets')

    expect(
      getSessionMetadataWarning({
        dispatchReadiness: { failure: { message: 'Run: gal auth claude' } },
      }),
    ).toBe('Run: gal auth claude')
  })

  it('extracts structured session failure details from workflow metadata (#5251)', () => {
    expect(
      getSessionFailureDetails(
        {
          failureCategory: 'startup_failure',
          workflowConclusion: 'failure',
          failedStep: 'Fast parallel setup',
          workflowRunUrl: 'https://github.com/acme/api/actions/runs/123',
        },
        null,
      ),
    ).toEqual({
      category: 'Startup failure',
      reason: 'Workflow failed at step "Fast parallel setup"',
      workflowConclusion: 'failure',
      failedStep: 'Fast parallel setup',
      workflowRunUrl: 'https://github.com/acme/api/actions/runs/123',
    })
  })

  it('falls back to the session error message when structured failure details are partial (#5251)', () => {
    expect(
      getSessionFailureDetails(
        {
          workflowConclusion: 'cancelled',
        },
        'Workflow cancelled by user',
      ),
    ).toEqual({
      category: null,
      reason: 'Workflow cancelled by user',
      workflowConclusion: 'cancelled',
      failedStep: null,
      workflowRunUrl: null,
    })
  })
})
