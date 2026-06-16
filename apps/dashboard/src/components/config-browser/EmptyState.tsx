'use client'

import type { FC } from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  message: string
  details?: string[]
  action?: {
    label: string
    onClick: () => void
  }
}

export const EmptyState: FC<EmptyStateProps> = ({ icon: Icon, message, details, action }) => {
  return (
    <div className="text-center py-12">
      <Icon
        className="w-12 h-12 mx-auto mb-4"
        style={{ color: 'var(--text-muted)', opacity: 0.5 }}
      />
      <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
        {message}
      </p>
      {details && details.length > 0 && (
        <div className="mx-auto mb-4 max-w-md space-y-1">
          {details.map((detail) => (
            <p key={detail} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {detail}
            </p>
          ))}
        </div>
      )}
      {action && (
        <button onClick={action.onClick} className="btn-primary text-sm">
          {action.label}
        </button>
      )}
    </div>
  )
}
