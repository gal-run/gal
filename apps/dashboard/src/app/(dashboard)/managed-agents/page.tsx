'use client'

// Enterprise (EE) route — gated. Real implementation under src/ee/app/managed-agents.
import { EeRouteGate } from '@/ee/EeRouteGate'
import EeManagedAgentsPage from '@/ee/app/managed-agents/EePage'

export default function ManagedAgentsPage() {
  return (
    <EeRouteGate pageId="background-agents">
      <EeManagedAgentsPage />
    </EeRouteGate>
  )
}
