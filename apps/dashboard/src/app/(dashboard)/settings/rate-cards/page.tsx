'use client'

// Enterprise (EE) route — gated. rate-cards is split out of CORE settings.
// Real implementation under src/ee/app/settings/rate-cards.
import { EeRouteGate } from '@/ee/EeRouteGate'
import EeRateCardsPage from '@/ee/app/settings/rate-cards/EePage'

export default function RateCardsPage() {
  return (
    <EeRouteGate pageId="billing">
      <EeRateCardsPage />
    </EeRouteGate>
  )
}
