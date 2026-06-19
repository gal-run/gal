'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, X, Check, RotateCcw, ExternalLink } from 'lucide-react'
import { api } from '@/lib/api'

interface OrphanedItem {
  platform: string
  field: string
  name: string
  content: string
  sourceRepo: string
  sourcePath: string
  sourceDeletedAt: string
}

interface OrphanBannerProps {
  orgName: string
}

/**
 * OrphanBanner (#4830)
 *
 * Shows a warning banner when approved config items have orphaned source files.
 * Expands to show a resolution panel where admins can "keep" or "re-source" each item.
 */
export function OrphanBanner({ orgName }: OrphanBannerProps) {
  const [orphanCount, setOrphanCount] = useState(0)
  const [byPlatform, setByPlatform] = useState<Record<string, number>>({})
  const [expanded, setExpanded] = useState(false)
  const [orphanedItems, setOrphanedItems] = useState<OrphanedItem[]>([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [resolving, setResolving] = useState<string | null>(null) // "platform:field:name" key
  const [dismissed, setDismissed] = useState(false)

  // Fetch orphan count on mount
  useEffect(() => {
    let cancelled = false
    async function fetchCount() {
      const result = await api.getOrphanedItemsCount(orgName)
      if (!cancelled) {
        setOrphanCount(result.total)
        setByPlatform(result.byPlatform)
      }
    }
    fetchCount()
    return () => { cancelled = true }
  }, [orgName])

  // Fetch detailed items when expanded
  useEffect(() => {
    if (!expanded || orphanedItems.length > 0) return
    let cancelled = false
    async function fetchItems() {
      setLoadingItems(true)
      const result = await api.getOrphanedItems(orgName)
      if (!cancelled) {
        setOrphanedItems(result.items)
        setLoadingItems(false)
      }
    }
    fetchItems()
    return () => { cancelled = true }
  }, [expanded, orgName, orphanedItems.length])

  const handleResolve = useCallback(async (item: OrphanedItem, action: 'keep' | 're-source') => {
    const key = `${item.platform}:${item.field}:${item.name}`
    setResolving(key)
    try {
      const result = await api.resolveOrphanedItem(orgName, {
        platform: item.platform,
        field: item.field,
        name: item.name,
        action,
      })
      if (result.success) {
        // Remove from local state
        setOrphanedItems(prev => prev.filter(i =>
          !(i.platform === item.platform && i.field === item.field && i.name === item.name)
        ))
        setOrphanCount(prev => Math.max(0, prev - 1))
      }
    } finally {
      setResolving(null)
    }
  }, [orgName])

  // Don't render if no orphans or dismissed
  if (orphanCount === 0 || dismissed) return null

  const platformList = Object.entries(byPlatform)
    .map(([p, count]) => `${p} (${count})`)
    .join(', ')

  return (
    <div className="mb-6 rounded-lg border border-[var(--status-warning-text)]/30 bg-[var(--status-warning-light)] overflow-hidden">
      {/* Banner header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--status-warning-text)] flex-shrink-0" />
          <div>
            <span className="text-sm font-medium text-[var(--status-warning-text)]">
              {orphanCount} orphaned config {orphanCount === 1 ? 'item' : 'items'}
            </span>
            <span className="text-xs text-[var(--text-muted)] ml-2">
              Source files were deleted from {platformList || 'repositories'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-[var(--status-warning-text)] hover:underline flex items-center gap-1"
          >
            {expanded ? 'Hide' : 'Review'}
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded hover:bg-[var(--surface-overlay)] transition-colors"
          >
            <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
          </button>
        </div>
      </div>

      {/* Expanded resolution panel */}
      {expanded && (
        <div className="border-t border-[var(--status-warning-text)]/20 p-4 space-y-3">
          {loadingItems ? (
            <div className="text-sm text-[var(--text-muted)] py-2">Loading orphaned items...</div>
          ) : orphanedItems.length === 0 ? (
            <div className="text-sm text-[var(--text-muted)] py-2">All orphans have been resolved.</div>
          ) : (
            orphanedItems.map((item) => {
              const key = `${item.platform}:${item.field}:${item.name}`
              const isResolving = resolving === key
              return (
                <div key={key} className="flex items-start justify-between gap-4 p-3 rounded-md bg-[var(--surface-primary)] border border-[var(--border-subtle)]">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-[var(--surface-secondary)] text-[var(--text-secondary)]">
                        {item.platform}
                      </span>
                      <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                        {item.name}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] flex items-center gap-1">
                      <span className="line-through">{item.sourceRepo}/{item.sourcePath}</span>
                      <span className="text-[var(--status-danger-text)]">(deleted)</span>
                    </div>
                    {item.sourceDeletedAt && (
                      <div className="text-xs text-[var(--text-muted)] mt-0.5">
                        Detected: {new Date(item.sourceDeletedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleResolve(item, 'keep')}
                      disabled={isResolving}
                      className="text-xs px-2.5 py-1.5 rounded border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] transition-colors flex items-center gap-1 disabled:opacity-50"
                      title="Keep this config as standalone policy (remove source tracking)"
                    >
                      <Check className="w-3 h-3" />
                      Keep
                    </button>
                    <button
                      onClick={() => handleResolve(item, 're-source')}
                      disabled={true}
                      className="text-xs px-2.5 py-1.5 rounded border border-[var(--border-subtle)] hover:bg-[var(--surface-secondary)] transition-colors flex items-center gap-1 disabled:opacity-50"
                      title="Re-source: point to a new file location (coming soon)"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Re-source
                    </button>
                  </div>
                </div>
              )
            })
          )}
          {orphanedItems.length > 0 && (
            <p className="text-xs text-[var(--text-muted)] pt-1">
              <strong>Keep:</strong> Retain the config content as a standalone policy (source tracking removed).{' '}
              <strong>Re-source:</strong> Point to a new file in a repo (coming soon).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
