'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Clock,
  Cookie,
  Globe,
  Loader2,
  Plus,
  Shield,
  Trash2,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { formatBrowserProfileExpiry, isBrowserProfileExpired } from '@/lib/browser-profile-expiry'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { useIsInternalWorkspace } from '@/hooks/useWorkspaceAudienceTier'

import type { BrowserProfile } from '@/lib/api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateString: number | string | null | undefined): string {
  return formatBrowserProfileExpiry(dateString)
}

function isExpired(expiresAt: number | string | null | undefined): boolean {
  return isBrowserProfileExpired(expiresAt)
}

// ---------------------------------------------------------------------------
// Summary Card (matches agents/page.tsx pattern)
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string
  value: string
  hint: string
  icon: typeof Globe
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-subtle)',
      }}
    >
      <div className="flex items-center gap-2 mb-3" style={{ color: 'var(--text-secondary)' }}>
        <Icon className="w-4 h-4" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
        {value}
      </div>
      <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
        {hint}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Upload Modal
// ---------------------------------------------------------------------------

function UploadModal({
  open,
  onClose,
  onSubmit,
  submitting,
}: {
  open: boolean
  onClose: () => void
  onSubmit: (data: { name: string; domains: string[]; storageState: string }) => void
  submitting: boolean
}) {
  const [name, setName] = useState('')
  const [domains, setDomains] = useState('')
  const [storageState, setStorageState] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)

  if (!open) return null

  const handleSubmit = () => {
    setParseError(null)

    if (!name.trim()) {
      setParseError('Profile name is required.')
      return
    }

    if (!storageState.trim()) {
      setParseError('Storage state JSON is required.')
      return
    }

    try {
      JSON.parse(storageState)
    } catch {
      setParseError('Invalid JSON. Please paste valid storageState JSON.')
      return
    }

    const domainList = domains
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean)

    onSubmit({ name: name.trim(), domains: domainList, storageState })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div
        className="rounded-2xl p-6 w-full max-w-lg"
        style={{
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Upload Browser Profile
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Profile Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. GitHub Production"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Domains (comma-separated)
            </label>
            <input
              type="text"
              value={domains}
              onChange={(e) => setDomains(e.target.value)}
              placeholder="e.g. github.com, api.github.com"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
              Storage State JSON
            </label>
            <textarea
              value={storageState}
              onChange={(e) => setStorageState(e.target.value)}
              placeholder='Paste your storageState JSON from the Chrome extension...'
              rows={8}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none font-mono"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                resize: 'vertical',
              }}
            />
          </div>

          {parseError && (
            <p className="text-sm" style={{ color: 'var(--status-danger)' }}>
              {parseError}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              style={{
                color: 'var(--text-primary)',
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-60"
              style={{
                color: 'var(--text-on-accent)',
                backgroundColor: 'var(--interactive-primary)',
              }}
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Upload Profile
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function BrowserProfilesPage() {
  const { user } = useAuth()
  const { isPageVisibleForUser } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const userOrgs = user?.organizations ?? []
  const isInternalWorkspace = useIsInternalWorkspace()
  const isVisible = isInternalWorkspace && isPageVisibleForUser('browser-profiles', userOrgs, selectedWorkspace)

  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const loadProfiles = useCallback(async () => {
    if (!isVisible) return
    setLoading(true)
    setError(null)

    try {
      const data = await api.getBrowserProfiles()
      setProfiles(data.profiles || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load browser profiles')
      setProfiles([])
    } finally {
      setLoading(false)
    }
  }, [isVisible])

  useEffect(() => {
    if (!isVisible) return
    void loadProfiles()
  }, [isVisible, loadProfiles])

  const handleUpload = useCallback(
    async (data: { name: string; domains: string[]; storageState: string }) => {
      setSubmitting(true)
      try {
        await api.createBrowserProfile(data)
        setShowUpload(false)
        void loadProfiles()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to upload profile')
      } finally {
        setSubmitting(false)
      }
    },
    [loadProfiles],
  )

  const handleDelete = useCallback(
    async (profileId: string) => {
      setDeletingId(profileId)
      try {
        await api.deleteBrowserProfile(profileId)
        void loadProfiles()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete profile')
      } finally {
        setDeletingId(null)
      }
    },
    [loadProfiles],
  )

  const summary = useMemo(() => {
    const total = profiles.length
    const expired = profiles.filter((p) => isExpired(p.earliestExpiry)).length
    const active = total - expired

    return { total, active, expired }
  }, [profiles])

  if (!isVisible) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
        <Shield className="w-12 h-12 mb-4" style={{ color: 'var(--text-muted)' }} />
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Internal Feature
        </h2>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-muted)' }}>
          Browser profiles are only available to internal users.
        </p>
      </div>
    )
  }

  // ---------- Loading skeleton ----------
  if (loading) {
    return (
      <div className="h-full overflow-auto p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 rounded w-48 bg-[var(--bg-tertiary)]" />
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-32 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]" />
              ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-52 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* ---------- Header ---------- */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
              }}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Browser authentication profiles</span>
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Browser Profiles
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
                Manage authenticated browser sessions for background agents. Profiles store cookies and
                storage state captured via the Chrome extension, enabling agents to access protected resources.
                Active profiles are user-scoped and merged into the Playwright browser state for your sessions.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{
                color: 'var(--text-on-accent)',
                backgroundColor: 'var(--interactive-primary)',
              }}
            >
              <Plus className="w-4 h-4" />
              Upload Profile
            </button>
          </div>
        </div>

        {/* ---------- Summary cards ---------- */}
        <div className="grid gap-4 md:grid-cols-3">
          <SummaryCard
            label="Total Profiles"
            value={String(summary.total)}
            hint="Browser profiles available for agent sessions."
            icon={Globe}
          />
          <SummaryCard
            label="Active"
            value={String(summary.active)}
            hint="Profiles with valid, non-expired cookies."
            icon={Shield}
          />
          <SummaryCard
            label="Expired"
            value={String(summary.expired)}
            hint="Profiles with expired cookies that need refreshing."
            icon={Clock}
          />
        </div>

        {/* ---------- Error ---------- */}
        {error && (
          <div
            className="rounded-2xl p-4"
            style={{
              backgroundColor: 'var(--status-danger-light)',
              border: '1px solid var(--status-danger)',
              color: 'var(--status-danger-text)',
            }}
          >
            <p className="text-sm font-medium">Unable to load browser profiles</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {/* ---------- Empty state ---------- */}
        {profiles.length === 0 && !error && (
          <div
            className="rounded-2xl p-6"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              No browser profiles yet
            </h2>
            <p className="mt-2 text-sm max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              Browser profiles allow background agents to access authenticated web resources.
              Use the GAL Chrome extension to capture cookies and storage state from authenticated
              sessions, then upload them here. You can also paste storageState JSON directly using
              the &quot;Upload Profile&quot; button above. If you keep more than one active profile,
              GAL merges them into one Playwright storage state for your sessions.
            </p>
          </div>
        )}

        {/* ---------- Profile cards ---------- */}
        {profiles.length > 0 && (
          <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {profiles.map((profile) => {
              const expired = isExpired(profile.earliestExpiry)
              const deleting = deletingId === profile.id

              return (
                <article
                  key={profile.id}
                  className="rounded-2xl p-5 transition-colors"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {/* Top row: name + status */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      >
                        <Globe className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                            {profile.name}
                          </h2>
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: expired
                                ? 'var(--status-warning-light)'
                                : 'var(--status-success-light)',
                              color: expired
                                ? 'var(--status-warning)'
                                : 'var(--status-success)',
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{
                                backgroundColor: expired
                                  ? 'var(--status-warning)'
                                  : 'var(--status-success)',
                              }}
                            />
                            {expired ? 'Expired' : 'Active'}
                          </span>
                        </div>

                        {/* Domains as badges */}
                        {profile.domains && profile.domains.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {profile.domains.map((domain) => (
                              <span
                                key={domain}
                                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs"
                                style={{
                                  backgroundColor: 'var(--bg-tertiary)',
                                  color: 'var(--text-secondary)',
                                  border: '1px solid var(--border-subtle)',
                                }}
                              >
                                {domain}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={() => void handleDelete(profile.id)}
                      disabled={deleting}
                      className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)] shrink-0 disabled:opacity-60"
                      style={{ color: 'var(--text-muted)' }}
                      title="Delete profile"
                    >
                      {deleting ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Stats row */}
                  <div className="grid grid-cols-2 gap-3 mt-5">
                    <div
                      className="rounded-xl p-3"
                      style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        Cookies
                      </p>
                      <p className="text-2xl font-semibold mt-2" style={{ color: 'var(--text-primary)' }}>
                        {profile.cookieCount ?? 0}
                      </p>
                    </div>

                    <div
                      className="rounded-xl p-3"
                      style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>
                        Earliest Expiry
                      </p>
                      <p className="text-sm font-medium mt-3" style={{ color: 'var(--text-primary)' }}>
                        {formatDate(profile.earliestExpiry)}
                      </p>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <div className="text-xs flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                      <Cookie className="w-3.5 h-3.5" />
                      <span>
                        {profile.domains?.length
                          ? `${profile.domains.length} domain${profile.domains.length === 1 ? '' : 's'}`
                          : 'No domains'}
                      </span>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {expired ? 'Cookies have expired — re-capture via extension' : 'Ready for agent sessions'}
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {/* ---------- Upload Modal ---------- */}
      <UploadModal
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSubmit={handleUpload}
        submitting={submitting}
      />
    </div>
  )
}
