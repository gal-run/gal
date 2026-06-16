'use client'

// Enterprise (EE) route — gated (org membership / team management). Real
// implementation under src/ee/app/team.
import { EeRouteGate } from '@/ee/EeRouteGate'
import EeTeamPage from '@/ee/app/team/EePage'

export default function TeamPage() {
  return (
    <EeRouteGate pageId="team">
      <EeTeamPage />
    </EeRouteGate>
  )
}
