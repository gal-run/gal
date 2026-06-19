'use client'

import { type FC, type ReactNode, useCallback, useEffect, useState, useRef, useMemo } from 'react'
import { Loader2, FileCode } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ConfigListItem } from './ConfigListItem'
import { ConfigFilters } from './ConfigFilters'
import { EmptyState } from './EmptyState'
import { ConfigBrowserSelectionProvider } from './ConfigBrowserSelectionContext'
import type { DiscoveredConfigGroup } from '@/lib/api'
import { getDiscoveryGroupKey, getPublishedPolicyItem, type ApprovedConfigsByPlatform, type PublishedPolicyItem } from '@/lib/discoveryPolicy'
import { getVisibleConfigGroups, isConfigGroupConsistent } from './configBrowserData'
import { getDiscoveryTypeGuide } from '@/lib/discoveryTypeGuidance'

/** Estimated height (px) for a config list item row. */
const ITEM_HEIGHT_ESTIMATE = 76
/** Height (px) for a section header row. */
const SECTION_HEADER_HEIGHT = 32

/** A virtualised row is either a section header or a config-group item. */
type VirtualRow =
  | { kind: 'header'; label: string; type: string }
  | { kind: 'item'; group: DiscoveredConfigGroup; flatIndex: number }

interface ConfigListProps {
  groups: DiscoveredConfigGroup[]
  approvedConfigs: ApprovedConfigsByPlatform
  loading: boolean
  selectedConfigKey: string | null
  onSelectConfig: (key: string) => void
  contentStatusByKey?: Map<string, 'partial' | 'unavailable'>
  searchQuery: string
  onSearchChange: (query: string) => void
  typeFilter: string
  onTypeFilterChange: (type: string) => void
  statusFilter: string
  onStatusFilterChange: (status: string) => void
  sortBy: string
  onSortByChange: (sort: string) => void
  isAdmin: boolean
  naturalScroll?: boolean
  bulkSelection?: {
    isSelected: (id: string) => boolean
    toggle: (id: string) => void
    selectAll: (ids: string[]) => void
    clearAll: () => void
    count: number
  }
  // Source picker passthrough
  selectedVersionIndex?: number
  onSelectVersion?: (index: number) => void
  getPublishedItemForGroup?: (group: DiscoveredConfigGroup) => PublishedPolicyItem | null
  deferAutoSelect?: boolean
}

export const ConfigList: FC<ConfigListProps> = ({
  groups,
  approvedConfigs,
  loading,
  selectedConfigKey,
  onSelectConfig,
  contentStatusByKey,
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  isAdmin,
  naturalScroll = false,
  bulkSelection,
  selectedVersionIndex,
  onSelectVersion,
  getPublishedItemForGroup,
  deferAutoSelect = false,
}) => {
  const sortedGroups = useMemo(
    () =>
      getVisibleConfigGroups(groups, {
        searchQuery,
        typeFilter,
        statusFilter,
        sortBy,
      }),
    [groups, searchQuery, typeFilter, statusFilter, sortBy],
  )

  // ---------------------------------------------------------------------------
  // Build a flat virtual-row list (headers + items) for the virtualizer.
  // ---------------------------------------------------------------------------
  const TYPE_ORDER = ['instructions', 'subagent', 'skill', 'command', 'workflow', 'prompt', 'hook', 'rule', 'policy', 'settings', 'mcp', 'agent']
  const TYPE_LABELS: Record<string, string> = {
    instructions: 'AGENTS.md',
    command: 'Commands',
    workflow: 'Workflows',
    prompt: 'Prompts',
    hook: 'Hooks',
    settings: 'Settings',
    subagent: 'Subagents',
    skill: 'Skills',
    rule: 'Rules',
    policy: 'Policies',
    mcp: 'MCP Configs',
    agent: 'Agents',
  }
  const activeTypeGuide = useMemo(
    () => getDiscoveryTypeGuide(typeFilter === 'all' ? null : typeFilter),
    [typeFilter],
  )

  const virtualRows: VirtualRow[] = useMemo(() => {
    const rows: VirtualRow[] = []
    if (sortedGroups.length === 0) return rows

    const normalizeType = (t: string) => (t === 'agent' ? 'subagent' : t)

    // When a type filter is active, skip section headers
    if (typeFilter !== 'all') {
      sortedGroups.forEach((group, i) => {
        rows.push({ kind: 'item', group, flatIndex: i })
      })
      return rows
    }

    // Group indices by normalised type
    const sectionMap = new Map<string, number[]>()
    sortedGroups.forEach((group, i) => {
      const t = normalizeType(group.type)
      if (!sectionMap.has(t)) sectionMap.set(t, [])
      sectionMap.get(t)!.push(i)
    })

    // Only add headers when there are 2+ distinct types
    if (sectionMap.size <= 1) {
      sortedGroups.forEach((group, i) => {
        rows.push({ kind: 'item', group, flatIndex: i })
      })
      return rows
    }

    const orderedTypes = [
      ...TYPE_ORDER.filter((t) => sectionMap.has(t)),
      ...Array.from(sectionMap.keys()).filter((t) => !TYPE_ORDER.includes(t)),
    ]

    for (const type of orderedTypes) {
      rows.push({ kind: 'header', label: TYPE_LABELS[type] ?? type, type })
      for (const i of sectionMap.get(type)!) {
        rows.push({ kind: 'item', group: sortedGroups[i]!, flatIndex: i })
      }
    }

    return rows
  }, [sortedGroups, typeFilter])

  // Compute consistency for each group
  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState(0)

  // Collect only item-type rows for keyboard navigation
  const itemRows = useMemo(
    () => virtualRows.filter((r): r is VirtualRow & { kind: 'item' } => r.kind === 'item'),
    [virtualRows],
  )

  const safeFocusedIndex = itemRows.length === 0 ? 0 : Math.min(focusedIndex, itemRows.length - 1)
  const itemRefsMap = useRef<Map<number, HTMLDivElement | null>>(new Map())
  const hasAutoSelected = useRef(false)

  // Auto-select first config only on initial data load (not when user clears selection)
  useEffect(() => {
    if (!selectedConfigKey && sortedGroups.length > 0 && !hasAutoSelected.current && !deferAutoSelect) {
      hasAutoSelected.current = true
      const firstKey = getDiscoveryGroupKey(sortedGroups[0]!)
      onSelectConfig(firstKey)
    }
  }, [deferAutoSelect, sortedGroups, selectedConfigKey, onSelectConfig])

  // Focus the active item when focusedIndex changes via keyboard
  useEffect(() => {
    const el = itemRefsMap.current.get(safeFocusedIndex)
    if (el && document.activeElement?.closest('[role="listbox"]')) {
      el.focus({ preventScroll: true })
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [safeFocusedIndex])

  // Keyboard navigation handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (itemRows.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIndex((prev) => Math.min(prev + 1, itemRows.length - 1))
          break

        case 'ArrowUp':
          e.preventDefault()
          setFocusedIndex((prev) => Math.max(prev - 1, 0))
          break

        case 'Home':
          e.preventDefault()
          setFocusedIndex(0)
          break

        case 'End':
          e.preventDefault()
          setFocusedIndex(itemRows.length - 1)
          break

        case 'Enter':
          e.preventDefault()
          if (itemRows[safeFocusedIndex]) {
            const configKey = getDiscoveryGroupKey(itemRows[safeFocusedIndex].group)
            onSelectConfig(configKey)
          }
          break
      }
    },
    [itemRows, safeFocusedIndex, onSelectConfig],
  )

  const selectionCount = bulkSelection?.count ?? 0

  // ---------------------------------------------------------------------------
  // Virtualizer setup
  // ---------------------------------------------------------------------------
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: virtualRows.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index) => {
      const row = virtualRows[index]
      return row?.kind === 'header' ? SECTION_HEADER_HEIGHT : ITEM_HEIGHT_ESTIMATE
    },
    overscan: 10,
  })

  // Reset virtualizer scroll when filters / search / sort change
  useEffect(() => {
    setFocusedIndex(0)
    rowVirtualizer.scrollToOffset(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, typeFilter, statusFilter, sortBy])

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const renderVirtualRow = (row: VirtualRow, itemIndex: number) => {
    if (row.kind === 'header') {
      return (
        <div className="px-1 pt-3 pb-0.5">
          <span
            className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: 'var(--text-muted)' }}
          >
            {row.label}
          </span>
        </div>
      )
    }

    const { group, flatIndex } = row
    const configKey = getDiscoveryGroupKey(group)
    const isConsistent = isConfigGroupConsistent(group)
    const isApproved = Boolean(getPublishedPolicyItem(group, approvedConfigs))

    return (
      <ConfigListItem
        ref={(el) => {
          itemRefsMap.current.set(itemIndex, el)
        }}
        name={group.name}
        type={group.type}
        platform={group.platform}
        repoCount={group.instances.length}
        isConsistent={isConsistent}
        contentStatus={contentStatusByKey?.get(configKey) ?? null}
        isSelected={selectedConfigKey === configKey}
        isApproved={isApproved}
        showCheckbox={!!bulkSelection}
        checkboxChecked={bulkSelection?.isSelected(configKey) || false}
        onCheckboxChange={() => bulkSelection?.toggle(configKey)}
        onClick={() => {
          setFocusedIndex(itemIndex)
          onSelectConfig(configKey)
        }}
        tabIndex={safeFocusedIndex === itemIndex ? 0 : -1}
        commitDate={group.instances[0]?.commitDate}
        commitCount30d={group.instances[0]?.commitCount30d}
        lastCommitAuthor={group.instances[0]?.lastCommitAuthor}
        instances={group.instances}
        selectedVersionIndex={selectedConfigKey === configKey ? selectedVersionIndex : undefined}
        onSelectVersion={selectedConfigKey === configKey ? onSelectVersion : undefined}
        publishedItem={getPublishedItemForGroup ? getPublishedItemForGroup(group) : getPublishedPolicyItem(group, approvedConfigs)}
      />
    )
  }

  // Map from virtual-row index → item-only index (for keyboard nav)
  const virtualRowToItemIndex = useMemo(() => {
    const map = new Map<number, number>()
    let itemIdx = 0
    virtualRows.forEach((row, rowIdx) => {
      if (row.kind === 'item') {
        map.set(rowIdx, itemIdx)
        itemIdx++
      }
    })
    return map
  }, [virtualRows])

  return (
    <ConfigBrowserSelectionProvider anySelected={selectionCount > 0}>
      <div
        className={`flex flex-col ${naturalScroll ? 'min-h-[32rem]' : 'h-full'}`}
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        {/* Filters */}
        <ConfigFilters
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
          typeFilter={typeFilter}
          onTypeFilterChange={onTypeFilterChange}
          statusFilter={statusFilter}
          onStatusFilterChange={onStatusFilterChange}
          sortBy={sortBy}
          onSortByChange={onSortByChange}
        />

        {/* Bulk selection header (admin only) */}
        {isAdmin && bulkSelection && sortedGroups.length > 0 && (
          <SelectAllHeader
            bulkSelection={bulkSelection}
            sortedGroups={sortedGroups}
          />
        )}

        {/* Floating selection counter pill */}
        {selectionCount > 0 && (
          <div
            className="sticky top-0 z-10 mx-2 mb-1 flex items-center gap-2 px-3 py-2 rounded-xl shadow-sm animate-slideDown"
            role="status"
            aria-live="polite"
            style={{ backgroundColor: 'var(--accent)', color: 'white' }}
          >
            <span className="text-[12px] font-semibold flex-1">{selectionCount} selected</span>
            {isAdmin && (
              <button
                onClick={() => bulkSelection?.clearAll()}
                className="text-[11px] font-medium px-2 py-0.5 rounded-md transition-colors"
                style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.3)' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(255,255,255,0.2)' }}
              >
                Clear
              </button>
            )}
            {!isAdmin && (
              <button
                onClick={() => bulkSelection?.clearAll()}
                className="text-[11px] transition-colors"
                style={{ color: 'rgba(255,255,255,0.8)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'white' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)' }}
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Config list — virtualized scroll container (#4033) */}
        <div
          ref={scrollContainerRef}
          className={`${naturalScroll ? 'p-3' : 'flex-1 overflow-y-auto p-3'}`}
          role="listbox"
          aria-label="Config list"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          style={{ outline: 'none' }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
            </div>
          ) : sortedGroups.length === 0 ? (
            <div className="flex flex-col items-center gap-3">
              <EmptyState
                icon={FileCode}
                message={
                  searchQuery || typeFilter !== 'all' || statusFilter !== 'all'
                    ? 'No configs match your filters'
                    : 'No configs found. Run a scan to discover configs.'
                }
                details={
                  !searchQuery && typeFilter !== 'all'
                    ? activeTypeGuide?.emptyStateDetails
                    : undefined
                }
              />

            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const row = virtualRows[virtualItem.index]!
                const itemIndex = virtualRowToItemIndex.get(virtualItem.index)
                return (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={rowVirtualizer.measureElement}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    {renderVirtualRow(row, itemIndex ?? 0)}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Total item count footer — replaces old pagination (#4033) */}
        {!loading && sortedGroups.length > 0 && (
          <div
            className="px-4 py-2 text-xs flex-shrink-0"
            style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}
          >
            {sortedGroups.length} config{sortedGroups.length !== 1 ? 's' : ''}
            {sortedGroups.length !== groups.length && ` of ${groups.length} total`}
          </div>
        )}
      </div>
    </ConfigBrowserSelectionProvider>
  )
}

/**
 * SelectAllHeader - Checkbox header with indeterminate state support.
 *
 * Shows a tri-state checkbox:
 * - Unchecked: no items selected
 * - Indeterminate (dash): some items selected
 * - Checked: all visible items selected
 *
 * Label dynamically updates to reflect the current state.
 */
function SelectAllHeader({
  bulkSelection,
  sortedGroups,
}: {
  bulkSelection: NonNullable<ConfigListProps['bulkSelection']>
  sortedGroups: DiscoveredConfigGroup[]
}) {
  const checkboxRef = useRef<HTMLInputElement>(null)

  const visibleKeys = useMemo(
    () => sortedGroups.map((group) => getDiscoveryGroupKey(group)),
    [sortedGroups],
  )

  const selectedVisibleCount = useMemo(
    () => visibleKeys.filter((key) => bulkSelection.isSelected(key)).length,
    [visibleKeys, bulkSelection],
  )

  const allSelected = selectedVisibleCount === visibleKeys.length && visibleKeys.length > 0
  const someSelected = selectedVisibleCount > 0 && !allSelected

  // Sync the indeterminate property (not controllable via JSX attribute)
  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = someSelected
    }
  }, [someSelected])

  const handleChange = useCallback(() => {
    if (allSelected) {
      bulkSelection.clearAll()
    } else {
      bulkSelection.selectAll(visibleKeys)
    }
  }, [allSelected, bulkSelection, visibleKeys])

  const label = allSelected
    ? 'Deselect All'
    : someSelected
      ? `${selectedVisibleCount} of ${visibleKeys.length} selected`
      : `Select All (${visibleKeys.length})`

  return (
    <div
      className="flex items-center justify-between px-4 py-2"
      style={{ borderBottom: '1px solid var(--border-subtle)' }}
    >
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={allSelected}
          onChange={handleChange}
          className="w-4 h-4 rounded"
          style={{ accentColor: 'var(--accent)' }}
          aria-label={allSelected ? 'Deselect all configs' : 'Select all configs'}
        />
        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </span>
      </label>
      {bulkSelection.count > 0 && (
        <span
          className="text-xs px-2 py-0.5 rounded"
          style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}
        >
          {bulkSelection.count} selected
        </span>
      )}
    </div>
  )
}
