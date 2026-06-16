'use client'

/**
 * DependencyCredentialsPanel (Issue #5194)
 *
 * Read-only panel showing the status of dependency credentials for background agents.
 * Displays Firebase CLI credential status with setup instructions.
 */

import { useState, useEffect } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'
import type { AllCredentialsResponse, CredentialStatusResponse } from '@gal/types'

export function DependencyCredentialsPanel() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [firebaseStatus, setFirebaseStatus] = useState<CredentialStatusResponse | null>(null)

  useEffect(() => {
    async function fetchCredentials() {
      setLoading(true)
      setError(null)
      try {
        const response: AllCredentialsResponse = await api.getAllCredentialsStatus()
        const firebase = response.credentials.find((c) => c.provider === 'firebase')
        setFirebaseStatus(firebase ?? null)
      } catch (err) {
        console.error('Failed to fetch credential statuses:', err)
        setError('Failed to load credential status')
      } finally {
        setLoading(false)
      }
    }

    fetchCredentials()
  }, [])

  const isConfigured = firebaseStatus?.exists ?? false
  const statusLabel = isConfigured ? firebaseStatus?.status ?? 'active' : null

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Section heading */}
      <div>
        <h2 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
          Dependency Credentials
        </h2>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          External service credentials required by background agents.
        </p>
      </div>

      {/* Firebase CLI card */}
      <div
        className="rounded-lg overflow-hidden"
        data-testid="credential-provider-firebase"
        style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Card header */}
        <div className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
                style={{
                  backgroundColor: isConfigured ? 'var(--status-success-light)' : 'var(--bg-secondary)',
                  border: `1px solid ${isConfigured ? 'var(--status-success)' : 'var(--border-subtle)'}`,
                }}
              >
                🔥
              </div>

              {/* Title + subtitle */}
              <div>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  Firebase CLI
                </p>
                {loading ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Checking status...
                  </p>
                ) : isConfigured ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Token: {firebaseStatus?.tokenPrefix || '***'}
                    {firebaseStatus?.updatedAt &&
                      ` • Updated ${new Date(firebaseStatus.updatedAt).toLocaleDateString()}`}
                  </p>
                ) : (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Not configured
                  </p>
                )}
              </div>
            </div>

            {/* Status badge / spinner */}
            <div className="flex items-center gap-2">
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
              ) : isConfigured ? (
                <>
                  {statusLabel === 'active' && (
                    <span
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        backgroundColor: 'var(--status-success-light)',
                        color: 'var(--status-success-text)',
                      }}
                    >
                      Active
                    </span>
                  )}
                  {statusLabel === 'expired' && (
                    <span
                      className="text-xs px-2 py-1 rounded"
                      style={{
                        backgroundColor: 'var(--status-danger-light)',
                        color: 'var(--status-danger-text)',
                      }}
                    >
                      Expired
                    </span>
                  )}
                </>
              ) : (
                <span
                  className="text-xs px-2 py-1 rounded"
                  style={{
                    backgroundColor: 'var(--surface-sunken)',
                    color: 'var(--text-secondary)',
                  }}
                >
                  Not configured
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Details section */}
        <div
          className="px-4 pb-4 pt-3 space-y-3"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          {/* Error banner */}
          {error && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg"
              style={{
                backgroundColor: 'var(--status-danger-light)',
                border: '1px solid var(--status-danger)',
              }}
            >
              <AlertCircle
                className="w-4 h-4 flex-shrink-0 mt-0.5"
                style={{ color: 'var(--status-danger-text)' }}
              />
              <p className="text-xs" style={{ color: 'var(--status-danger-text)' }}>
                {error}
              </p>
            </div>
          )}

          {/* Scopes (only when configured) */}
          {!loading && isConfigured && (
            <div>
              <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Scopes
              </p>
              <div className="flex flex-wrap gap-1.5">
                {['firebase', 'cloud-platform'].map((scope) => (
                  <span
                    key={scope}
                    className="text-xs px-2 py-0.5 rounded font-mono"
                    style={{
                      backgroundColor: 'var(--surface-sunken)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    {scope}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Setup instructions */}
          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              Run{' '}
              <code
                className="px-1 py-0.5 rounded font-mono"
                style={{ backgroundColor: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
              >
                gal auth firebase
              </code>{' '}
              in your terminal to sync credentials
            </p>
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg font-mono text-xs"
              style={{
                backgroundColor: 'var(--surface-sunken)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>$</span>
              <span>gal auth firebase</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
