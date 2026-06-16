'use client'

import { type FC, forwardRef, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Check, AlertTriangle, ChevronDown, FileX2 } from 'lucide-react'
import { SourcePickerPopover } from './SourcePickerPopover'
import type { PublishedPolicyItem } from '@/lib/discoveryPolicy'
import { ConfigCheckbox } from './ConfigCheckbox'
import { useConfigBrowserSelection } from './ConfigBrowserSelectionContext'
import { getConfigPresentation } from './configPresentation'

interface ConfigListItemInstance {
  repo: string
  path: string
  lastModified: string
  commitCount30d?: number
}

interface ConfigListItemProps {
  name: string
  type: string
  platform?: string
  repoCount: number
  isConsistent: boolean
  contentStatus?: 'partial' | 'unavailable' | null
  isSelected: boolean
  isApproved: boolean
  showCheckbox: boolean
  checkboxChecked: boolean
  onCheckboxChange?: () => void
  onClick: () => void
  tabIndex?: number
  commitDate?: string
  commitCount30d?: number
  lastCommitAuthor?: string
  // Source picker props
  instances?: ConfigListItemInstance[]
  selectedVersionIndex?: number
  onSelectVersion?: (index: number) => void
  publishedItem?: PublishedPolicyItem | null
}

/** Fixed-position tooltip that escapes overflow containers via portal */
const FixedTooltip: FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)

  const show = useCallback(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos({ top: rect.top - 4, left: rect.left })
    setVisible(true)
  }, [])

  const hide = useCallback(() => setVisible(false), [])

  return (
    <div
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      className="inline-flex min-w-0 max-w-full"
    >
      {children}
      {visible &&
        createPortal(
          <span
            className="px-2 py-1 text-xs rounded whitespace-nowrap pointer-events-none"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: 'translateY(-100%)',
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
              zIndex: 9999,
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </div>
  )
}

export const ConfigListItem = forwardRef<HTMLDivElement, ConfigListItemProps>(
  (
    {
      name,
      type,
      platform,
      repoCount,
      isConsistent,
      contentStatus = null,
      isSelected,
      isApproved,
      showCheckbox,
      checkboxChecked,
      onCheckboxChange,
      onClick,
      tabIndex = -1,
      commitDate,
      commitCount30d,
      lastCommitAuthor,
      instances,
      selectedVersionIndex = 0,
      onSelectVersion,
      publishedItem,
    },
    ref,
  ) => {
    const [popoverOpen, setPopoverOpen] = useState(false)
    const [isHovered, setIsHovered] = useState(false)
    const { anySelected } = useConfigBrowserSelection()
    const isChecked = checkboxChecked
    const revealCheckbox = isHovered || isChecked || anySelected

    // Format relative time for commit date
    const formatRelativeDate = (dateStr: string | undefined): string | null => {
      if (!dateStr) return null
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

    const getActivityBadge = (count: number | undefined): { label: string; color: string } | null => {
      if (count === undefined || count === null) return null
      if (count > 20) return { label: 'High activity', color: 'var(--accent)' }
      if (count > 5) return { label: 'Active', color: 'var(--text-secondary)' }
      if (count > 0) return { label: 'Low activity', color: 'var(--text-muted)' }
      return null
    }

    const relativeDate = formatRelativeDate(commitDate)
    const activityBadge = getActivityBadge(commitCount30d)
    const consistencyTooltip = isConsistent
      ? 'Consistent across all repos'
      : 'Conflicts: repos have different versions'
    const contentStatusTooltip =
      contentStatus === 'partial'
        ? 'Config preview partially available'
        : 'Config preview unavailable'

    const typeInfo = getConfigPresentation({ type, platform })
    const isFocused = tabIndex === 0

    return (
      <div
        ref={ref}
        onClick={onClick}
        tabIndex={tabIndex}
        role="option"
        aria-selected={isSelected}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="w-full px-4 py-3.5 text-left rounded-lg transition-all relative focus:outline-none cursor-default"
        style={{
          backgroundColor: isSelected ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
          border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
          boxShadow: isFocused ? '0 0 0 3px var(--accent-bg)' : 'none',
        }}
      >
        {/* Approval indicator - subtle green left border */}
        {isApproved && (
          <div
            className="absolute left-0 top-0 bottom-0 w-1 rounded-l-lg"
            style={{ backgroundColor: 'var(--accent)' }}
          />
        )}

        <div className="flex items-center gap-3">
          {/* Checkbox (hover-reveal, all users) */}
          {showCheckbox && (
            <div className={`transition-all duration-150 ${revealCheckbox ? 'opacity-100 w-5' : 'opacity-0 w-0 overflow-hidden'}`}>
              <ConfigCheckbox
                checked={isChecked}
                onChange={(e) => {
                  e.stopPropagation()
                  onCheckboxChange?.()
                }}
              />
            </div>
          )}

          {/* Type icon */}
          <span className="text-xl flex-shrink-0">{typeInfo.icon}</span>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Config name with tooltip for truncated paths */}
            <FixedTooltip text={name}>
              <p
                className="font-medium truncate text-[15px]"
                style={{ color: isSelected ? 'var(--accent)' : 'var(--text-primary)' }}
              >
                {name}
              </p>
            </FixedTooltip>

            {/* Type label and repo count / source picker */}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                {typeInfo.label}
              </span>
              {typeInfo.platformBadge && (
                <span
                  className="text-[11px] px-1.5 py-0.5 rounded-full"
                  style={{ color: 'var(--text-secondary)', backgroundColor: 'var(--bg-secondary)' }}
                >
                  {typeInfo.platformBadge}
                </span>
              )}
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                •
              </span>
              {/* Source picker trigger */}
              <div className="relative">
                {repoCount > 1 && instances && instances.length > 1 && onSelectVersion ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setPopoverOpen((prev) => !prev)
                    }}
                    className="inline-flex items-center gap-1 text-sm rounded transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    title="Choose source repository"
                  >
                    <span className="max-w-[100px] truncate" style={{ display: 'inline-block' }}>
                      {instances[selectedVersionIndex]?.repo ?? instances[0]?.repo}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>·</span>
                    <span>{repoCount}</span>
                    <ChevronDown
                      className="w-3 h-3 flex-shrink-0 transition-transform"
                      style={{
                        color: 'var(--text-muted)',
                        transform: popoverOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    />
                  </button>
                ) : (
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    {repoCount} {repoCount === 1 ? 'repo' : 'repos'}
                  </span>
                )}
                {instances && instances.length > 1 && onSelectVersion && (
                  <SourcePickerPopover
                    instances={instances}
                    selectedIndex={selectedVersionIndex}
                    onSelect={onSelectVersion}
                    publishedItem={publishedItem}
                    isOpen={popoverOpen}
                    onClose={() => setPopoverOpen(false)}
                  />
                )}
              </div>
              {relativeDate && (
                <>
                  <span className="text-sm" style={{ color: 'var(--text-muted)' }}>•</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {relativeDate}
                    {lastCommitAuthor ? ` by ${lastCommitAuthor}` : ''}
                  </span>
                </>
              )}
              {activityBadge && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded"
                  style={{ color: activityBadge.color, backgroundColor: 'var(--bg-secondary)' }}
                >
                  {activityBadge.label}
                </span>
              )}
            </div>
          </div>

          {contentStatus && (
            <div className="flex-shrink-0">
              <FixedTooltip text={contentStatusTooltip}>
                <div
                  className="flex items-center justify-center w-6 h-6 rounded"
                  style={{
                    backgroundColor:
                      contentStatus === 'partial'
                        ? 'var(--status-warning-light)'
                        : 'var(--status-danger-light)',
                  }}
                  role="img"
                  aria-label={contentStatusTooltip}
                  title={contentStatusTooltip}
                  tabIndex={0}
                >
                  {contentStatus === 'partial' ? (
                    <AlertTriangle className="w-4 h-4" style={{ color: 'var(--status-warning-text)' }} />
                  ) : (
                    <FileX2 className="w-4 h-4" style={{ color: 'var(--status-danger)' }} />
                  )}
                </div>
              </FixedTooltip>
            </div>
          )}

          {/* Consistency icon */}
          {repoCount > 1 && (
            <div className="flex-shrink-0">
              <FixedTooltip text={consistencyTooltip}>
                {isConsistent ? (
                  <div
                    className="flex items-center justify-center w-6 h-6 rounded"
                    style={{ backgroundColor: 'var(--accent-bg)' }}
                    role="img"
                    aria-label={consistencyTooltip}
                    title={consistencyTooltip}
                    tabIndex={0}
                  >
                    <Check className="w-4 h-4" style={{ color: 'var(--accent)' }} />
                  </div>
                ) : (
                  <div
                    className="flex items-center justify-center w-6 h-6 rounded"
                    style={{ backgroundColor: 'var(--status-warning-light)' }}
                    role="img"
                    aria-label={consistencyTooltip}
                    title={consistencyTooltip}
                    tabIndex={0}
                  >
                    <AlertTriangle className="w-4 h-4" style={{ color: 'var(--status-warning-text)' }} />
                  </div>
                )}
              </FixedTooltip>
            </div>
          )}
        </div>
      </div>
    )
  },
)

ConfigListItem.displayName = 'ConfigListItem'
