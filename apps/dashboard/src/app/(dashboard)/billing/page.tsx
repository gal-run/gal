'use client'

// Enterprise (EE) route — gated. In the default single-tenant OSS build (no
// GAL Enterprise license key) this renders a CORE "unavailable" notice instead
// of the EE billing UI. The real implementation lives under src/ee/app/billing.
import { EeRouteGate } from '@/ee/EeRouteGate'
import EeBillingPage from '@/ee/app/billing/EePage'

export default function BillingPage() {
  return (
    <EeRouteGate pageId="billing">
      <EeBillingPage />
    </EeRouteGate>
  )
}
