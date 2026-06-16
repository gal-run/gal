import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const settingsPageSource = readFileSync(
  join(__dirname, 'page.tsx'),
  'utf8',
)

describe('settings workspace contracts', () => {
  it('keeps workspace-scoped visibility and deletion-permission guardrails in settings list rows (#1039)', () => {
    expect(settingsPageSource).toContain('const isActive = org.name === selectedWorkspace')
    expect(settingsPageSource).toContain('const canDelete = canDeleteWorkspace(org)')
    expect(settingsPageSource).toContain('aria-disabled={!canDelete}')
    expect(settingsPageSource).toContain('Only workspace admins or the installer can remove this workspace. Re-sync or re-login if permissions changed.')
    expect(settingsPageSource).toContain('if (typeof org.canDelete === \'boolean\')')
  })

  it('surfaces a visible alert when workspace data comes back undefined (#5927 BUG-007)', () => {
    expect(settingsPageSource).toContain('const [workspaceLoadError, setWorkspaceLoadError] = useState<string | null>(null)')
    expect(settingsPageSource).toContain('resolveOrganizationsResponse(')
    expect(settingsPageSource).toContain('role="alert"')
    expect(settingsPageSource).toContain('Workspace data unavailable')
  })
})
