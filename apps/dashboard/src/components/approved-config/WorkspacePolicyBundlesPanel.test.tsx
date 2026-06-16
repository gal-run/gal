import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WorkspacePolicyBundlesPanel } from './WorkspacePolicyBundlesPanel'

describe('WorkspacePolicyBundlesPanel', () => {
  it('reframes the panel around workspace policy bundles instead of project scope configs', () => {
    const markup = renderToStaticMarkup(<WorkspacePolicyBundlesPanel workspaceName={null} />)

    expect(markup).toContain('Workspace Policy Bundles')
    expect(markup).toContain('Approved Config is scoped to each org and workspace.')
    expect(markup).toContain('Manage publication in Discovery.')
    expect(markup).toContain('Repository-specific overrides remain part of enforcement flows')
    expect(markup).not.toContain('Project Scope Configs')
    expect(markup).not.toContain('Project-specific configurations')
    expect(markup).not.toContain('specific repositories')
  })

  it('surfaces the selected workspace in the helper copy', () => {
    const markup = renderToStaticMarkup(<WorkspacePolicyBundlesPanel workspaceName="acme-platform" />)

    expect(markup).toContain('approved base policy bundle for acme-platform')
    expect(markup).toContain('Manage publication in Discovery.')
    expect(markup).toContain("Use the workspace switcher to review another org&#x27;s bundle.")
  })
})
