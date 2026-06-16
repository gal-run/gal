import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const useSelectedWorkspaceSource = readFileSync(
  join(__dirname, 'useSelectedWorkspace.ts'),
  'utf8',
)

const organizationEventsSource = readFileSync(
  join(__dirname, '../lib/organizationEvents.ts'),
  'utf8',
)

describe('workspace selection contracts', () => {
  it('keeps workspace selection sourced from explicit workspace events/storage without silent fallbacks (#2351)', () => {
    expect(useSelectedWorkspaceSource).toContain('getSelectedWorkspace()')
    expect(useSelectedWorkspaceSource).toContain('useState<string | null>(null)')
    expect(useSelectedWorkspaceSource).toContain('setSelectedWorkspace(getSelectedWorkspace())')
    expect(useSelectedWorkspaceSource).toContain('subscribeWorkspaceChanged((accountName) => {')
    expect(useSelectedWorkspaceSource).toContain('setSelectedWorkspace(accountName)')
    expect(useSelectedWorkspaceSource).not.toContain('organizations[0]')
    expect(useSelectedWorkspaceSource).not.toContain('fallback')
  })

  it('hydrates the persisted workspace selection after mount instead of during the initial render (#3990)', () => {
    expect(useSelectedWorkspaceSource).not.toContain('useState<string | null>(() =>')
    expect(useSelectedWorkspaceSource).toContain('useEffect(() => {')
    expect(useSelectedWorkspaceSource).toContain('setSelectedWorkspace(getSelectedWorkspace())')
    expect(useSelectedWorkspaceSource).toContain('setIsPersonal(getSelectedWorkspaceType() === \'User\')')
  })

  it('keeps explicit workspace changed event payload persisted and replayed from localStorage (#2351)', () => {
    expect(organizationEventsSource).toContain("const WORKSPACE_CHANGED_EVENT = 'gal:workspace-changed'")
    expect(organizationEventsSource).toContain('window.localStorage?.setItem?.(WORKSPACE_STORAGE_KEY, accountName)')
    expect(organizationEventsSource).toContain('window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT, {')
    expect(organizationEventsSource).toContain('return window.localStorage?.getItem?.(WORKSPACE_STORAGE_KEY) ?? null')
  })
})
