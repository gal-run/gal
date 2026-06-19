'use client'

import { type FC, useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { AlertTriangle, RefreshCw, Loader2, ArrowLeft } from 'lucide-react'
import * as Sentry from '@/lib/sentry'
import { ConfigList } from './ConfigList'
import { ConfigViewer } from './ConfigViewer'
import type { DiscoveredConfigGroup } from '@/lib/api'
import { api } from '@/lib/api'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import type { DiffCompareMode } from './configDiffUtils'
import {
  getDiscoveryGroupKey,
  getPublishedPolicyItem,
  getRecommendedInstanceIndex,
  isPublishedInstance,
  type ApprovedConfigsByPlatform,
  type PublishedPolicyItem,
} from '@/lib/discoveryPolicy'
import {
  analyzeConfigContentBatchResults,
  getVisibleConfigGroups,
  type ConfigPreviewFailureState,
} from './configBrowserData'

const SPLIT_VIEW_STORAGE_KEY = 'gal-config-diff-split-view'
const SHOW_DIFF_ONLY_STORAGE_KEY = 'gal-config-diff-show-diff-only'
const COMPARE_MODE_STORAGE_KEY = 'gal-config-compare-mode'
const CONFIG_PREVIEW_RESYNC_MESSAGE =
  'Config preview unavailable — please re-sync your organization in Settings > GitHub.'

function getStoredBoolean(key: string, defaultValue: boolean): boolean {
  try {
    const stored = localStorage.getItem(key)
    if (stored === 'true') return true
    if (stored === 'false') return false
  } catch {
    // Ignore localStorage access issues.
  }
  return defaultValue
}

function getStoredCompareMode(): DiffCompareMode {
  try {
    return localStorage.getItem(COMPARE_MODE_STORAGE_KEY) === 'all' ? 'all' : 'single'
  } catch {
    return 'single'
  }
}

interface ConfigBrowserProps {
  groups: DiscoveredConfigGroup[]
  loading: boolean
  approvedConfigs: ApprovedConfigsByPlatform
  isAdmin: boolean
  orgName: string
  isStale?: boolean
  cachedAt?: string | null
  onApprove: (group: DiscoveredConfigGroup, instance: DiscoveredConfigGroup['instances'][number]) => void
  onRemove: (group: DiscoveredConfigGroup, publishedItem: PublishedPolicyItem | null) => void
  onBulkApprove: (selectedGroups: DiscoveredConfigGroup[]) => void
  onRefreshScan: () => void
  policyMutationKey?: string | null
  bulkSelection?: {
    isSelected: (id: string) => boolean
    toggle: (id: string) => void
    selectAll: (ids: string[]) => void
    clearAll: () => void
    count: number
  }
  externalTypeFilter?: string | null
  onExternalTypeFilterChange?: (type: string | null) => void
  externalSelectedConfigKey?: string | null
  onSelectedConfigChange?: (key: string | null) => void
  hasExternalSelectedItemParam?: boolean
}

export const ConfigBrowser: FC<ConfigBrowserProps> = ({
  groups,
  loading,
  approvedConfigs,
  isAdmin,
  orgName,
  isStale,
  cachedAt,
  onApprove,
  onRemove,
  onBulkApprove,
  onRefreshScan,
  policyMutationKey,
  bulkSelection,
  externalTypeFilter,
  onExternalTypeFilterChange,
  externalSelectedConfigKey,
  onSelectedConfigChange,
  hasExternalSelectedItemParam,
}) => {
  // State
  const [selectedConfigKey, setSelectedConfigKey] = useState<string | null>(() => externalSelectedConfigKey ?? null)
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState(() => externalTypeFilter ?? 'all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('recent')
  const [refreshing, setRefreshing] = useState(false)
  const [fetchedContent, setFetchedContent] = useState<Map<string, string>>(new Map())
  const [selectedVersionIndex, setSelectedVersionIndex] = useState(0)
  const [diffMode, setDiffMode] = useState(false)
  const [diffLeftIndex, setDiffLeftIndex] = useState(0)
  const [diffRightIndex, setDiffRightIndex] = useState(1)
  const [compareMode, setCompareMode] = useState<DiffCompareMode>(getStoredCompareMode)
  const [diffSplitView, setDiffSplitView] = useState<boolean>(() => getStoredBoolean(SPLIT_VIEW_STORAGE_KEY, true))
  const [diffShowDiffOnly, setDiffShowDiffOnly] = useState<boolean>(() => getStoredBoolean(SHOW_DIFF_ONLY_STORAGE_KEY, true))
  const [contentFetchStates, setContentFetchStates] = useState<Map<string, ConfigPreviewFailureState>>(new Map())
  const fetchedKeysRef = useRef<Set<string>>(new Set())
  const inFlightKeysRef = useRef<Set<string>>(new Set())
  const reportedPreviewFailuresRef = useRef<Set<string>>(new Set())
  const suppressAutoSelectRef = useRef(false)
  const lastExternalSelectedConfigKeyRef = useRef<string | null | undefined>(externalSelectedConfigKey)

  // #4747: Clear internal content cache when cachedAt changes (scan completed).
  // Without this, the stale fetchedKeysRef blocks re-fetching after a scan,
  // causing the "Cache is stale" banner to persist until a full page refresh.
  useEffect(() => {
    if (!cachedAt) return
    fetchedKeysRef.current.clear()
    inFlightKeysRef.current.clear()
    reportedPreviewFailuresRef.current.clear()
    setFetchedContent(new Map())
    setContentFetchStates(new Map())
  }, [cachedAt])

  // Sync external type filter from Discovery page Config Types section
  useEffect(() => {
    if (externalTypeFilter !== undefined) {
      suppressAutoSelectRef.current = false
      setTypeFilter(externalTypeFilter ?? 'all')
    }
  }, [externalTypeFilter])

  useEffect(() => {
    if (externalSelectedConfigKey === lastExternalSelectedConfigKeyRef.current) {
      return
    }

    lastExternalSelectedConfigKeyRef.current = externalSelectedConfigKey

    suppressAutoSelectRef.current = false
    setDiffMode(false)
    setSelectedConfigKey(externalSelectedConfigKey ?? null)

    if (!externalSelectedConfigKey) {
      setSelectedVersionIndex(0)
      return
    }

    const group = groups.find((candidate) => getDiscoveryGroupKey(candidate) === externalSelectedConfigKey)
    if (!group) {
      setSelectedVersionIndex(0)
      return
    }

    const publishedItem = getPublishedPolicyItem(group, approvedConfigs)
    const recommended = getRecommendedInstanceIndex(group.instances, publishedItem ?? null)
    setSelectedVersionIndex(recommended)
  }, [approvedConfigs, externalSelectedConfigKey, groups, selectedConfigKey])

  // Responsive breakpoints
  const isMobile = useMediaQuery('(max-width: 767px)')
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)')

  const selectedGroup = useMemo(() => {
    if (!selectedConfigKey) return null
    return groups.find((group) => getDiscoveryGroupKey(group) === selectedConfigKey) || null
  }, [selectedConfigKey, groups])

  const visibleGroups = useMemo(
    () =>
      getVisibleConfigGroups(groups, {
        searchQuery,
        typeFilter,
        statusFilter,
        sortBy,
      }),
    [groups, searchQuery, typeFilter, statusFilter, sortBy],
  )

  // Get selected config with fetched content
  const selectedConfig = useMemo(() => {
    if (!selectedGroup) return null

    return {
      name: selectedGroup.name,
      type: selectedGroup.type,
      platform: selectedGroup.platform,
      publishedItem: getPublishedPolicyItem(selectedGroup, approvedConfigs),
      instances: selectedGroup.instances.map((inst) => ({
        ...inst,
        content: inst.content || fetchedContent.get(`${inst.repo}:${inst.path}`) || '',
      })),
    }
  }, [selectedGroup, approvedConfigs, fetchedContent])

  const selectedContentFetchState = useMemo(() => {
    if (!selectedConfigKey) return null
    return contentFetchStates.get(selectedConfigKey) ?? null
  }, [contentFetchStates, selectedConfigKey])

  const reportConfigPreviewFailure = useCallback(
    (
      configKey: string,
      group: DiscoveredConfigGroup,
      failure: ConfigPreviewFailureState,
      batchMeta: { status: number; contentLength: number | null },
      requestedItems: Array<{ repo: string; path: string }>,
    ) => {
      const fingerprint = `${configKey}:${failure.status}:${failure.availableCount}:${failure.failedCount}`
      if (reportedPreviewFailuresRef.current.has(fingerprint)) {
        return
      }
      reportedPreviewFailuresRef.current.add(fingerprint)

      if (failure.status === 'unavailable') {
        return
      }

      Sentry.withScope((scope) => {
        scope.setLevel('warning')
        scope.setFingerprint(['discovery-config-preview', group.type, group.platform ?? 'unknown', failure.status])
        scope.setTag('orgName', orgName)
        scope.setTag('configName', group.name)
        scope.setTag('configType', group.type)
        scope.setTag('configPlatform', group.platform ?? 'unknown')
        scope.setTag('previewStatus', failure.status)
        scope.setContext('configPreview', {
          configKey,
          currentUrl: typeof window !== 'undefined' ? window.location.href : '',
          requestedItems,
          availableCount: failure.availableCount,
          failedCount: failure.failedCount,
          responseStatus: batchMeta.status,
          responseContentLength: batchMeta.contentLength,
        })
        Sentry.captureException(
          new Error(
            failure.status === 'unavailable'
              ? 'Discovery config preview unavailable'
              : 'Discovery config preview partially available',
          ),
        )
      })
    },
    [orgName],
  )

  const shouldDeferAutoSelect =
    Boolean(hasExternalSelectedItemParam) &&
    (externalSelectedConfigKey === null || externalSelectedConfigKey !== selectedConfigKey)

  // Fetch content for the selected config's instances on demand
  useEffect(() => {
    if (!selectedConfigKey || !orgName) return
    if (fetchedKeysRef.current.has(selectedConfigKey)) return
    if (inFlightKeysRef.current.has(selectedConfigKey)) return

    const group = groups.find((g) => getDiscoveryGroupKey(g) === selectedConfigKey)
    if (!group || group.instances.length === 0) return

    const toFetch = group.instances.filter(
      (inst) => !inst.content && !fetchedContent.has(`${inst.repo}:${inst.path}`),
    )
    if (toFetch.length === 0) {
      fetchedKeysRef.current.add(selectedConfigKey)
      return
    }

    inFlightKeysRef.current.add(selectedConfigKey)
    let cancelled = false

    const load = async () => {
      try {
        const requestedItems = toFetch.map((inst) => ({ repo: inst.repo, path: inst.path }))
        const batchResponse = await api.getConfigContentBatchDetailed(
          orgName,
          requestedItems,
        )
        if (cancelled) return
        const { contentEntries, failure } = analyzeConfigContentBatchResults(
          batchResponse.results,
          CONFIG_PREVIEW_RESYNC_MESSAGE,
        )

        if (failure) {
          reportConfigPreviewFailure(
            selectedConfigKey,
            group,
            failure,
            {
              status: batchResponse.status,
              contentLength: batchResponse.contentLength,
            },
            requestedItems,
          )
        }

        if (contentEntries.length === 0) {
          // Mark as fetched so contentLoading becomes false and the error message
          // is shown. Without this, contentLoading stays true and the spinner
          // never resolves. (#5708)
          fetchedKeysRef.current.add(selectedConfigKey)
          setContentFetchStates((prev) => {
            const next = new Map(prev)
            next.set(
              selectedConfigKey,
              failure ?? {
                status: 'unavailable',
                message: CONFIG_PREVIEW_RESYNC_MESSAGE,
                availableCount: 0,
                failedCount: requestedItems.length,
              },
            )
            return next
          })
          return
        }
        setContentFetchStates((prev) => {
          if (!failure && !prev.has(selectedConfigKey)) return prev
          const next = new Map(prev)
          if (failure) {
            next.set(selectedConfigKey, failure)
          } else {
            next.delete(selectedConfigKey)
          }
          return next
        })
        // Always create a new Map to trigger a re-render, even if results are empty.
        setFetchedContent((prev) => {
          const next = new Map(prev)
          for (const [key, content] of contentEntries) {
            next.set(key, content)
          }
          return next
        })
      } catch (error) {
        console.error('Failed to load config content:', error)
        if (cancelled) return
        const failure: ConfigPreviewFailureState = {
          status: 'unavailable',
          message: CONFIG_PREVIEW_RESYNC_MESSAGE,
          availableCount: 0,
          failedCount: toFetch.length,
        }
        reportConfigPreviewFailure(
          selectedConfigKey,
          group,
          failure,
          { status: 0, contentLength: null },
          toFetch.map((inst) => ({ repo: inst.repo, path: inst.path })),
        )
        setContentFetchStates((prev) => {
          const next = new Map(prev)
          next.set(selectedConfigKey, failure)
          return next
        })
        setFetchedContent((prev) => new Map(prev))
        // Do not add to fetchedKeysRef so retry is possible
        return
      } finally {
        inFlightKeysRef.current.delete(selectedConfigKey)
      }
      if (!cancelled) fetchedKeysRef.current.add(selectedConfigKey)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [selectedConfigKey, orgName, groups, fetchedContent, reportConfigPreviewFailure])

  useEffect(() => {
    try {
      localStorage.setItem(COMPARE_MODE_STORAGE_KEY, compareMode)
    } catch {
      // Ignore localStorage access issues.
    }
  }, [compareMode])

  useEffect(() => {
    try {
      localStorage.setItem(SPLIT_VIEW_STORAGE_KEY, String(diffSplitView))
    } catch {
      // Ignore localStorage access issues.
    }
  }, [diffSplitView])

  useEffect(() => {
    try {
      localStorage.setItem(SHOW_DIFF_ONLY_STORAGE_KEY, String(diffShowDiffOnly))
    } catch {
      // Ignore localStorage access issues.
    }
  }, [diffShowDiffOnly])

  useEffect(() => {
    const selectedStillVisible =
      selectedConfigKey !== null &&
      visibleGroups.some((group) => getDiscoveryGroupKey(group) === selectedConfigKey)

    if (selectedStillVisible) {
      return
    }

    setDiffMode(false)

    if (visibleGroups.length === 0) {
      if (selectedConfigKey !== null) {
        setSelectedConfigKey(null)
        setSelectedVersionIndex(0)
        onSelectedConfigChange?.(null)
      }
      return
    }

    if (suppressAutoSelectRef.current || shouldDeferAutoSelect) {
      return
    }

    const nextGroup = visibleGroups[0]
    const nextKey = getDiscoveryGroupKey(nextGroup)
    const publishedItem = getPublishedPolicyItem(nextGroup, approvedConfigs)
    const recommended = getRecommendedInstanceIndex(nextGroup.instances, publishedItem ?? null)

    setSelectedConfigKey(nextKey)
    setSelectedVersionIndex(recommended)
    onSelectedConfigChange?.(nextKey)
  }, [approvedConfigs, onSelectedConfigChange, selectedConfigKey, shouldDeferAutoSelect, visibleGroups])


  const handleSearchChange = useCallback((nextSearchQuery: string) => {
    suppressAutoSelectRef.current = false
    setSearchQuery(nextSearchQuery)
  }, [])

  const handleTypeFilterChange = useCallback((nextTypeFilter: string) => {
    suppressAutoSelectRef.current = false
    setTypeFilter(nextTypeFilter)
    onExternalTypeFilterChange?.(nextTypeFilter === 'all' ? null : nextTypeFilter)
  }, [onExternalTypeFilterChange])

  const handleStatusFilterChange = useCallback((nextStatusFilter: string) => {
    suppressAutoSelectRef.current = false
    setStatusFilter(nextStatusFilter)
  }, [])

  const handleSortByChange = useCallback((nextSortBy: string) => {
    suppressAutoSelectRef.current = false
    setSortBy(nextSortBy)
  }, [])

  // Handle config selection
  const handleSelectConfig = useCallback((key: string | null) => {
    setDiffMode(false)
    suppressAutoSelectRef.current = key === null
    setSelectedConfigKey(key)
    onSelectedConfigChange?.(key)
    if (!key) {
      setSelectedVersionIndex(0)
      return
    }
    // Default to recommended source instead of always index 0
    const group = groups.find((g) => getDiscoveryGroupKey(g) === key)
    if (group) {
      const publishedItem = getPublishedPolicyItem(group, approvedConfigs)
      const recommended = getRecommendedInstanceIndex(group.instances, publishedItem ?? null)
      setSelectedVersionIndex(recommended)
    } else {
      setSelectedVersionIndex(0)
    }
  }, [groups, approvedConfigs, onSelectedConfigChange])

  // Handle back to list on mobile
  const handleBackToList = useCallback(() => {
    handleSelectConfig(null)
  }, [handleSelectConfig])

  // Handle refresh - clear cached content so it re-fetches after scan
  const handleRefresh = async () => {
    setRefreshing(true)
    fetchedKeysRef.current.clear()
    setFetchedContent(new Map())
    await onRefreshScan()
    setRefreshing(false)
  }

  // Handle bulk approve
  const handleBulkApprove = useCallback(() => {
    if (!bulkSelection || bulkSelection.count === 0) return

    const selectedGroups = groups.filter((group) => bulkSelection.isSelected(getDiscoveryGroupKey(group)))

    onBulkApprove(selectedGroups)
  }, [groups, bulkSelection, onBulkApprove])

  // Determine list width based on screen size
  const selectedNeedsContent =
    !!selectedConfig &&
    selectedConfig.instances.some(
      (inst) => !inst.content && !fetchedContent.has(`${inst.repo}:${inst.path}`),
    )

  const contentLoading =
    !!selectedConfigKey && !fetchedKeysRef.current.has(selectedConfigKey) && selectedNeedsContent

  const listWidthClass = isTablet ? 'w-72' : isMobile ? 'w-full' : 'w-96'
  const instanceCount = selectedConfig?.instances.length ?? 0
  const effectiveCompareMode: DiffCompareMode =
    compareMode === 'all' && instanceCount < 3 ? 'single' : compareMode
  const showDesktopSidebar = !isMobile

  const getAlternateIndex = useCallback((targetIndex: number, currentIndex: number, total: number) => {
    for (let index = 0; index < total; index += 1) {
      if (index !== targetIndex && index !== currentIndex) {
        return index
      }
    }

    for (let index = 0; index < total; index += 1) {
      if (index !== targetIndex) {
        return index
      }
    }

    return targetIndex
  }, [])

  const handleDiffLeftChange = useCallback((nextLeftIndex: number) => {
    setDiffLeftIndex(nextLeftIndex)

    const total = selectedConfig?.instances.length ?? 0
    if (nextLeftIndex === diffRightIndex && total > 1) {
      setDiffRightIndex(getAlternateIndex(nextLeftIndex, diffRightIndex, total))
    }
  }, [diffRightIndex, getAlternateIndex, selectedConfig?.instances.length])

  const handleDiffRightChange = useCallback((nextRightIndex: number) => {
    setDiffRightIndex(nextRightIndex)

    const total = selectedConfig?.instances.length ?? 0
    if (nextRightIndex === diffLeftIndex && total > 1) {
      setDiffLeftIndex(getAlternateIndex(nextRightIndex, diffLeftIndex, total))
    }
  }, [diffLeftIndex, getAlternateIndex, selectedConfig?.instances.length])

  return (
    <div className="dashboard-card p-0 overflow-visible">
      {/* Staleness warning banner */}
      {isStale && (
        <div
          className="p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
          style={{
            backgroundColor: 'var(--status-warning-light)',
            borderBottom: '1px solid var(--status-warning)',
          }}
        >
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--status-warning-text)' }} />
            <span className="text-sm" style={{ color: 'var(--status-warning-text)' }}>
              Cache is stale{cachedAt ? ` (last updated: ${new Date(cachedAt).toLocaleString()})` : ''}
              . Data may be outdated.
            </span>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="px-3 py-1 text-xs rounded-lg flex items-center gap-1 font-medium transition-colors whitespace-nowrap"
            style={{ backgroundColor: 'var(--status-warning)', color: 'var(--text-on-accent)' }}
          >
            {refreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        </div>
      )}

      {/* Bulk action bar (admin only) */}
      {isAdmin && bulkSelection && bulkSelection.count > 0 && (
        <div
          className="p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
          style={{ backgroundColor: 'var(--accent-bg)', borderBottom: '1px solid var(--accent)' }}
        >
          <span className="text-sm" style={{ color: 'var(--accent)' }}>
            {bulkSelection.count} config{bulkSelection.count > 1 ? 's' : ''} selected
          </span>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => bulkSelection.clearAll()}
              className="text-xs px-2 py-1 rounded"
              style={{ color: 'var(--accent)' }}
            >
              Clear
            </button>
            <button
              onClick={handleBulkApprove}
              className="px-3 py-1.5 text-sm rounded transition-colors flex-1 sm:flex-none"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--text-on-accent)',
              }}
            >
              Publish Selected ({bulkSelection.count})
            </button>
          </div>
        </div>
      )}

      {!isMobile && (
        <div
          className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-secondary)' }}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Config Browser
            </p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Scroll the whole page while expanding the file view when you need more room.
            </p>
          </div>
        </div>
      )}

      {/* Responsive layout */}
      <div
        className="flex flex-col md:flex-row"
        style={{
          minHeight: isMobile ? 'auto' : '720px',
        }}
      >
        {/* Left panel - Config list (use display:none on mobile to keep mounted) */}
        <div
          className={`${listWidthClass} flex-shrink-0 overflow-hidden flex flex-col`}
          style={{
            // Explicit height so h-full inside ConfigList resolves correctly and
            // the virtualizer scroll container gets a bounded clientHeight.
            // Without this, h-full resolves against content height (61k+ px) and
            // the virtualizer renders all items instead of only visible ones. (#5709)
            ...(isMobile ? {} : { height: '720px' }),
            ...((isMobile && selectedConfigKey) || !showDesktopSidebar ? { display: 'none' } : {}),
            ...(!isMobile ? { borderRight: '1px solid var(--border-subtle)' } : {}),
          }}
        >
          <ConfigList
            groups={groups}
            approvedConfigs={approvedConfigs}
            loading={loading}
            selectedConfigKey={selectedConfigKey}
            onSelectConfig={handleSelectConfig}
            contentStatusByKey={new Map(
              Array.from(contentFetchStates.entries()).map(([key, value]) => [key, value.status]),
            )}
            searchQuery={searchQuery}
            onSearchChange={handleSearchChange}
            typeFilter={typeFilter}
            onTypeFilterChange={handleTypeFilterChange}
            statusFilter={statusFilter}
            onStatusFilterChange={handleStatusFilterChange}
            sortBy={sortBy}
            onSortByChange={handleSortByChange}
            isAdmin={isAdmin}
            bulkSelection={bulkSelection}
            naturalScroll={false}
            selectedVersionIndex={selectedVersionIndex}
            onSelectVersion={setSelectedVersionIndex}
            getPublishedItemForGroup={(group) => getPublishedPolicyItem(group, approvedConfigs)}
            deferAutoSelect={shouldDeferAutoSelect}
          />
        </div>

        {/* Right panel - Content viewer (use display:none on mobile to keep mounted) */}
        <div
          className="flex-1 min-w-0 overflow-visible"
          style={{
            ...(isMobile && !selectedConfigKey ? { display: 'none' } : {}),
            minHeight: '500px',
          }}
        >
          {/* Mobile back button */}
          {isMobile && selectedConfigKey && (
            <div
              className="p-3 flex items-center gap-2"
              style={{
                borderBottom: '1px solid var(--border-subtle)',
                backgroundColor: 'var(--bg-secondary)',
              }}
            >
              <button
                onClick={handleBackToList}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                }}
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back to List</span>
              </button>
            </div>
          )}

          <ConfigViewer
            config={selectedConfig}
            isAdmin={isAdmin}
            loading={contentLoading && (!selectedConfig || selectedConfig.instances.some((i) => !i.content))}
            contentFetchError={selectedContentFetchState?.message ?? null}
            selectedVersionIndex={selectedVersionIndex}
            onSelectVersion={setSelectedVersionIndex}
            policyMutationPending={Boolean(
              selectedGroup && policyMutationKey === `approve:${getDiscoveryGroupKey(selectedGroup)}`
            )}
            policyRemovalPending={Boolean(
              selectedGroup && policyMutationKey === `remove:${getDiscoveryGroupKey(selectedGroup)}`
            )}
            diffMode={diffMode}
            diffLeftIndex={diffLeftIndex}
            diffRightIndex={diffRightIndex}
            diffCompareMode={effectiveCompareMode}
            diffSplitView={diffSplitView}
            diffShowDiffOnly={diffShowDiffOnly}
            onDiffLeftChange={handleDiffLeftChange}
            onDiffRightChange={handleDiffRightChange}
            onDiffCompareModeChange={setCompareMode}
            onDiffSplitViewChange={setDiffSplitView}
            onDiffShowDiffOnlyChange={setDiffShowDiffOnly}
            onCloseDiff={() => setDiffMode(false)}
            onOpenDiff={() => {
              const total = selectedConfig?.instances.length ?? 0
              const nextLeftIndex = Math.min(selectedVersionIndex, Math.max(total - 1, 0))
              setDiffLeftIndex(nextLeftIndex)
              setDiffRightIndex(total > 1 ? getAlternateIndex(nextLeftIndex, -1, total) : 0)
              setDiffMode(true)
            }}
            onApprove={(instance) => {
              if (selectedConfig) {
                const group = groups.find((g) => getDiscoveryGroupKey(g) === selectedConfigKey)
                if (group) {
                  onApprove(group, instance)
                }
              }
            }}
            onRemove={() => {
              if (!selectedGroup || !selectedConfig?.publishedItem) return
              onRemove(selectedGroup, selectedConfig.publishedItem)
            }}
            naturalScroll={!isMobile}
          />
        </div>
      </div>
    </div>
  )
}
