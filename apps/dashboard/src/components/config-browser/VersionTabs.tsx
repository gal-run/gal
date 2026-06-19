'use client'

import type { FC } from 'react'
import { GitCompareArrows } from 'lucide-react'
import { isPublishedInstance, type PublishedPolicyItem } from '@/lib/discoveryPolicy'

interface VersionInstance {
  repo: string
  path: string
  lastModified: string
  hash?: string
}

interface VersionTabsProps {
  instances: VersionInstance[]
  publishedItem?: PublishedPolicyItem | null
  selectedIndex: number
  onSelectVersion: (index: number) => void
  onCompare?: () => void
}

export const VersionTabs: FC<VersionTabsProps> = ({
  instances,
  publishedItem = null,
  selectedIndex,
  onSelectVersion,
  onCompare,
}) => {
  if (instances.length <= 1) {
    return null
  }

  // Check if all versions are identical (by comparing hashes)
  const allIdentical = instances.length > 1 &&
    new Set(instances.map(i => i.hash).filter(Boolean)).size <= 1

  // Sort by lastModified (newest first)
  const sortedInstances = [...instances].sort(
    (a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime()
  )

  // Find indices for sorted array
  const sortedSelectedIndex = sortedInstances.findIndex(
    (inst) => inst.repo === instances[selectedIndex].repo && inst.path === instances[selectedIndex].path
  )

  return (
    <div
      className="p-4 space-y-3 overflow-hidden"
      style={{ borderTop: '1px solid var(--border-subtle)' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          Versions ({instances.length} repos)
        </h4>
        {onCompare && instances.length >= 2 && (
          allIdentical ? (
            <span
              className="text-xs px-2 py-1 rounded"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
                opacity: 0.7,
              }}
            >
              All versions identical ✓
            </span>
          ) : (
            <button
              onClick={onCompare}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
              title="Compare versions side-by-side"
            >
              <GitCompareArrows className="h-3.5 w-3.5" />
              Compare revisions
            </button>
          )
        )}
      </div>

      {/* Version tabs - horizontal scroll */}
      <div className="flex gap-2 overflow-x-auto pb-2" style={{ scrollbarWidth: 'thin' }}>
        {sortedInstances.map((instance, sortedIdx) => {
          const isSelected = sortedIdx === sortedSelectedIndex
          const isLatest = sortedIdx === 0
          const isPublished = isPublishedInstance(publishedItem, instance)
          const originalIndex = instances.findIndex(
            (inst) => inst.repo === instance.repo && inst.path === instance.path
          )

          const relativeDate = (() => {
            const date = new Date(instance.lastModified)
            const now = new Date()
            const diffMs = now.getTime() - date.getTime()
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

            if (diffDays === 0) return 'Today'
            if (diffDays === 1) return 'Yesterday'
            if (diffDays < 7) return `${diffDays} days ago`
            if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          })()

          return (
            <button
              key={`${instance.repo}-${sortedIdx}`}
              onClick={() => onSelectVersion(originalIndex)}
              className="flex flex-col items-start px-4 py-2.5 rounded-lg transition-colors min-w-[140px] flex-shrink-0"
              style={{
                backgroundColor: isSelected ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
                border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
              }}
            >
              <div className="flex items-center gap-2 w-full">
                <span
                  className="font-medium text-sm truncate"
                  style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}
                >
                  {instance.repo}
                </span>
                {isLatest && (
                  <span
                    className="text-[10px] px-1 py-0.5 rounded flex-shrink-0"
                    style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}
                  >
                    Latest
                  </span>
                )}
                {isPublished && (
                  <span
                    className="text-[10px] px-1 py-0.5 rounded flex-shrink-0"
                    style={{ backgroundColor: 'var(--status-success-light)', color: 'var(--status-success-text)' }}
                  >
                    Published
                  </span>
                )}
              </div>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {relativeDate}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
