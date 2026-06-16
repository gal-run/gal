'use client'

import { useState } from 'react'
import type { DriftStatusReport } from '@/lib/api'

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000 // 24 hours

function isStale(lastChecked: string): boolean {
  return Date.now() - new Date(lastChecked).getTime() > STALE_THRESHOLD_MS
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface DriftStatusBadgeProps {
  report: DriftStatusReport | undefined
}

export function DriftStatusBadge({ report }: DriftStatusBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  if (!report) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
        style={{ backgroundColor: 'var(--surface-sunken)', color: 'var(--text-muted)' }}
      >
        <span
          className="rounded-full"
          style={{ width: 6, height: 6, backgroundColor: 'var(--text-muted)' }}
        />
        Unknown
      </span>
    )
  }

  const stale = isStale(report.lastChecked)

  const config = {
    'in-sync': {
      dotColor: 'var(--status-success)',
      bg: 'var(--status-success-light)',
      text: 'var(--status-success-text)',
      label: 'In Sync',
    },
    drifted: {
      dotColor: 'var(--status-warning)',
      bg: 'var(--status-warning-light)',
      text: 'var(--status-warning-text)',
      label: `Drift Detected (${report.driftedFiles.length})`,
    },
    unknown: {
      dotColor: 'var(--text-muted)',
      bg: 'var(--surface-sunken)',
      text: 'var(--text-muted)',
      label: 'Unknown',
    },
  }[report.status]

  return (
    <span
      className="relative inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium cursor-default"
      style={{ backgroundColor: config.bg, color: config.text }}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <span
        className="rounded-full shrink-0"
        style={{ width: 6, height: 6, backgroundColor: config.dotColor }}
      />
      {config.label}

      {showTooltip && (
        <span
          className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 whitespace-nowrap rounded-md px-3 py-2 text-xs shadow-lg"
          style={{
            backgroundColor: 'var(--surface-raised)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <span className="block">
            Last checked: {formatRelativeTime(report.lastChecked)}
          </span>
          {stale && (
            <span className="block mt-0.5 font-semibold" style={{ color: 'var(--status-warning-text)' }}>
              Stale -- last check was over 24h ago
            </span>
          )}
          {report.status === 'drifted' && report.driftedFiles.length > 0 && (
            <span className="block mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {report.driftedFiles.slice(0, 3).map((f) => f.path).join(', ')}
              {report.driftedFiles.length > 3 && ` +${report.driftedFiles.length - 3} more`}
            </span>
          )}
        </span>
      )}
    </span>
  )
}
