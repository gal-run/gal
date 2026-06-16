'use client'

import { Shield, Sparkles, Users } from 'lucide-react'
import { useWorkspaceAudienceTier, useIsWorkspaceAdmin } from '@/hooks/useWorkspaceAudienceTier'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'

/**
 * PlanBadge — displays the current workspace's plan tier in the sidebar.
 *
 * Variants:
 *  - Internal (green): "Internal -- All Features"
 *  - Partner (green): "Design Partner"
 *  - Free (gray + "Upgrade" link for admins): "Free Plan"
 *  - Paid (blue + plan name): e.g. "Convenience"
 *
 * Issue #4203: Audience-tier-aware billing page UX
 */
export function PlanBadge({ collapsed }: { collapsed: boolean }) {
  const audienceTier = useWorkspaceAudienceTier()
  const selectedWorkspace = useSelectedWorkspace()
  const isAdmin = useIsWorkspaceAdmin()

  // Don't render if no workspace is selected
  if (!selectedWorkspace) return null

  const isInternal = audienceTier === 'internal'
  const isPartner = audienceTier === 'partners'

  // Determine badge variant
  let label: string
  let sublabel: string | null = null
  let bgColor: string
  let textColor: string
  let Icon = Shield

  if (isInternal) {
    label = 'Internal'
    sublabel = 'All Features'
    bgColor = 'color-mix(in srgb, #22c55e 12%, transparent)'
    textColor = '#16a34a'
    Icon = Shield
  } else if (isPartner) {
    label = 'Design Partner'
    sublabel = 'Complimentary'
    bgColor = 'color-mix(in srgb, #22c55e 12%, transparent)'
    textColor = '#16a34a'
    Icon = Sparkles
  } else {
    // Public tier — show "Free Plan" for now. In the future, this could
    // read billing status, but that requires an API call we avoid in the sidebar.
    // The billing page itself shows full plan details.
    label = 'Free Plan'
    bgColor = 'var(--bg-tertiary)'
    textColor = 'var(--text-muted)'
    Icon = Users
  }

  if (collapsed) {
    return (
      <div
        className="mx-2 my-1 flex items-center justify-center rounded-md py-1.5"
        style={{ backgroundColor: bgColor }}
        title={sublabel ? `${label} - ${sublabel}` : label}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: textColor }} />
      </div>
    )
  }

  return (
    <div
      className="mx-3 my-1 flex items-center gap-2 rounded-md px-2.5 py-1.5"
      style={{ backgroundColor: bgColor }}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: textColor }} />
      <div className="flex-1 min-w-0">
        <p
          className="text-[11px] font-medium leading-tight truncate"
          style={{ color: textColor }}
        >
          {label}
        </p>
        {sublabel && (
          <p
            className="text-[10px] leading-tight truncate"
            style={{ color: textColor, opacity: 0.8 }}
          >
            {sublabel}
          </p>
        )}
      </div>
      {/* Show "Upgrade" link for admins on free plan */}
      {!isInternal && !isPartner && isAdmin && (
        <a
          href="/billing"
          className="text-[10px] font-medium rounded px-1.5 py-0.5 transition-colors hover:opacity-80"
          style={{
            color: 'var(--interactive-primary)',
            backgroundColor: 'color-mix(in srgb, var(--interactive-primary) 10%, transparent)',
          }}
        >
          Upgrade
        </a>
      )}
    </div>
  )
}
