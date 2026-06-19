'use client'

import { type ComponentType, type FC } from 'react'
import { GitCompareArrows, Layers3, RectangleHorizontal, Rows3, X } from 'lucide-react'
import type { ConfigInstance, DiffCompareMode, DiffSummary } from './configDiffUtils'
import { getInstanceOptionLabel, getSharedPath } from './configDiffUtils'

interface ConfigDiffHeaderProps {
  instances: ConfigInstance[]
  leftIndex: number
  rightIndex: number
  leftInstance: ConfigInstance
  rightInstance: ConfigInstance
  summary: DiffSummary
  compareMode: DiffCompareMode
  onCompareModeChange?: (mode: DiffCompareMode) => void
  splitView: boolean
  onSplitViewChange?: (value: boolean) => void
  showDiffOnly: boolean
  onShowDiffOnlyChange?: (value: boolean) => void
  onChangeLeft: (index: number) => void
  onChangeRight: (index: number) => void
  onClose: () => void
  compact?: boolean
  sticky?: boolean
}

const selectStyles = {
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)',
  border: '1px solid var(--border-subtle)',
}

const toggleGroupStyles = {
  border: '1px solid var(--border-subtle)',
  backgroundColor: 'var(--bg-primary)',
}

const compactButtonBase =
  'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors whitespace-nowrap'

export const ConfigDiffHeader: FC<ConfigDiffHeaderProps> = ({
  instances,
  leftIndex,
  rightIndex,
  leftInstance,
  rightInstance,
  summary,
  compareMode,
  onCompareModeChange,
  splitView,
  onSplitViewChange,
  showDiffOnly,
  onShowDiffOnlyChange,
  onChangeLeft,
  onChangeRight,
  onClose,
  compact = false,
  sticky = false,
}) => {
  const showCompareAllToggle = instances.length > 2 && !!onCompareModeChange
  const compareAllCount = Math.max(instances.length - 1, 0)
  const sharedPath = getSharedPath(leftInstance, rightInstance)

  const renderToggleButton = (
    active: boolean,
    label: string,
    onClick: () => void,
    icon?: ComponentType<{ className?: string }>,
  ) => {
    const Icon = icon

    return (
      <button
        onClick={onClick}
        className={compactButtonBase}
        style={{
          backgroundColor: active ? 'var(--accent-bg)' : 'transparent',
          color: active ? 'var(--accent)' : 'var(--text-muted)',
        }}
      >
        {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
        {label}
      </button>
    )
  }

  return (
    <div
      data-config-diff-header
      className={`${sticky ? 'sticky top-0 z-40' : 'relative'} border-b backdrop-blur-md`}
      style={{
        backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 98%, transparent)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className={`px-4 ${compact ? 'py-3' : 'py-4'}`}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Compare changes
                </span>
                <span
                  className="truncate text-xs"
                  style={{ color: 'var(--text-muted)' }}
                  title={sharedPath}
                >
                  {sharedPath}
                </span>
              </div>
            </div>

            <div className="flex min-w-0 flex-[2] flex-wrap items-center gap-2">
              <select
                value={leftIndex}
                onChange={(event) => onChangeLeft(Number(event.target.value))}
                className="min-w-[14rem] max-w-full flex-1 rounded-lg px-3 py-2 text-sm md:max-w-[22rem] md:flex-none"
                style={selectStyles}
                aria-label="Select left comparison repo"
              >
                {instances.map((instance, index) => (
                  <option key={`${instance.repo}-${instance.path}-${index}`} value={index}>
                    {getInstanceOptionLabel(instance)}
                  </option>
                ))}
              </select>

              {compareMode === 'single' ? (
                <>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    vs
                  </span>
                  <select
                    value={rightIndex}
                    onChange={(event) => onChangeRight(Number(event.target.value))}
                    className="min-w-[14rem] max-w-full flex-1 rounded-lg px-3 py-2 text-sm md:max-w-[22rem] md:flex-none"
                    style={selectStyles}
                    aria-label="Select right comparison repo"
                  >
                    {instances.map((instance, index) => (
                      <option
                        key={`${instance.repo}-${instance.path}-${index}`}
                        value={index}
                        disabled={index === leftIndex}
                      >
                        {getInstanceOptionLabel(instance)}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <div
                  className="rounded-lg px-3 py-2 text-xs font-medium"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  Against {compareAllCount} other repos
                </div>
              )}

              <div
                className="flex items-center gap-2 rounded-full px-2 py-1 text-xs"
                style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-subtle)' }}
              >
                <span className="font-medium" style={{ color: 'var(--status-success)' }}>
                  +{summary.added}
                </span>
                <span className="font-medium" style={{ color: 'var(--status-danger)' }}>
                  -{summary.removed}
                </span>
                {summary.identical ? (
                  <span style={{ color: 'var(--text-muted)' }}>Identical</span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {showCompareAllToggle ? (
                <div className="flex items-center rounded-xl p-1" style={toggleGroupStyles}>
                  {renderToggleButton(compareMode === 'single', 'Single', () => onCompareModeChange?.('single'), GitCompareArrows)}
                  {renderToggleButton(compareMode === 'all', 'Compare all', () => onCompareModeChange?.('all'), Layers3)}
                </div>
              ) : null}

              <div className="flex items-center rounded-xl p-1" style={toggleGroupStyles}>
                {renderToggleButton(splitView, 'Split', () => onSplitViewChange?.(true), RectangleHorizontal)}
                {renderToggleButton(!splitView, 'Unified', () => onSplitViewChange?.(false), GitCompareArrows)}
              </div>

              <div className="flex items-center rounded-xl p-1" style={toggleGroupStyles}>
                {renderToggleButton(showDiffOnly, showDiffOnly ? 'Diff only' : 'Full file', () => onShowDiffOnlyChange?.(!showDiffOnly), Rows3)}
              </div>
            </div>

            <button
              onClick={onClose}
              className="rounded-lg p-2 transition-colors hover:opacity-80"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
              title="Close compare view"
              aria-label="Close compare view"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
