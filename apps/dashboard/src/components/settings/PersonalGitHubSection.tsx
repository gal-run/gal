'use client'

/**
 * PersonalGitHubSection - Personal GitHub OAuth Connection
 *
 * Issue #64: Workspace Separation
 * US3: User Connects Personal GitHub
 *
 * This section is visible to ALL users and allows:
 * - Connecting personal GitHub account via OAuth
 * - Viewing connected status
 * - Disconnecting personal GitHub
 */

import { Github, Loader2, Link2, Unlink } from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import type { PersonalGitHubStatus } from '@gal/types'

export function PersonalGitHubSection() {
  const [status, setStatus] = useState<PersonalGitHubStatus>({ connected: false })
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await api.getPersonalGitHubStatus()
      setStatus(result)
    } catch (err) {
      console.error('Failed to fetch personal GitHub status:', err)
      setError('Failed to load status')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  const handleConnect = () => {
    // Redirect to personal GitHub OAuth endpoint
    const redirectUrl = encodeURIComponent(
      `${window.location.origin}/settings?tab=github`
    )
    window.location.href = `${api.baseUrl}/auth/github/personal?redirect=${redirectUrl}`
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    setError(null)
    try {
      const result = await api.disconnectPersonalGitHub()
      if (result.success) {
        setStatus({ connected: false })
      } else {
        setError(result.error || 'Failed to disconnect')
      }
    } catch (err) {
      console.error('Failed to disconnect personal GitHub:', err)
      setError('Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  return (
    <div className="dashboard-card p-6" data-testid="personal-github-section">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Personal GitHub
          </h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Connect your personal GitHub to access your private repositories
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div
          className="mb-4 p-3 rounded-lg text-sm"
          style={{ backgroundColor: 'var(--status-danger-light)', color: 'var(--status-danger-text)', border: '1px solid var(--status-danger)' }}
        >
          {error}
        </div>
      )}

      {/* Connection Status */}
      <div
        className="p-4 rounded-lg"
        style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{
                backgroundColor: status.connected ? 'var(--status-success-light)' : 'var(--bg-tertiary)',
                border: `1px solid ${status.connected ? 'var(--status-success)' : 'var(--border-subtle)'}`
              }}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
              ) : (
                <Github className="w-5 h-5" style={{ color: status.connected ? 'var(--status-success)' : 'var(--text-muted)' }} />
              )}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {loading ? 'Checking...' : status.connected ? 'Connected' : 'Not Connected'}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {loading
                  ? 'Loading status...'
                  : status.connected
                  ? (
                    <>
                      Connected as <span className="font-medium" style={{ color: 'var(--text-primary)' }}>@{status.username}</span>
                    </>
                  )
                  : 'Connect to access your personal repositories'
                }
              </p>
            </div>
          </div>

          {!loading && (
            status.connected ? (
              <button
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="flex items-center gap-2 text-sm px-4 py-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: 'var(--status-danger-light)',
                  color: 'var(--status-danger-text)',
                  border: '1px solid var(--status-danger)'
                }}
              >
                {disconnecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Unlink className="w-4 h-4" />
                )}
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            ) : (
              <button
                onClick={handleConnect}
                className="btn-primary text-sm flex items-center gap-2"
              >
                <Link2 className="w-4 h-4" />
                Connect Personal GitHub
              </button>
            )
          )}
        </div>

        {/* Connected Details */}
        {status.connected && status.connectedAt && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span style={{ color: 'var(--text-muted)' }}>Connected</span>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {new Date(status.connectedAt).toLocaleDateString()}
                </p>
              </div>
              {status.scope && (
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Permissions</span>
                  <p style={{ color: 'var(--text-secondary)' }}>
                    {status.scope.includes('repo') ? 'Full access' : 'Limited access'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info Note */}
      <p className="text-xs mt-4" style={{ color: 'var(--text-muted)' }}>
        Your personal GitHub connection is separate from your organization's GitHub App installation.
        This allows you to sync configurations to your personal repositories.
      </p>
    </div>
  )
}
