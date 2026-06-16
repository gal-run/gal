'use client'

/**
 * QueueIntakePanel Component (#1974)
 *
 * Allows users to enqueue GitHub issues or milestone issues into the
 * work-item queue directly from the Dashboard Queue tab, without using the CLI.
 *
 * Migrated from apps/dashboard to Next.js App Router.
 */

import { useState, useCallback, useEffect, useRef, type FC, type ChangeEvent } from 'react'
import {
  GitMerge,
  Search,
  Loader2,
  CheckSquare,
  Square,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react'
import { api } from '@/lib/api'

type IntakeMode = 'milestone' | 'issues'

interface Milestone {
  number: number
  title: string
  open_issues: number
  state: string
}

interface Issue {
  number: number
  title: string
  labels: Array<{ name: string }>
  assignees: Array<{ login: string }>
}

interface EnqueueResult {
  queued: number
  skipped: number
  failed: number
  errors: string[]
}

interface DiscoveredRepo {
  name: string
  configCount: number
  configTypes: string[]
  lastScanned: string
}

interface QueueIntakePanelProps {
  orgName: string
}

export const QueueIntakePanel: FC<QueueIntakePanelProps> = ({ orgName }) => {
  // Repo fields - owner is always the org (static)
  const [repo, setRepo] = useState('')
  const [repoTouched, setRepoTouched] = useState(false)

  // Discovered repos for searchable dropdown
  const [discoveredRepos, setDiscoveredRepos] = useState<DiscoveredRepo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')
  const repoDropdownRef = useRef<HTMLDivElement>(null)

  // Mode
  const [mode, setMode] = useState<IntakeMode>('milestone')

  // Milestones
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [milestonesLoading, setMilestonesLoading] = useState(false)
  const [milestoneError, setMilestoneError] = useState<string | null>(null)
  const [selectedMilestone, setSelectedMilestone] = useState<number | null>(null)

  // Issues list
  const [issues, setIssues] = useState<Issue[]>([])
  const [issuesLoading, setIssuesLoading] = useState(false)
  const [issuesError, setIssuesError] = useState<string | null>(null)
  const [searchFilter, setSearchFilter] = useState('')
  const [selectedIssues, setSelectedIssues] = useState<Set<number>>(new Set())

  // Enqueue state
  const [enqueuing, setEnqueuing] = useState(false)
  const [enqueueResult, setEnqueueResult] = useState<EnqueueResult | null>(null)
  const [enqueueError, setEnqueueError] = useState<string | null>(null)

  // --- Fetch discovered repos on mount ---

  useEffect(() => {
    let cancelled = false
    const fetchRepos = async () => {
      setReposLoading(true)
      try {
        const data = await api.getDiscoveredRepos(orgName)
        if (!cancelled) {
          setDiscoveredRepos(data.repos ?? [])
        }
      } catch {
        // Silently fail - user can still type manually
        if (!cancelled) setDiscoveredRepos([])
      } finally {
        if (!cancelled) setReposLoading(false)
      }
    }
    fetchRepos()
    return () => { cancelled = true }
  }, [orgName])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(e.target as Node)) {
        setRepoDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // --- Loaders ---

  const loadMilestones = useCallback(async () => {
    if (!orgName.trim() || !repo.trim()) return
    setMilestonesLoading(true)
    setMilestoneError(null)
    setMilestones([])
    setSelectedMilestone(null)
    setIssues([])
    setSelectedIssues(new Set())
    setEnqueueResult(null)
    try {
      const data = await api.getMilestones(orgName, orgName.trim(), repo.trim())
      setMilestones(data)
    } catch (err) {
      setMilestoneError(err instanceof Error ? err.message : 'Failed to load milestones')
    } finally {
      setMilestonesLoading(false)
    }
  }, [orgName, repo])

  const loadIssues = useCallback(
    async (milestoneNumber?: number) => {
      if (!orgName.trim() || !repo.trim()) return
      setIssuesLoading(true)
      setIssuesError(null)
      setIssues([])
      setSelectedIssues(new Set())
      setEnqueueResult(null)
      try {
        const data = await api.getIssues(orgName, orgName.trim(), repo.trim(), milestoneNumber)
        setIssues(data)
      } catch (err) {
        setIssuesError(err instanceof Error ? err.message : 'Failed to load issues')
      } finally {
        setIssuesLoading(false)
      }
    },
    [orgName, repo],
  )

  // --- Handlers ---

  const handleLoadClick = useCallback(() => {
    if (mode === 'milestone') {
      loadMilestones()
    } else {
      loadIssues()
    }
  }, [mode, loadMilestones, loadIssues])

  const handleModeChange = useCallback(
    (newMode: IntakeMode) => {
      setMode(newMode)
      setMilestones([])
      setSelectedMilestone(null)
      setIssues([])
      setSelectedIssues(new Set())
      setEnqueueResult(null)
      setEnqueueError(null)
    },
    [],
  )

  const handleMilestoneSelect = useCallback(
    (milestoneNumber: number) => {
      setSelectedMilestone(milestoneNumber)
      setSelectedIssues(new Set())
      setEnqueueResult(null)
      loadIssues(milestoneNumber)
    },
    [loadIssues],
  )

  const toggleIssue = useCallback((issueNumber: number) => {
    setSelectedIssues((prev) => {
      const next = new Set(prev)
      if (next.has(issueNumber)) {
        next.delete(issueNumber)
      } else {
        next.add(issueNumber)
      }
      return next
    })
  }, [])

  const toggleAllIssues = useCallback(
    (visibleIssues: Issue[]) => {
      setSelectedIssues((prev) => {
        const allSelected = visibleIssues.every((i) => prev.has(i.number))
        if (allSelected) {
          const next = new Set(prev)
          visibleIssues.forEach((i) => next.delete(i.number))
          return next
        }
        const next = new Set(prev)
        visibleIssues.forEach((i) => next.add(i.number))
        return next
      })
    },
    [],
  )

  const handleEnqueue = useCallback(async () => {
    if (selectedIssues.size === 0) return
    setEnqueuing(true)
    setEnqueueResult(null)
    setEnqueueError(null)
    try {
      const result = await api.enqueueIssues(
        orgName,
        orgName.trim(),
        repo.trim(),
        Array.from(selectedIssues),
      )
      setEnqueueResult(result)
      setSelectedIssues(new Set())
    } catch (err) {
      setEnqueueError(err instanceof Error ? err.message : 'Failed to enqueue issues')
    } finally {
      setEnqueuing(false)
    }
  }, [orgName, repo, selectedIssues])

  const handleRepoSelect = useCallback((repoName: string) => {
    setRepo(repoName)
    setRepoTouched(true)
    setRepoDropdownOpen(false)
    setRepoSearch('')
  }, [])

  // --- Derived ---

  const filteredIssues = searchFilter.trim()
    ? issues.filter(
        (i) =>
          i.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
          String(i.number).includes(searchFilter),
      )
    : issues

  const filteredRepos = repoSearch.trim()
    ? discoveredRepos.filter((r) => r.name.toLowerCase().includes(repoSearch.toLowerCase()))
    : discoveredRepos

  const allVisibleSelected =
    filteredIssues.length > 0 && filteredIssues.every((i) => selectedIssues.has(i.number))

  const canLoad = repo.trim().length > 0

  // Validation messages
  const repoValidationMessage = (() => {
    if (!repoTouched && !repo.trim()) {
      return 'Select a repository to continue'
    }
    if (repoTouched && !repo.trim()) {
      return 'Repository is required'
    }
    return null
  })()

  const loadButtonLabel = (() => {
    if (milestonesLoading || issuesLoading) {
      return mode === 'milestone' ? 'Loading Milestones...' : 'Loading Issues...'
    }
    if (!canLoad) {
      return mode === 'milestone' ? 'Enter repo to load milestones' : 'Enter repo to load issues'
    }
    return mode === 'milestone' ? 'Load Milestones' : 'Load Issues'
  })()

  // --- Render ---

  return (
    <div className="border rounded-lg p-4 space-y-4" style={{
      borderColor: 'color-mix(in srgb, var(--interactive-primary) 20%, transparent)',
      backgroundColor: 'color-mix(in srgb, var(--surface-base) 60%, transparent)',
      backdropFilter: 'blur(8px)',
    }}>
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-8 h-8 rounded-md" style={{
          backgroundColor: 'color-mix(in srgb, var(--interactive-primary) 10%, transparent)',
          border: '1px solid color-mix(in srgb, var(--interactive-primary) 30%, transparent)',
        }}>
          <GitMerge className="w-4 h-4" style={{ color: 'var(--interactive-primary)' }} />
        </div>
        <div>
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Queue Intake</h3>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Add GitHub issues to the work queue
          </p>
        </div>
      </div>

      {/* Repo selector */}
      <div className="flex gap-2">
        {/* Owner - static label */}
        <div className="flex-1">
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Owner
          </label>
          <div
            className="w-full px-3 py-1.5 text-sm rounded-md"
            data-testid="owner-static"
            style={{
              backgroundColor: 'var(--surface-sunken)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            {orgName}
          </div>
        </div>

        {/* Repository - searchable dropdown with fallback to text input */}
        <div className="flex-1" ref={repoDropdownRef}>
          <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Repository
          </label>
          <div className="relative">
            <input
              type="text"
              value={repoDropdownOpen ? repoSearch : repo}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                if (repoDropdownOpen) {
                  setRepoSearch(e.target.value)
                } else {
                  setRepo(e.target.value)
                  setRepoTouched(true)
                }
              }}
              onFocus={() => {
                if (discoveredRepos.length > 0) {
                  setRepoDropdownOpen(true)
                  setRepoSearch('')
                }
              }}
              placeholder={discoveredRepos.length > 0 ? 'Search repositories...' : 'e.g. your-org/your-repo'}
              className="w-full px-3 py-1.5 text-sm rounded-md focus:outline-none pr-8"
              style={{
                backgroundColor: 'var(--surface-overlay)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
              onBlur={() => {
                // Small delay to allow click on dropdown item
                setTimeout(() => {
                  if (!repoDropdownRef.current?.contains(document.activeElement)) {
                    setRepoDropdownOpen(false)
                  }
                }, 150)
                setRepoTouched(true)
              }}
            />
            {discoveredRepos.length > 0 && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2"
                onClick={() => setRepoDropdownOpen(!repoDropdownOpen)}
                tabIndex={-1}
              >
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${repoDropdownOpen ? 'rotate-180' : ''}`}
                  style={{ color: 'var(--text-muted)' }}
                />
              </button>
            )}
            {reposLoading && (
              <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin" style={{ color: 'var(--text-muted)' }} />
            )}

            {/* Dropdown */}
            {repoDropdownOpen && discoveredRepos.length > 0 && (
              <div
                className="absolute z-50 w-full mt-1 rounded-md shadow-lg max-h-48 overflow-y-auto"
                style={{
                  backgroundColor: 'var(--surface-overlay)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {filteredRepos.length === 0 ? (
                  <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    No matching repos. Type to enter manually.
                  </div>
                ) : (
                  filteredRepos.map((r) => (
                    <button
                      key={r.name}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm flex items-center justify-between transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                      onMouseDown={(e) => {
                        e.preventDefault() // Prevent blur
                        handleRepoSelect(r.name)
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = 'var(--surface-overlay-hover)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent'
                      }}
                    >
                      <span className="truncate">{r.name}</span>
                      {r.configCount > 0 && (
                        <span className="text-xs ml-2 flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                          {r.configCount} config{r.configCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          {repoValidationMessage && (
            <p className="text-xs mt-1" style={{ color: repoTouched && !repo.trim() ? 'var(--status-danger)' : 'var(--text-muted)' }}>
              {repoValidationMessage}
            </p>
          )}
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 p-1 rounded-md w-fit" style={{
        backgroundColor: 'color-mix(in srgb, var(--surface-base) 60%, transparent)',
        border: '1px solid var(--border-subtle)',
      }}>
        {(['milestone', 'issues'] as IntakeMode[]).map((m) => (
          <button
            key={m}
            onClick={() => handleModeChange(m)}
            className="px-3 py-1 text-xs rounded font-medium transition-colors"
            style={mode === m ? {
              backgroundColor: 'color-mix(in srgb, var(--interactive-primary) 20%, transparent)',
              color: 'var(--interactive-primary)',
              border: '1px solid color-mix(in srgb, var(--interactive-primary) 40%, transparent)',
            } : {
              color: 'var(--text-muted)',
              border: '1px solid transparent',
            }}
            onMouseEnter={(e) => {
              if (mode !== m) e.currentTarget.style.color = 'var(--text-secondary)'
            }}
            onMouseLeave={(e) => {
              if (mode !== m) e.currentTarget.style.color = 'var(--text-muted)'
            }}
          >
            {m === 'milestone' ? 'By Milestone' : 'By Issues'}
          </button>
        ))}
      </div>

      {/* Load button */}
      <button
        onClick={handleLoadClick}
        disabled={!canLoad || milestonesLoading || issuesLoading}
        className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: canLoad
            ? 'color-mix(in srgb, var(--interactive-primary) 15%, transparent)'
            : 'color-mix(in srgb, var(--surface-overlay) 50%, transparent)',
          color: canLoad ? 'var(--interactive-primary)' : 'var(--text-muted)',
          border: '1px solid color-mix(in srgb, var(--interactive-primary) 30%, transparent)',
        }}
        title={!canLoad ? repoValidationMessage || 'Select a repository' : ''}
      >
        {(milestonesLoading || issuesLoading) ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Search className="w-3.5 h-3.5" />
        )}
        {loadButtonLabel}
      </button>

      {/* Milestone error */}
      {milestoneError && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--status-danger)' }}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {milestoneError}
        </div>
      )}

      {/* Milestone loading skeleton */}
      {mode === 'milestone' && milestonesLoading && (
        <div className="space-y-1">
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Loading milestones...
          </p>
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-full h-10 rounded-md animate-pulse"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--surface-overlay) 50%, transparent)',
                  border: '1px solid var(--border-subtle)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Milestone list */}
      {mode === 'milestone' && !milestonesLoading && milestones.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Select a milestone ({milestones.length} found)
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {milestones.map((m) => (
              <button
                key={m.number}
                onClick={() => handleMilestoneSelect(m.number)}
                className="w-full text-left flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors"
                style={selectedMilestone === m.number ? {
                  backgroundColor: 'color-mix(in srgb, var(--interactive-primary) 15%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--interactive-primary) 40%, transparent)',
                  color: 'var(--interactive-primary)',
                } : {
                  backgroundColor: 'color-mix(in srgb, var(--surface-base) 30%, transparent)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={(e) => {
                  if (selectedMilestone !== m.number) {
                    e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--interactive-primary) 30%, transparent)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedMilestone !== m.number) {
                    e.currentTarget.style.borderColor = 'var(--border-subtle)'
                  }
                }}
              >
                <span className="font-medium truncate">{m.title}</span>
                <span className="ml-2 flex-shrink-0 flex items-center gap-1 opacity-70">
                  <ChevronDown className="w-3 h-3 rotate-[-90deg]" />
                  {m.open_issues} issues
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No milestones found */}
      {mode === 'milestone' && !milestonesLoading && !milestoneError && milestones.length === 0 && canLoad && (
        <div className="flex items-center gap-2 p-3 rounded-md" style={{
          backgroundColor: 'color-mix(in srgb, var(--surface-overlay) 50%, transparent)',
          border: '1px solid var(--border-subtle)',
        }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No open milestones found in {orgName}/{repo}
          </p>
        </div>
      )}

      {/* Issues loading skeleton */}
      {issuesLoading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading issues...
          </div>
          <div className="space-y-1">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="w-full h-12 rounded-md animate-pulse"
                style={{
                  backgroundColor: 'color-mix(in srgb, var(--surface-overlay) 50%, transparent)',
                  border: '1px solid var(--border-subtle)',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Issues error */}
      {issuesError && (
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--status-danger)' }}>
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {issuesError}
        </div>
      )}

      {/* Issues list */}
      {issues.length > 0 && !issuesLoading && (
        <div className="space-y-2">
          {/* Search + select-all */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
              <input
                type="text"
                value={searchFilter}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSearchFilter(e.target.value)}
                placeholder="Filter issues&hellip;"
                className="w-full pl-8 pr-3 py-1.5 text-xs rounded-md focus:outline-none"
                style={{
                  backgroundColor: 'var(--surface-overlay)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
            <button
              onClick={() => toggleAllIssues(filteredIssues)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md transition-colors"
              style={{
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                backgroundColor: 'color-mix(in srgb, var(--surface-base) 30%, transparent)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--interactive-primary) 40%, transparent)'
                e.currentTarget.style.color = 'var(--text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)'
                e.currentTarget.style.color = 'var(--text-secondary)'
              }}
            >
              {allVisibleSelected ? (
                <CheckSquare className="w-3.5 h-3.5" style={{ color: 'var(--interactive-primary)' }} />
              ) : (
                <Square className="w-3.5 h-3.5" />
              )}
              All
            </button>
          </div>

          <div className="max-h-52 overflow-y-auto space-y-1">
            {filteredIssues.length === 0 ? (
              <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>
                No issues match the filter.
              </p>
            ) : (
              filteredIssues.map((issue) => {
                const isSelected = selectedIssues.has(issue.number)
                return (
                  <button
                    key={issue.number}
                    onClick={() => toggleIssue(issue.number)}
                    className="w-full text-left flex items-start gap-2 px-3 py-2 rounded-md text-xs transition-colors"
                    style={isSelected ? {
                      backgroundColor: 'color-mix(in srgb, var(--interactive-primary) 10%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--interactive-primary) 30%, transparent)',
                    } : {
                      backgroundColor: 'color-mix(in srgb, var(--surface-base) 30%, transparent)',
                      border: '1px solid var(--border-subtle)',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--border-subtle) 200%, transparent)'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.borderColor = 'var(--border-subtle)'
                      }
                    }}
                  >
                    <span className="flex-shrink-0 mt-0.5">
                      {isSelected ? (
                        <CheckSquare className="w-3.5 h-3.5" style={{ color: 'var(--interactive-primary)' }} />
                      ) : (
                        <Square className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span style={{ color: 'var(--text-muted)' }} className="mr-1.5">#{issue.number}</span>
                      <span style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {issue.title}
                      </span>
                      {issue.labels.length > 0 && (
                        <span className="ml-2 inline-flex gap-1 flex-wrap">
                          {issue.labels.slice(0, 3).map((l) => (
                            <span
                              key={l.name}
                              className="px-1.5 py-0.5 rounded text-[10px]"
                              style={{
                                backgroundColor: 'var(--badge-gray-bg)',
                                color: 'var(--badge-gray-text)',
                              }}
                            >
                              {l.name}
                            </span>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Empty state - initial */}
      {!issuesLoading && !milestonesLoading && issues.length === 0 && milestones.length === 0 && !canLoad && (
        <div className="flex items-center gap-2 p-3 rounded-md" style={{
          backgroundColor: 'color-mix(in srgb, var(--surface-overlay) 50%, transparent)',
          border: '1px solid var(--border-subtle)',
        }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <p className="font-medium">Getting started</p>
            <p className="mt-0.5">
              1. Select a repository above
              <br />
              2. Click &quot;Load {mode === 'milestone' ? 'Milestones' : 'Issues'}&quot; to fetch available items
              <br />
              3. Select items to add to the work queue
            </p>
          </div>
        </div>
      )}

      {/* No issues found for milestone */}
      {!issuesLoading && issues.length === 0 && selectedMilestone !== null && (
        <div className="flex items-center gap-2 p-3 rounded-md" style={{
          backgroundColor: 'color-mix(in srgb, var(--surface-overlay) 50%, transparent)',
          border: '1px solid var(--border-subtle)',
        }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            No open issues found in the selected milestone
          </p>
        </div>
      )}

      {/* Enqueue button + result */}
      {issues.length > 0 && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <button
              onClick={handleEnqueue}
              disabled={selectedIssues.size === 0 || enqueuing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start"
              style={{
                backgroundColor: selectedIssues.size > 0 ? 'var(--interactive-primary)' : 'color-mix(in srgb, var(--surface-overlay) 50%, transparent)',
                color: selectedIssues.size > 0 ? 'var(--text-on-accent)' : 'var(--text-muted)',
              }}
              title={selectedIssues.size === 0 ? 'Select at least one issue to add to the queue' : ''}
            >
              {enqueuing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PlusCircle className="w-4 h-4" />
              )}
              {enqueuing
                ? 'Adding to queue...'
                : selectedIssues.size > 0
                  ? `Add ${selectedIssues.size} to Queue`
                  : 'Select issues to add'}
            </button>
            {selectedIssues.size === 0 && issues.length > 0 && (
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Select one or more issues above to add them to the work queue
              </p>
            )}
          </div>

          {/* Enqueue error */}
          {enqueueError && (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--status-danger)' }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {enqueueError}
            </div>
          )}

          {/* Enqueue result summary */}
          {enqueueResult && (
            <div className="flex items-start gap-2 p-3 rounded-md" style={{
              backgroundColor: 'color-mix(in srgb, var(--interactive-primary) 5%, transparent)',
              border: '1px solid color-mix(in srgb, var(--interactive-primary) 20%, transparent)',
            }}>
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--interactive-primary)' }} />
              <div className="text-xs space-y-0.5">
                <p className="font-medium" style={{ color: 'var(--interactive-primary)' }}>Enqueue complete</p>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {enqueueResult.queued} queued
                  {enqueueResult.skipped > 0 ? ` \u00b7 ${enqueueResult.skipped} skipped (duplicate)` : ''}
                  {enqueueResult.failed > 0 ? ` \u00b7 ${enqueueResult.failed} failed` : ''}
                </p>
                {enqueueResult.errors.length > 0 && (
                  <ul className="mt-1 space-y-0.5" style={{ color: 'var(--status-danger)' }}>
                    {enqueueResult.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
