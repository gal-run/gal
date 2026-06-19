'use client'

/**
 * Diff Viewer Component - Display config changes
 *
 * Shows added, modified, and removed fields in config with color coding.
 *
 * Feature: Config Governance Model (GitHub Issue #1044)
 */

import { useState } from 'react'
import { Plus, Minus, Edit, ChevronDown, ChevronRight } from 'lucide-react'
import type { ConfigDiff } from '@gal/types'

interface DiffViewerProps {
  diff: ConfigDiff
}

interface CollapsibleSectionProps {
  title: string
  count: number
  icon: React.ReactNode
  color: string
  children: React.ReactNode
}

function CollapsibleSection({ title, count, icon, color, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(true)

  if (count === 0) return null

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 w-full p-3 bg-[var(--bg-tertiary)] rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--text-muted)]" />
        )}
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
          {icon}
        </div>
        <span className="font-medium text-[var(--text-primary)]">
          {title} ({count})
        </span>
      </button>
      {isOpen && <div className="mt-2 pl-14">{children}</div>}
    </div>
  )
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}

export function DiffViewer({ diff }: DiffViewerProps) {
  const addedCount = Object.keys(diff.added).length
  const modifiedCount = Object.keys(diff.modified).length
  const removedCount = Object.keys(diff.removed).length

  if (addedCount === 0 && modifiedCount === 0 && removedCount === 0) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        No changes detected
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Added Fields */}
      <CollapsibleSection
        title="Added"
        count={addedCount}
        icon={<Plus className="w-4 h-4 text-[var(--status-success)]" />}
        color="bg-[var(--status-success-light)]"
      >
        <div className="space-y-2">
          {Object.entries(diff.added).map(([key, value]) => (
            <div
              key={key}
              className="p-3 bg-[var(--status-success-light)] border-l-4 border-[var(--status-success-text)] rounded"
            >
              <div className="font-mono text-sm text-[var(--status-success-text)] mb-1">{key}</div>
              <pre className="text-xs text-[var(--text-primary)] overflow-x-auto">
                {formatValue(value)}
              </pre>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Modified Fields */}
      <CollapsibleSection
        title="Modified"
        count={modifiedCount}
        icon={<Edit className="w-4 h-4 text-[var(--status-warning)]" />}
        color="bg-[var(--status-warning-light)]"
      >
        <div className="space-y-2">
          {Object.entries(diff.modified).map(([key, { old: oldValue, new: newValue }]) => (
            <div
              key={key}
              className="p-3 rounded"
              style={{
                backgroundColor: 'var(--status-warning-light)',
                borderLeft: '4px solid var(--status-warning-text)',
              }}
            >
              <div className="font-mono text-sm text-[var(--status-warning-text)] mb-2">{key}</div>
              <div className="space-y-2">
                <div>
                  <div className="text-xs text-[var(--status-danger-text)] mb-1">- Old:</div>
                  <pre className="text-xs text-[var(--text-primary)] bg-[var(--status-danger-light)] p-2 rounded overflow-x-auto">
                    {formatValue(oldValue)}
                  </pre>
                </div>
                <div>
                  <div className="text-xs text-[var(--status-success-text)] mb-1">+ New:</div>
                  <pre className="text-xs text-[var(--text-primary)] bg-[var(--status-success-light)] p-2 rounded overflow-x-auto">
                    {formatValue(newValue)}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Removed Fields */}
      <CollapsibleSection
        title="Removed"
        count={removedCount}
        icon={<Minus className="w-4 h-4 text-[var(--status-danger)]" />}
        color="bg-[var(--status-danger-light)]"
      >
        <div className="space-y-2">
          {Object.entries(diff.removed).map(([key, value]) => (
            <div
              key={key}
              className="p-3 bg-[var(--status-danger-light)] border-l-4 border-[var(--status-danger-text)] rounded"
            >
              <div className="font-mono text-sm text-[var(--status-danger-text)] mb-1">{key}</div>
              <pre className="text-xs text-[var(--text-primary)] overflow-x-auto">
                {formatValue(value)}
              </pre>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Summary */}
      <div className="p-4 bg-[var(--bg-tertiary)] rounded-lg border border-[var(--border-subtle)] mt-6">
        <div className="text-sm text-[var(--text-muted)]">
          <span className="text-[var(--status-success)] font-medium">+{addedCount}</span> added,{' '}
          <span className="text-[var(--status-warning)] font-medium">~{modifiedCount}</span> modified,{' '}
          <span className="text-[var(--status-danger)] font-medium">-{removedCount}</span> removed
        </div>
      </div>
    </div>
  )
}
