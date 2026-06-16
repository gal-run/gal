'use client'

import { type FC, useState, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Loader2 } from 'lucide-react'
import { SessionCard } from './SessionCard'
import { api } from '@/lib/api'

interface SessionHistoryPanelProps {
  orgName: string
  isCollapsed: boolean
  onToggleCollapse: () => void
  onSessionSelect?: (sessionId: number) => void
  selectedSessionId?: number | null
  isMobile?: boolean
}

type FilterTab = 'all' | 'active' | 'completed' | 'failed'

export const SessionHistoryPanel: FC<SessionHistoryPanelProps> = ({
  orgName,
  isCollapsed,
  onToggleCollapse,
  onSessionSelect,
  selectedSessionId,
  isMobile = false,
}) => {
  const [sessions, setSessions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  // Fetch sessions with pagination
  const fetchSessions = async (pageNum: number, append = false) => {
    try {
      if (append) {
        setLoadingMore(true)
      }
      const result = await api.listWorkflowRuns(orgName, { limit: 20, page: pageNum })
      if (append) {
        setSessions((prev) => [...prev, ...result.runs])
      } else {
        setSessions(result.runs)
      }
      setHasMore(result.hasMore)
      setTotalCount(result.totalCount)
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  // Poll for workflow runs every 5 seconds (only first page)
  useEffect(() => {
    fetchSessions(0)
    const interval = setInterval(() => fetchSessions(0), 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgName])

  // Load more handler
  const handleLoadMore = () => {
    const nextPage = page + 1
    setPage(nextPage)
    fetchSessions(nextPage, true)
  }

  // Filter sessions based on active tab
  const filteredSessions = useMemo(() => {
    if (activeFilter === 'all') return sessions

    return sessions.filter((session) => {
      if (activeFilter === 'active') {
        return session.status === 'queued' || session.status === 'in_progress'
      }
      if (activeFilter === 'completed') {
        return session.status === 'completed' && session.conclusion === 'success'
      }
      if (activeFilter === 'failed') {
        return session.status === 'completed' && session.conclusion === 'failure'
      }
      return false
    })
  }, [sessions, activeFilter])

  // Count sessions by filter
  const counts = useMemo(() => {
    const active = sessions.filter(
      (s) => s.status === 'queued' || s.status === 'in_progress'
    ).length
    const completed = sessions.filter(
      (s) => s.status === 'completed' && s.conclusion === 'success'
    ).length
    const failed = sessions.filter(
      (s) => s.status === 'completed' && s.conclusion === 'failure'
    ).length

    return { all: sessions.length, active, completed, failed }
  }, [sessions])

  // Filter tabs config
  const filterTabs = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'active', label: 'Active', count: counts.active },
    { key: 'completed', label: 'Completed', count: counts.completed },
    { key: 'failed', label: 'Failed', count: counts.failed },
  ]

  // Render filter tabs
  const renderFilterTabs = () => (
    <div
      className="flex gap-1 px-4 py-3 border-b overflow-x-auto"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {filterTabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => setActiveFilter(tab.key as FilterTab)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
            activeFilter === tab.key
              ? 'bg-[var(--accent)] text-[var(--text-on-accent)]'
              : 'hover:bg-[var(--bg-tertiary)]'
          }`}
          style={
            activeFilter !== tab.key
              ? { color: 'var(--text-muted)' }
              : undefined
          }
        >
          {tab.label}
          {tab.count > 0 && (
            <span
              className={`ml-1.5 ${
                activeFilter === tab.key ? 'text-[var(--text-on-accent)]' : 'text-[var(--text-muted)]'
              }`}
            >
              ({tab.count})
            </span>
          )}
        </button>
      ))}
    </div>
  )

  // Render session list content
  const renderSessionList = (maxHeight?: string) => (
    <div className="overflow-y-auto p-3 space-y-2" style={maxHeight ? { maxHeight } : undefined}>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
        </div>
      ) : filteredSessions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            No sessions found
          </p>
        </div>
      ) : (
        <>
          {filteredSessions.map((session) => (
            <SessionCard
              key={session.id}
              id={session.id}
              status={session.status}
              conclusion={session.conclusion}
              command={session.command}
              args={session.args}
              triggeredBy={session.triggeredBy}
              createdAt={session.createdAt}
              isSelected={session.id === selectedSessionId}
              onClick={() => onSessionSelect?.(session.id)}
            />
          ))}
          {/* Load More */}
          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
              }}
            >
              {loadingMore ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </span>
              ) : (
                `Load More (${totalCount - sessions.length} remaining)`
              )}
            </button>
          )}
        </>
      )}
    </div>
  )

  // Mobile bottom sheet layout
  if (isMobile) {
    return (
      <div
        className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-in-out ${
          isCollapsed ? 'translate-y-[calc(100%-48px)]' : 'translate-y-0'
        }`}
        style={{
          backgroundColor: 'var(--bg-card)',
          borderTop: '1px solid var(--border-subtle)',
          maxHeight: '70vh',
        }}
      >
        {/* Bottom sheet handle */}
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center py-3 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            {isCollapsed ? (
              <ChevronUp className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
            ) : (
              <ChevronDown className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
            )}
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Sessions ({counts.all})
            </span>
          </div>
        </button>

        {!isCollapsed && (
          <>
            {renderFilterTabs()}
            {renderSessionList('calc(70vh - 120px)')}
          </>
        )}
      </div>
    )
  }

  // Desktop collapsed state
  if (isCollapsed) {
    return (
      <div
        className="w-12 border-r flex flex-col items-center py-4"
        style={{
          borderColor: 'var(--border-subtle)',
          backgroundColor: 'var(--bg-card)',
        }}
      >
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    )
  }

  // Desktop expanded state
  return (
    <div
      className="w-80 border-r flex flex-col"
      style={{
        borderColor: 'var(--border-subtle)',
        backgroundColor: 'var(--bg-card)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: 'var(--border-subtle)' }}
      >
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          Sessions
        </h2>
        <button
          onClick={onToggleCollapse}
          className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>

      {renderFilterTabs()}

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {renderSessionList()}
      </div>
    </div>
  )
}
