'use client'

import { type FC, useEffect, useRef } from 'react'
import { isPublishedInstance, getRecommendedInstanceIndex, type PublishedPolicyItem } from '@/lib/discoveryPolicy'

interface SourceInstance {
  repo: string
  path: string
  lastModified: string
  commitCount30d?: number
}

interface SourcePickerPopoverProps {
  instances: SourceInstance[]
  selectedIndex: number
  onSelect: (index: number) => void
  publishedItem: PublishedPolicyItem | null | undefined
  isOpen: boolean
  onClose: () => void
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'today'
  if (diffDays === 1) return 'yesterday'
  if (diffDays < 30) return `${diffDays}d ago`
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}mo ago`
  return `${Math.floor(diffDays / 365)}y ago`
}

function truncatePath(path: string, maxLen = 32): string {
  if (path.length <= maxLen) return path
  return '…' + path.slice(-(maxLen - 1))
}

export const SourcePickerPopover: FC<SourcePickerPopoverProps> = ({
  instances,
  selectedIndex,
  onSelect,
  publishedItem,
  isOpen,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)

  // Outside-click dismissal
  useEffect(() => {
    if (!isOpen) return
    const handleMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const recommendedIndex = getRecommendedInstanceIndex(instances, publishedItem)

  // Find the latest-modified instance index
  const latestIndex = instances.reduce((best, inst, idx) =>
    new Date(inst.lastModified) > new Date(instances[best]!.lastModified) ? idx : best, 0)

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Select source repository"
      style={{
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        zIndex: 50,
        width: '280px',
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        boxShadow: 'var(--shadow-md, 0 4px 20px rgba(0,0,0,0.15))',
        overflow: 'hidden',
        animation: 'sourcePickerIn 120ms ease-out',
      }}
    >
      <style>{`
        @keyframes sourcePickerIn {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
          Source Repository
        </span>
      </div>

      <div className="py-1">
        {instances.map((inst, idx) => {
          const isSelected = idx === selectedIndex
          const isPublished = isPublishedInstance(publishedItem ?? null, inst)
          const isRecommended = idx === recommendedIndex
          const isLatest = idx === latestIndex && !isRecommended && !isPublished

          return (
            <button
              key={`${inst.repo}-${idx}`}
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                onSelect(idx)
                onClose()
              }}
              className="w-full text-left px-3 py-2.5 transition-colors flex items-start gap-2.5"
              style={{
                backgroundColor: isSelected ? 'var(--accent-bg)' : 'transparent',
              }}
              onMouseEnter={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--bg-tertiary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isSelected) {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
                }
              }}
            >
              {/* Radio indicator */}
              <div
                className="flex-shrink-0 mt-0.5"
                style={{
                  width: '14px',
                  height: '14px',
                  borderRadius: '50%',
                  border: isSelected ? '4px solid var(--accent)' : '2px solid var(--border-subtle)',
                  backgroundColor: isSelected ? 'var(--accent)' : 'transparent',
                  transition: 'border 120ms ease, background-color 120ms ease',
                  boxSizing: 'border-box',
                }}
              />

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span
                    className="text-sm font-medium truncate"
                    style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}
                  >
                    {inst.repo}
                  </span>

                  {isPublished && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        backgroundColor: 'var(--status-success-light)',
                        color: 'var(--status-success-text)',
                      }}
                    >
                      Published
                    </span>
                  )}
                  {isRecommended && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        backgroundColor: 'var(--accent-bg)',
                        color: 'var(--accent)',
                      }}
                    >
                      Recommended
                    </span>
                  )}
                  {isLatest && (
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      Latest
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="text-xs truncate"
                    style={{ color: 'var(--text-muted)', maxWidth: '160px', display: 'inline-block' }}
                    title={inst.path}
                  >
                    {truncatePath(inst.path)}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>·</span>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {formatRelativeDate(inst.lastModified)}
                  </span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
