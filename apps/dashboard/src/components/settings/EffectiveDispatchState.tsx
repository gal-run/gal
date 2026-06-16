'use client'

import { AlertCircle, CheckCircle, XCircle, Info } from 'lucide-react'

/**
 * Effective Dispatch State Panel (Issue #1999)
 *
 * Shows the precedence and effective behavior for automatic background agent dispatch.
 * Clarifies the relationship between:
 * - Global auto-dispatch toggle (highest priority)
 * - Queue consumer paused state (second priority)
 * - Category toggle (third priority)
 * - Resulting effective behavior
 */

export interface EffectiveDispatchStateProps {
  /** Global auto-dispatch enabled/disabled */
  globalEnabled: boolean
  /** Queue consumer paused (from backend state) */
  consumerPaused: boolean
  /** At least one category is enabled */
  anyCategoryEnabled: boolean
  /** Optional: specific category to highlight */
  categoryName?: string
  /** Optional: specific category enabled state */
  categoryEnabled?: boolean
}

interface StateCheck {
  label: string
  value: boolean
  priority: number
  description: string
}

/**
 * Compute the effective dispatch behavior based on precedence:
 * 1. Global enabled (highest) - if OFF, nothing dispatches
 * 2. Consumer paused (second) - if paused, nothing dispatches
 * 3. Category enabled (third) - if OFF, this category doesn't dispatch
 */
function computeEffectiveState(props: EffectiveDispatchStateProps): {
  willDispatch: boolean
  blockingReason: string | null
  checks: StateCheck[]
} {
  const checks: StateCheck[] = [
    {
      label: 'Global Auto-Dispatch',
      value: props.globalEnabled,
      priority: 1,
      description: props.globalEnabled
        ? 'Automatic dispatch is enabled organization-wide'
        : 'Automatic dispatch is disabled organization-wide',
    },
    {
      label: 'Queue Consumer',
      value: !props.consumerPaused,
      priority: 2,
      description: props.consumerPaused
        ? 'Queue consumer is paused - no work will be processed'
        : 'Queue consumer is running',
    },
  ]

  if (props.categoryName && props.categoryEnabled !== undefined) {
    checks.push({
      label: `Category: ${props.categoryName}`,
      value: props.categoryEnabled,
      priority: 3,
      description: props.categoryEnabled
        ? `Category "${props.categoryName}" will dispatch agents`
        : `Category "${props.categoryName}" is disabled`,
    })
  } else if (props.anyCategoryEnabled !== undefined) {
    checks.push({
      label: 'Categories',
      value: props.anyCategoryEnabled,
      priority: 3,
      description: props.anyCategoryEnabled
        ? 'At least one category is enabled'
        : 'No categories are enabled',
    })
  }

  // Determine effective state by precedence
  if (!props.globalEnabled) {
    return {
      willDispatch: false,
      blockingReason: 'Global auto-dispatch is disabled',
      checks,
    }
  }

  if (props.consumerPaused) {
    return {
      willDispatch: false,
      blockingReason: 'Queue consumer is paused',
      checks,
    }
  }

  if (props.categoryEnabled === false) {
    return {
      willDispatch: false,
      blockingReason: `Category "${props.categoryName}" is disabled`,
      checks,
    }
  }

  if (!props.anyCategoryEnabled && props.categoryEnabled === undefined) {
    return {
      willDispatch: false,
      blockingReason: 'No categories are enabled',
      checks,
    }
  }

  return {
    willDispatch: true,
    blockingReason: null,
    checks,
  }
}

export function computeEffectiveDispatchState(props: EffectiveDispatchStateProps): {
  willDispatch: boolean
  blockingReason: string | null
  checks: StateCheck[]
} {
  return computeEffectiveState(props)
}

export function EffectiveDispatchState(props: EffectiveDispatchStateProps) {
  const { willDispatch, blockingReason, checks } = computeEffectiveState(props)

  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: `1px solid ${willDispatch ? 'var(--status-success)' : 'var(--status-warning)'}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <Info className="w-4 h-4" style={{ color: 'var(--accent)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Effective Dispatch State
        </h3>
      </div>

      {/* State checks */}
      <div className="space-y-3 mb-4">
        {checks.map((check) => (
          <div
            key={check.label}
            className="flex items-start gap-3 p-3 rounded-lg"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex-shrink-0 mt-0.5">
              {check.value ? (
                <CheckCircle className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              ) : (
                <XCircle className="w-4 h-4" style={{ color: 'var(--status-danger-text)' }} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {check.label}
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-muted)',
                  }}
                >
                  Priority {check.priority}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {check.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Effective behavior */}
      <div
        className="flex items-start gap-3 p-4 rounded-lg"
        style={{
          backgroundColor: willDispatch ? 'var(--status-success-light)' : 'var(--status-warning-light)',
          border: `1px solid ${willDispatch ? 'var(--status-success)' : 'var(--status-warning)'}`,
        }}
      >
        <div className="flex-shrink-0">
          {willDispatch ? (
            <CheckCircle className="w-5 h-5" style={{ color: 'var(--status-success-text)' }} />
          ) : (
            <AlertCircle className="w-5 h-5" style={{ color: 'var(--status-warning-text)' }} />
          )}
        </div>
        <div>
          <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
            {willDispatch ? 'Automatic dispatch is active' : 'Automatic dispatch is inactive'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {willDispatch
              ? 'New work items will be automatically dispatched to background agents.'
              : `No automatic dispatch will occur. ${blockingReason}.`}
          </p>
        </div>
      </div>
    </div>
  )
}
