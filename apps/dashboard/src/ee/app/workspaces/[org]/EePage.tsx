'use client'

import { Loader2, Copy, Check, FileCode, Terminal, Github, Link2, Sparkles, BookOpen, RefreshCw } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect, useMemo } from 'react'
import { api, type Organization } from '@/lib/api'
import { getCliInstallCommand } from '@/lib/config'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_ORGANIZATION } from '@/lib/demo-data'
import type { Learning } from '@gal/types'
import { buildLearningReviewSummary } from '@/lib/learning-review'

function Organizations() {
  const { org } = useParams<{ org: string }>()
  const router = useRouter()
  const { hasGitHubProvider, user } = useAuth()
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [learnings, setLearnings] = useState<Learning[]>([])
  const [learningsLoading, setLearningsLoading] = useState(false)

  // Get environment-specific CLI install command
  const cliInstallCmd = useMemo(() => getCliInstallCommand(), [])

  useEffect(() => {
    async function fetchOrganization() {
      if (isDemoMode()) {
        setOrganization(DEMO_ORGANIZATION as unknown as Organization)
        setLoading(false)
        return
      }
      // Skip fetching if user doesn't have GitHub connected
      if (!hasGitHubProvider) {
        setLoading(false)
        return
      }

      setLoading(true)
      try {
        const orgs = await api.getOrganizations()
        const found = orgs.find(o => o.name === org)
        if (found) {
          setOrganization(found)
        } else {
          // Org not found, redirect to dashboard
          router.push('/')
        }
      } catch (error) {
        console.error('Failed to fetch organization:', error)
        router.push('/')
      } finally {
        setLoading(false)
      }
    }

    if (org) {
      fetchOrganization()
    }
  }, [org, router, hasGitHubProvider])

  useEffect(() => {
    let cancelled = false

    async function fetchLearnings() {
      if (!organization?.name || !hasGitHubProvider || isDemoMode()) {
        setLearnings([])
        return
      }

      setLearningsLoading(true)
      try {
        const response = await api.getLearnings(organization.name)
        if (!cancelled) {
          setLearnings(response.learnings)
        }
      } catch (error) {
        console.error('Failed to fetch learnings:', error)
        if (!cancelled) {
          setLearnings([])
        }
      } finally {
        if (!cancelled) {
          setLearningsLoading(false)
        }
      }
    }

    fetchLearnings()

    return () => {
      cancelled = true
    }
  }, [organization?.name, hasGitHubProvider])

  const copyCommand = () => {
    navigator.clipboard.writeText('gal sync --pull')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const learningSummary = useMemo(() => buildLearningReviewSummary(learnings), [learnings])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    )
  }

  // Show "Connect GitHub" prompt for users without GitHub provider
  if (!hasGitHubProvider) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full text-center">
          {/* Connect Icon */}
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6 bg-[var(--surface-sunken)]"
          >
            <Link2 className="w-8 h-8 text-[var(--accent-neon)]" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold tracking-tight mb-3" style={{ color: 'var(--text-primary)' }}>
            Connect GitHub to Continue
          </h1>

          {/* Description */}
          <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
            Workspace features require GitHub access. Connect your GitHub account to view and manage
            your workspace&apos;s AI coding agent configurations.
          </p>

          {/* Benefits List */}
          <div
            className="p-4 rounded-lg mb-6 text-left border border-[var(--accent-neon)]/10"
            style={{
              backgroundColor: 'var(--bg-card)',
            }}
          >
            <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-primary)' }}>
              With GitHub connected, you can:
            </p>
            <ul className="text-xs space-y-2" style={{ color: 'var(--text-secondary)' }}>
              <li className="flex items-center gap-2">
                <Github className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                View and manage your GitHub workspaces
              </li>
              <li className="flex items-center gap-2">
                <FileCode className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                Access approved AI agent configurations
              </li>
              <li className="flex items-center gap-2">
                <Terminal className="w-3 h-3" style={{ color: 'var(--accent)' }} />
                Use the GAL CLI to sync configurations
              </li>
            </ul>
          </div>

          {/* Alternative: Link to Settings */}
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            Manage your connected accounts in{' '}
            <Link
              href="/settings?tab=accounts"
              className="underline hover:no-underline"
              style={{ color: 'var(--accent)' }}
            >
              Settings
            </Link>
          </p>

          {/* Current Account Info */}
          {user && (
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Signed in as {user.email || user.login}
            </p>
          )}
        </div>
      </div>
    )
  }

  if (!organization) {
    return null // Will redirect
  }

  return (
    <div className="h-full flex flex-col p-8 lg:p-12">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight mb-2" style={{ color: 'var(--text-primary)' }}>
          {organization.name}
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Workspace Dashboard
        </p>
      </div>

      {/* Sync Instructions Section */}
      <div className="max-w-6xl">
        <div
          className="p-6 rounded-xl mb-6 shadow-sm hover:shadow-md transition-all duration-200 border-l-4 border-l-[var(--accent-neon)]/30 hover:border-l-[var(--accent-neon)]"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderTop: '1px solid var(--border-subtle)',
            borderRight: '1px solid var(--border-subtle)',
            borderBottom: '1px solid var(--border-subtle)'
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--surface-sunken)]">
              <FileCode className="w-5 h-5 text-[var(--accent-neon)]" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              Sync Approved Config
            </h2>
          </div>

          <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
            Use the GAL CLI to pull the workspace&apos;s approved AI coding tool configuration to your local machine.
          </p>

          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
                Pull Config Command
              </p>
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-lg font-mono text-sm cursor-pointer transition-all hover:opacity-80"
                style={{
                  backgroundColor: 'var(--bg-code)',
                  border: '1px solid var(--border-subtle)'
                }}
                onClick={copyCommand}
              >
                <Terminal className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                <span style={{ color: 'var(--text-code)' }}>gal sync --pull</span>
                {copied ? (
                  <Check className="w-4 h-4 ml-auto" style={{ color: 'var(--accent)' }} />
                ) : (
                  <Copy className="w-4 h-4 ml-auto" style={{ color: 'var(--text-muted)' }} />
                )}
              </div>
            </div>

            <div
              className="p-4 rounded-lg"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)'
              }}
            >
              <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                What this does:
              </p>
              <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
                <li>&#8226; Downloads the approved CLAUDE.md configuration</li>
                <li>&#8226; Syncs approved commands to your local .claude/commands/</li>
                <li>&#8226; Updates settings, hooks, and subagents as approved by your CISO</li>
                <li>&#8226; Ensures compliance with workspace standards</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Captured Learnings */}
        <div
          className="p-6 rounded-xl mb-6 shadow-sm border-l-4 border-l-[var(--accent)]/30"
          style={{
            backgroundColor: 'var(--bg-card)',
            borderTop: '1px solid var(--border-subtle)',
            borderRight: '1px solid var(--border-subtle)',
            borderBottom: '1px solid var(--border-subtle)'
          }}
        >
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--surface-sunken)]">
                <Sparkles className="w-5 h-5 text-[var(--accent)]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                  Captured Learnings
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Review repo-scoped learnings captured from background agent sessions before they are injected into future runs.
                </p>
              </div>
            </div>
            <div className="text-right text-xs" style={{ color: 'var(--text-muted)' }}>
              <div>{learningSummary.uniqueRepos} repo{learningSummary.uniqueRepos === 1 ? '' : 's'}</div>
              <div>{learnings.length} total</div>
            </div>
          </div>

          {learningsLoading ? (
            <div className="flex items-center gap-2 text-sm py-6" style={{ color: 'var(--text-muted)' }}>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Loading learnings...
            </div>
          ) : learnings.length === 0 ? (
            <div
              className="rounded-lg p-4"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                No learnings captured yet
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                When background agents finish a session, extracted learnings will appear here grouped by repository and ready for review.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--badge-green-bg)', color: 'var(--badge-green-text)' }}>
                  Approved {learningSummary.counts.approved}
                </span>
                <span className="px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--badge-yellow-bg)', color: 'var(--badge-yellow-text)' }}>
                  Pending {learningSummary.counts.pending}
                </span>
                <span className="px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--badge-red-bg)', color: 'var(--badge-red-text)' }}>
                  Rejected {learningSummary.counts.rejected}
                </span>
              </div>

              <div
                className="rounded-lg p-4"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--text-primary)' }}>
                  Full review surface
                </p>
                <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  Showing all {learningSummary.totalLearnings} captured learning{learningSummary.totalLearnings === 1 ? '' : 's'} across {learningSummary.uniqueRepos} repo{learningSummary.uniqueRepos === 1 ? '' : 's'}.
                </p>
              </div>

              <div className="grid gap-4">
                {learningSummary.groups.map((group) => (
                  <details
                    key={group.repo}
                    open
                    className="rounded-lg p-4"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--accent)' }} />
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                          {group.repo}
                        </span>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                        {group.items.length} learning{group.items.length === 1 ? '' : 's'}
                      </span>
                    </summary>

                    <div className="mt-4 space-y-3">
                      {group.items.map((learning) => {
                        const stamp = new Date(learning.updatedAt ?? learning.createdAt)
                        const statusStyles =
                          learning.status === 'approved'
                            ? { backgroundColor: 'var(--badge-green-bg)', color: 'var(--badge-green-text)' }
                            : learning.status === 'rejected'
                              ? { backgroundColor: 'var(--badge-red-bg)', color: 'var(--badge-red-text)' }
                              : { backgroundColor: 'var(--badge-yellow-bg)', color: 'var(--badge-yellow-text)' }

                        return (
                          <article
                            key={learning.id}
                            className="rounded-md p-4"
                            style={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                                  {learning.title}
                                </p>
                                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                                  {learning.category} · {stamp.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                  {learning.sourceFile ? ` · ${learning.sourceFile}` : ''}
                                </p>
                              </div>
                              <span className="flex-shrink-0 text-xs px-2 py-1 rounded-full" style={statusStyles}>
                                {learning.status}
                              </span>
                            </div>

                            <div className="mt-3 grid gap-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
                              <div className="flex flex-wrap gap-x-4 gap-y-1">
                                <span>Session: {learning.sessionId}</span>
                                <span>Provider: {learning.provider}</span>
                                <span>Updated: {(learning.updatedAt ?? learning.createdAt) ? stamp.toLocaleString() : 'unknown'}</span>
                              </div>
                              <pre
                                className="whitespace-pre-wrap rounded-md p-3 text-xs"
                                style={{
                                  backgroundColor: 'var(--bg-secondary)',
                                  color: 'var(--text-primary)',
                                  border: '1px solid var(--border-subtle)',
                                }}
                              >
                                {learning.content}
                              </pre>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Additional Sync Info */}
        <div
          className="p-4 rounded-xl border border-[var(--accent-neon)]/10"
          style={{
            backgroundColor: 'var(--bg-secondary)',
          }}
        >
          <p className="text-xs font-medium mb-2 uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
            Installation
          </p>
          <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
            If you haven&apos;t installed the GAL CLI yet, run:
          </p>
          <code
            className="block px-3 py-2 rounded font-mono text-xs"
            style={{
              backgroundColor: 'var(--bg-code)',
              color: 'var(--text-code)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            {cliInstallCmd}
          </code>
        </div>
      </div>
    </div>
  )
}

export default Organizations
