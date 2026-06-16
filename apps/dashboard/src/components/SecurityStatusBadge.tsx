'use client'

import { Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react'

export type SecurityStatus = 'pass' | 'warning' | 'fail' | 'unknown'

interface SecurityStatusBadgeProps {
  status: SecurityStatus
  label?: string
  size?: 'sm' | 'md' | 'lg'
}

const STATUS_CONFIG = {
  pass: {
    icon: ShieldCheck,
    color: 'var(--status-success)',
    bg: 'var(--status-success-light)',
    border: 'var(--status-success)',
    label: 'Secure',
  },
  warning: {
    icon: ShieldAlert,
    color: 'var(--status-warning-text)',
    bg: 'var(--status-warning-light)',
    border: 'var(--status-warning)',
    label: 'Review Required',
  },
  fail: {
    icon: ShieldX,
    color: 'var(--status-danger)',
    bg: 'var(--status-danger-light)',
    border: 'var(--status-danger)',
    label: 'Issues Found',
  },
  unknown: {
    icon: Shield,
    color: 'var(--text-secondary)',
    bg: 'var(--badge-gray-bg)',
    border: 'var(--border-default)',
    label: 'Not Analyzed',
  },
}

export function SecurityStatusBadge({ status, label, size = 'md' }: SecurityStatusBadgeProps) {
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  const displayLabel = label || config.label

  const sizeClasses = {
    sm: {
      container: 'px-2 py-1',
      icon: 'w-3 h-3',
      text: 'text-xs',
    },
    md: {
      container: 'px-3 py-1.5',
      icon: 'w-4 h-4',
      text: 'text-sm',
    },
    lg: {
      container: 'px-4 py-2',
      icon: 'w-5 h-5',
      text: 'text-base',
    },
  }

  const classes = sizeClasses[size]

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-lg ${classes.container}`}
      style={{
        backgroundColor: config.bg,
        border: `1px solid ${config.border}`,
      }}
    >
      <Icon className={classes.icon} style={{ color: config.color }} />
      <span className={`font-medium ${classes.text}`} style={{ color: config.color }}>
        {displayLabel}
      </span>
    </div>
  )
}
