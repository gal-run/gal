'use client'

/**
 * EeRouteGate — defense-in-depth route guard for Enterprise (EE) pages.
 *
 * Each EE route's `page.tsx` renders its real implementation wrapped in this
 * gate. When no valid GAL Enterprise license key is present (the default
 * single-tenant OSS build) the gate calls Next.js `notFound()`, so a
 * hand-typed URL like `/billing` resolves to the standard 404 page in the
 * free build rather than exposing any EE functionality.
 *
 * This complements the nav-level filtering in (dashboard)/layout.tsx (which
 * removes EE nav items entirely when EE is disabled) and the audience-tier
 * collapse in FeatureFlagsContext.
 */

import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import type { PageId } from '@gal/types'
import { isEeEnabled } from '@/ee/license.js'

interface EeRouteGateProps {
  /** PageId of the gated EE page (retained for call-site clarity). */
  pageId: PageId
  children: ReactNode
}

export function EeRouteGate({ pageId, children }: EeRouteGateProps) {
  void pageId
  if (!isEeEnabled()) {
    notFound()
  }
  return <>{children}</>
}
