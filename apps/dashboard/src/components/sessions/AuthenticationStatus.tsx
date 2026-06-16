'use client'

/**
 * AuthenticationStatus Component (Issue #1918)
 *
 * Shows authentication status for background agent providers before session creation.
 * Displays which providers are authenticated and which need re-authentication.
 */

import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle, XCircle, Loader2, RefreshCw } from 'lucide-react'
import { api } from '@/lib/api'
import type { AllCredentialsResponse, CredentialStatus } from '@gal/types'

interface AuthenticationStatusProps {
  /** Optional: Only show status for this specific agent */
  agent?: string
  /** Optional: Compact mode (single line) */
  compact?: boolean
}

interface ProviderStatus {
  provider: string
  displayName: string
  status: CredentialStatus
  icon: string
}

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
}

const PROVIDER_ICONS: Record<string, string> = {
  claude: '\uD83E\uDD16',
  codex: '\uD83C\uDF1F',
  gemini: '\uD83D\uDC8E',
}

export function AuthenticationStatus({ agent, compact = false }: AuthenticationStatusProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [providerStatuses, setProviderStatuses] = useState<ProviderStatus[]>([])
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  async function fetchAuthStatus() {
    setLoading(true)
    setError(null)

    try {
      const response: AllCredentialsResponse = await api.getAllCredentialsStatus()

      const statuses: ProviderStatus[] = response.credentials.map((cred) => ({
        provider: cred.provider,
        displayName: PROVIDER_DISPLAY_NAMES[cred.provider] || cred.provider,
        status: cred.status,
        icon: PROVIDER_ICONS[cred.provider] || '\uD83D\uDD11',
      }))

      // Filter to specific agent if provided
      const filtered = agent
        ? statuses.filter((s) => s.provider === agent.toLowerCase())
        : statuses

      setProviderStatuses(filtered)
      setLastChecked(new Date())
    } catch (err) {
      console.error('Failed to fetch auth status:', err)
      setError('Failed to check authentication status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAuthStatus()
  }, [agent]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div
        className="flex items-center gap-2 p-3 rounded-lg text-sm"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          color: 'var(--text-muted)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Checking authentication status...
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="flex items-center gap-2 p-3 rounded-lg text-sm"
        style={{
          backgroundColor: 'var(--status-danger-light)',
          color: 'var(--status-danger)',
          border: '1px solid var(--status-danger)',
        }}
      >
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        {error}
      </div>
    )
  }

  const activeCount = providerStatuses.filter((p) => p.status === 'active').length
  const expiredCount = providerStatuses.filter((p) => p.status === 'expired').length
  const notConfiguredCount = providerStatuses.filter((p) => p.status === 'not_configured').length

  // Determine overall status
  const hasErrors = expiredCount > 0 || notConfiguredCount > 0
  const allActive = activeCount === providerStatuses.length && providerStatuses.length > 0

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {allActive ? (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <CheckCircle className="w-4 h-4" />
            <span>Authenticated</span>
          </div>
        ) : hasErrors ? (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--status-danger)' }}>
            <XCircle className="w-4 h-4" />
            <span>
              {expiredCount > 0
                ? 'Credentials expired'
                : 'Authentication required'}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <AlertCircle className="w-4 h-4" />
            <span>Partial authentication</span>
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className="p-3 rounded-lg text-sm space-y-3"
      style={{
        backgroundColor: hasErrors ? 'var(--status-danger-light)' : 'var(--status-success-light)',
        color: 'var(--text-primary)',
        border: `1px solid ${hasErrors ? 'var(--status-danger)' : 'var(--status-success)'}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {allActive ? (
            <CheckCircle className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          ) : (
            <AlertCircle className="w-4 h-4" style={{ color: hasErrors ? 'var(--status-danger)' : 'var(--status-warning)' }} />
          )}
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            Authentication Status
          </span>
        </div>
        <button
          onClick={fetchAuthStatus}
          className="p-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
          title="Refresh authentication status"
        >
          <RefreshCw className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Provider statuses */}
      <div className="space-y-2">
        {providerStatuses.map((provider) => {
          const StatusIcon =
            provider.status === 'active'
              ? CheckCircle
              : provider.status === 'expired'
              ? AlertCircle
              : XCircle

          const statusColor =
            provider.status === 'active'
              ? 'var(--status-success)'
              : provider.status === 'expired'
              ? 'var(--status-warning)'
              : 'var(--status-danger)'

          const statusLabel =
            provider.status === 'active'
              ? 'Authenticated'
              : provider.status === 'expired'
              ? 'Expired'
              : 'Not Configured'

          return (
            <div key={provider.provider} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">{provider.icon}</span>
                <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  {provider.displayName}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <StatusIcon className="w-3.5 h-3.5" style={{ color: statusColor }} />
                <span className="text-xs" style={{ color: statusColor }}>
                  {statusLabel}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Help message */}
      {hasErrors && (
        <div
          className="text-xs pt-2 border-t"
          style={{
            color: 'var(--text-muted)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {expiredCount > 0 ? (
            <p>
              Your credentials have expired. Run <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>gal auth {providerStatuses.find(p => p.status === 'expired')?.provider}</code> to re-authenticate.
            </p>
          ) : (
            <p>
              Configure credentials in Settings or run{' '}
              <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>gal auth [provider]</code> in your terminal.
            </p>
          )}
        </div>
      )}

      {/* Last checked timestamp */}
      {lastChecked && (
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Last checked: {lastChecked.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

export default AuthenticationStatus
