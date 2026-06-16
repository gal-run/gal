'use client'

import { User, Building2, Landmark } from 'lucide-react'

interface AccountTypeBadgeProps {
  accountType: 'User' | 'Organization' | 'Enterprise' | undefined
  size?: 'sm' | 'md'
}

export function AccountTypeBadge({ accountType, size = 'sm' }: AccountTypeBadgeProps) {
  const config =
    accountType === 'User'
      ? {
          icon: User,
          label: 'Personal',
          color: 'text-[var(--brand-gemini)]',
          bg: 'bg-[var(--brand-gemini-bg)]',
          border: 'border-[var(--brand-gemini-border)]',
        }
      : accountType === 'Enterprise'
      ? {
          icon: Landmark,
          label: 'Enterprise',
          color: 'text-[var(--status-warning-text,#b45309)]',
          bg: 'bg-[var(--status-warning-light,#fffbeb)]',
          border: 'border-[var(--status-warning-text,#b45309)]/30',
        }
      : {
          icon: Building2,
          label: 'Organization',
          color: 'text-[var(--status-info-text)]',
          bg: 'bg-[var(--status-info-light)]',
          border: 'border-[var(--status-info-text)]/30',
        }

  const Icon = config.icon

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full ${config.bg} ${config.border} border ${sizeClasses}`}
    >
      <Icon className={`w-3 h-3 ${config.color}`} />
      <span className={config.color}>{config.label}</span>
    </span>
  )
}
