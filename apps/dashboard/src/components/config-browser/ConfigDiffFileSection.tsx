'use client'

import { memo, type FC, useEffect, useMemo, useRef, useState } from 'react'
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued'
import { ChevronDown, ChevronRight, File, FileCode2, FileText, GitCompareArrows } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import type { ConfigInstance, DiffSummary } from './configDiffUtils'
import { formatCompareRelativeDate, getSharedPath, getShortHash } from './configDiffUtils'

interface ConfigDiffFileSectionProps {
  sectionId: string
  leftInstance: ConfigInstance
  rightInstance: ConfigInstance
  summary: DiffSummary
  splitView: boolean
  showDiffOnly: boolean
  collapsed?: boolean
  collapsible?: boolean
  onToggleCollapsed?: () => void
  showSectionHeader?: boolean
  stickyOffset?: number | string
}

function getFileIcon(path: string) {
  if (path.endsWith('.md')) return FileText
  if (path.endsWith('.json') || path.endsWith('.yaml') || path.endsWith('.yml')) return FileCode2
  return File
}

const MemoizedDiffViewer = memo(function MemoizedDiffViewer({
  oldValue,
  newValue,
  splitView,
  useDarkTheme,
  styles,
  showDiffOnly,
}: {
  oldValue: string
  newValue: string
  splitView: boolean
  useDarkTheme: boolean
  styles: Record<string, unknown>
  showDiffOnly: boolean
}) {
  return (
    <ReactDiffViewer
      oldValue={oldValue}
      newValue={newValue}
      splitView={splitView}
      compareMethod={DiffMethod.LINES}
      useDarkTheme={useDarkTheme}
      styles={styles}
      showDiffOnly={showDiffOnly}
      extraLinesSurroundingDiff={2}
    />
  )
})

export const ConfigDiffFileSection: FC<ConfigDiffFileSectionProps> = ({
  sectionId,
  leftInstance,
  rightInstance,
  summary,
  splitView,
  showDiffOnly,
  collapsed = false,
  collapsible = true,
  onToggleCollapsed,
  showSectionHeader = true,
  stickyOffset = 0,
}) => {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const sectionRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [hasEnteredViewport, setHasEnteredViewport] = useState(!showSectionHeader)
  const [contentHeight, setContentHeight] = useState<number | null>(null)
  const FileIcon = getFileIcon(rightInstance.path)
  const stickyTopValue = typeof stickyOffset === 'number' ? `${stickyOffset}px` : stickyOffset

  useEffect(() => {
    if (!sectionRef.current || hasEnteredViewport) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setHasEnteredViewport(true)
          observer.disconnect()
        }
      },
      { rootMargin: '160px 0px' },
    )

    observer.observe(sectionRef.current)
    return () => observer.disconnect()
  }, [hasEnteredViewport])

  useEffect(() => {
    if (!contentRef.current) return
    setContentHeight(contentRef.current.scrollHeight)
  }, [collapsed, splitView, showDiffOnly, hasEnteredViewport, leftInstance.content, rightInstance.content])

  const customStyles = useMemo(() => {
    const variables = isDark
      ? {
          dark: {
            diffViewerBackground: 'var(--bg-secondary)',
            diffViewerTitleBackground: 'var(--bg-secondary)',
            diffViewerTitleColor: 'var(--text-primary)',
            diffViewerTitleBorderColor: 'var(--border-subtle)',
            addedBackground: '#123321',
            removedBackground: '#34151b',
            addedGutterBackground: '#123321',
            removedGutterBackground: '#34151b',
            gutterBackground: 'var(--bg-secondary)',
            gutterColor: 'var(--text-muted)',
            codeFoldBackground: 'var(--bg-tertiary)',
            emptyLineBackground: 'var(--bg-secondary)',
            addedColor: '#b7f0c0',
            removedColor: '#ffb4bf',
            wordAddedBackground: '#245836',
            wordRemovedBackground: '#6a2231',
          },
        }
      : {
          light: {
            diffViewerBackground: '#ffffff',
            diffViewerTitleBackground: '#f6f8fa',
            diffViewerTitleColor: '#24292f',
            diffViewerTitleBorderColor: '#d0d7de',
            addedBackground: '#e6ffec',
            removedBackground: '#ffebe9',
            addedGutterBackground: '#ccffd8',
            removedGutterBackground: '#ffd7d5',
            gutterBackground: '#f6f8fa',
            gutterColor: '#57606a',
            codeFoldBackground: '#f6f8fa',
            emptyLineBackground: '#ffffff',
            addedColor: '#1a7f37',
            removedColor: '#cf222e',
            wordAddedBackground: '#abf2bc',
            wordRemovedBackground: '#ffcecb',
          },
        }

    return {
      variables,
      diffContainer: {
        width: '100%',
        overflowX: 'auto',
      },
      content: {
        minWidth: 'max-content',
      },
      splitView: {
        minWidth: splitView ? '920px' : '100%',
      },
      titleBlock: {
        display: 'none',
      },
      line: {
        minWidth: 'max-content',
      },
      contentText: {
        whiteSpace: 'pre',
        wordBreak: 'normal',
      },
      marker: {
        minWidth: '3rem',
      },
    } as const
  }, [isDark, splitView])

  return (
    <section
      id={sectionId}
      ref={sectionRef}
      className="overflow-hidden rounded-xl"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
        scrollMarginTop: `calc(${stickyTopValue} + 16px)`,
      }}
    >
      {showSectionHeader && (
        <div
          className="sticky top-0 z-20 px-4 py-3"
          style={{
            top: stickyTopValue,
            backgroundColor: 'color-mix(in srgb, var(--bg-secondary) 94%, transparent)',
            borderBottom: '1px solid var(--border-subtle)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <FileIcon className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }} title={rightInstance.path}>
                  {getSharedPath(leftInstance, rightInstance)}
                </span>
                <span
                  className="px-2 py-0.5 rounded-full text-xs flex-shrink-0"
                  style={{
                    backgroundColor: summary.identical ? 'var(--bg-tertiary)' : 'var(--accent-bg)',
                    color: summary.identical ? 'var(--text-muted)' : 'var(--accent)',
                  }}
                >
                  {summary.identical ? 'Identical ✓' : `+${summary.added} / -${summary.removed}`}
                </span>
              </div>
              <div className="grid gap-2 mt-2 md:grid-cols-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="truncate" title={`${leftInstance.repo} · ${getShortHash(leftInstance.hash)} · ${formatCompareRelativeDate(leftInstance.lastModified)}`}>
                  {leftInstance.repo} · {getShortHash(leftInstance.hash)} · {formatCompareRelativeDate(leftInstance.lastModified)}
                </span>
                <span className="truncate" title={`${rightInstance.repo} · ${getShortHash(rightInstance.hash)} · ${formatCompareRelativeDate(rightInstance.lastModified)}`}>
                  {rightInstance.repo} · {getShortHash(rightInstance.hash)} · {formatCompareRelativeDate(rightInstance.lastModified)}
                </span>
              </div>
            </div>

            {collapsible && (
              <button
                onClick={onToggleCollapsed}
                className="p-2 rounded-lg transition-colors flex-shrink-0"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
                aria-label={collapsed ? 'Expand diff section' : 'Collapse diff section'}
              >
                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      )}

      <div
        className="overflow-hidden transition-[max-height,opacity] duration-200 ease-out"
        style={{
          maxHeight: collapsed ? 0 : `${contentHeight ?? 9999}px`,
          opacity: collapsed ? 0 : 1,
        }}
      >
        <div ref={contentRef}>
          {!showSectionHeader && (
            <div
              className="sticky top-0 z-10 grid gap-px"
              style={{
                top: stickyTopValue,
                gridTemplateColumns: splitView ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
                backgroundColor: 'var(--border-subtle)',
              }}
            >
              {splitView ? (
                <>
                  <div className="px-4 py-2 text-sm font-medium truncate" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }} title={leftInstance.repo}>
                    {leftInstance.repo}
                  </div>
                  <div className="px-4 py-2 text-sm font-medium truncate" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }} title={rightInstance.repo}>
                    {rightInstance.repo}
                  </div>
                </>
              ) : (
                <div className="px-4 py-2 text-sm font-medium flex items-center gap-2" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                  <span>{leftInstance.repo}</span>
                  <GitCompareArrows className="w-3.5 h-3.5" />
                  <span>{rightInstance.repo}</span>
                </div>
              )}
            </div>
          )}

          {hasEnteredViewport ? (
            <div className="overflow-x-auto min-w-0">
              <MemoizedDiffViewer
                oldValue={leftInstance.content}
                newValue={rightInstance.content}
                splitView={splitView}
                useDarkTheme={isDark}
                styles={customStyles}
                showDiffOnly={showDiffOnly}
              />
            </div>
          ) : (
            <div className="px-4 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>
              Preparing diff…
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
