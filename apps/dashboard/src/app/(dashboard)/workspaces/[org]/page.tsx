'use client'

// Enterprise (EE) route — gated (cross-org workspace view). Real implementation
// under src/ee/app/workspaces/[org]. The free build is single-tenant and has no
// cross-org workspace switching, so this 404s/notices without a license key.
import { EeRouteGate } from '@/ee/EeRouteGate'
import EeWorkspacesPage from '@/ee/app/workspaces/[org]/EePage'

export default function WorkspacesOrgPage() {
  return (
    <EeRouteGate pageId="team">
      <EeWorkspacesPage />
    </EeRouteGate>
  )
}
