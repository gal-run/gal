'use client'

import type { FC } from 'react'
import type { DiffSummary } from './configDiffUtils'

export interface ConfigDiffTocItem {
  id: string
  label: string
  caption: string
  summary: DiffSummary
}

interface ConfigDiffTocProps {
  items: ConfigDiffTocItem[]
  open: boolean
  onToggle: () => void
  onSelect: (id: string) => void
}

export const ConfigDiffToc: FC<ConfigDiffTocProps> = ({
  items,
  open,
  onToggle,
  onSelect,
}) => (
  <div className="sticky z-30 ml-auto mb-4 w-fit" style={{ top: 'var(--config-diff-sticky-offset, 4.5rem)' }}>
    <button
      onClick={onToggle}
      className="rounded-lg px-3 py-2 text-sm transition-colors hover:opacity-80"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-subtle)',
        boxShadow: 'var(--shadow-md)',
      }}
    >
      {open ? 'Hide files' : `Files (${items.length})`}
    </button>

    {open && (
      <div
        className="mt-3 w-[320px] max-w-[calc(100vw-2rem)] rounded-2xl p-3 space-y-2"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
        }}
      >
        <div className="px-2 pb-1 text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Compare all
        </div>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className="w-full rounded-xl px-3 py-3 text-left transition-colors hover:opacity-90"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {item.label}
                </div>
                <div className="mt-1 truncate text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {item.caption}
                </div>
              </div>
              <div className="text-xs flex items-center gap-2 flex-shrink-0">
                {item.summary.identical ? (
                  <span style={{ color: 'var(--text-muted)' }}>✓</span>
                ) : (
                  <>
                    <span style={{ color: 'var(--status-success)' }}>+{item.summary.added}</span>
                    <span style={{ color: 'var(--status-danger)' }}>-{item.summary.removed}</span>
                  </>
                )}
              </div>
            </div>
          </button>
        ))}
      </div>
    )}
  </div>
)
