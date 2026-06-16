'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Terminal,
  Check,
  AlertCircle,
  RefreshCw,
  Loader2,
  Key,
  Shield,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
} from 'lucide-react'
import { api } from '@/lib/api'
import type { CredentialValidationResult, DispatchReadinessResult } from '@/lib/api'
import type { CredentialProvider, CredentialStatusResponse, AllCredentialsResponse, ConsentProvider } from '@gal/types'
import { CREDENTIAL_PROVIDER_CONFIGS, CONSENT_PROVIDERS } from '@gal/types'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { CredentialConsentModal } from './CredentialConsentModal'

// ============================================================================
// Constants
// ============================================================================

type AuthMethod = 'oauth' | 'api_key'

type ApiKeyHintProvider = Exclude<CredentialProvider, 'cursor'>

const API_KEY_HINTS: Partial<Record<ApiKeyHintProvider, { url: string; label: string }>> = {
  claude: { url: 'https://console.anthropic.com', label: 'Get from console.anthropic.com -> API Keys' },
  codex: { url: 'https://platform.openai.com', label: 'Get from platform.openai.com -> API Keys' },
  gemini: { url: 'https://aistudio.google.com', label: 'Get from aistudio.google.com -> API Keys' },
}

const STATUS_BADGE_STYLES = {
  notConfigured: {
    backgroundColor: 'var(--badge-gray-bg)',
    color: 'var(--badge-gray-text)',
    dotColor: 'var(--text-tertiary)',
  },
  expired: {
    backgroundColor: 'var(--status-danger-light)',
    color: 'var(--status-danger-text)',
    dotColor: 'var(--status-danger)',
  },
  warning: {
    backgroundColor: 'var(--status-warning-light)',
    color: 'var(--status-warning-text)',
    dotColor: 'var(--status-warning)',
  },
  connected: {
    backgroundColor: 'var(--status-success-light)',
    color: 'var(--status-success-text)',
    dotColor: 'var(--status-success)',
  },
} as const

/** 5-hour limit in seconds */
const CLAUDE_LIMIT_SECONDS = 18_000
/** 70% threshold — auto-switch triggered */
const CLAUDE_WARNING_THRESHOLD_PCT = 70
/** 90% threshold — danger zone */
const CLAUDE_DANGER_THRESHOLD_PCT = 90

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status, tokenPrefix }: { status: CredentialStatusResponse | null; tokenPrefix?: string }) {
  if (!status?.exists) {
    const tone = STATUS_BADGE_STYLES.notConfigured
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
        style={{ backgroundColor: tone.backgroundColor, color: tone.color }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tone.dotColor }} />
        Not Configured
      </span>
    )
  }

  if (status.status === 'expired') {
    const tone = STATUS_BADGE_STYLES.expired
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
        style={{ backgroundColor: tone.backgroundColor, color: tone.color }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tone.dotColor }} />
        Expired
      </span>
    )
  }

  // Check for expiring soon (within 24h) based on updatedAt heuristic
  // If the token was updated more than 23 hours ago and provider uses OAuth, show warning
  if (status.updatedAt) {
    const updatedAt = new Date(status.updatedAt).getTime()
    const hoursSinceUpdate = (Date.now() - updatedAt) / (1000 * 60 * 60)
    if (hoursSinceUpdate > 23 && hoursSinceUpdate < 48) {
      const tone = STATUS_BADGE_STYLES.warning
      return (
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ backgroundColor: tone.backgroundColor, color: tone.color }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tone.dotColor }} />
          Expiring Soon
          {tokenPrefix && <span className="ml-1" style={{ color: tone.dotColor }}>{tokenPrefix}</span>}
        </span>
      )
    }
  }

  const tone = STATUS_BADGE_STYLES.connected
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ backgroundColor: tone.backgroundColor, color: tone.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tone.dotColor }} />
      Connected
      {tokenPrefix && <span className="ml-1" style={{ color: tone.dotColor }}>{tokenPrefix}</span>}
    </span>
  )
}

// ============================================================================
// Provider Card Component
// ============================================================================

function ProviderCard({
  providerId,
  config,
  status,
  onCredentialsChanged,
}: {
  providerId: CredentialProvider
  config: (typeof CREDENTIAL_PROVIDER_CONFIGS)[number]
  status: CredentialStatusResponse | null
  onCredentialsChanged: () => void
}) {
  const [authMethod, setAuthMethod] = useState<AuthMethod>('oauth')
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validationResult, setValidationResult] = useState<CredentialValidationResult | null>(null)
  // Consent modal (#189) — gates API-key save for consent-required providers
  const [showConsentModal, setShowConsentModal] = useState(false)

  const isConnected = status?.exists ?? false
  const apiKeyHint = providerId === 'cursor' ? undefined : API_KEY_HINTS[providerId]
  const supportsApiKey = Boolean(apiKeyHint)
  const requiresConsent = (CONSENT_PROVIDERS as CredentialProvider[]).includes(providerId)

  const handleValidate = useCallback(async () => {
    setValidating(true)
    setValidationResult(null)
    try {
      const result = await api.validateCredential(providerId)
      setValidationResult(result)
    } catch {
      setValidationResult({ valid: false, status: 'error', error: 'Validation request failed' })
    } finally {
      setValidating(false)
    }
  }, [providerId])

  // Actual credential store — called AFTER consent has been recorded (#189)
  const performSaveApiKey = useCallback(async () => {
    if (!apiKeyInput.trim()) return
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const result = await api.saveApiKey(providerId, apiKeyInput.trim())
      if (result.success) {
        setSaveSuccess(true)
        setApiKeyInput('')
        onCredentialsChanged()
        // Clear success message after 3s
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        setSaveError(result.error || 'Failed to save API key')
      }
    } catch {
      setSaveError('Network error saving API key')
    } finally {
      setSaving(false)
    }
  }, [providerId, apiKeyInput, onCredentialsChanged])

  const handleSaveApiKey = useCallback(() => {
    if (!apiKeyInput.trim()) return
    // For consent-required providers (claude/codex/gemini) gate the store
    // behind an explicit affirmative-consent modal. The modal records the
    // consent event server-side; on success it calls back here to proceed.
    if (requiresConsent) {
      setSaveError(null)
      setShowConsentModal(true)
      return
    }
    void performSaveApiKey()
  }, [apiKeyInput, requiresConsent, performSaveApiKey])

  const handleConsentGranted = useCallback(() => {
    setShowConsentModal(false)
    void performSaveApiKey()
  }, [performSaveApiKey])

  const handleConsentCancelled = useCallback(() => {
    setShowConsentModal(false)
  }, [])

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] overflow-hidden">
      {/* Provider Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg ${
              isConnected
                ? ''
                : 'bg-[var(--surface-base)] border border-[var(--border-default)]'
            }`}
            style={
              isConnected
                ? {
                    backgroundColor: 'var(--status-success-light)',
                    border: '1px solid var(--status-success)',
                  }
                : undefined
            }
          >
            {config.icon}
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">{config.displayName}</p>
            <p className="text-xs text-[var(--text-muted)]">
              {isConnected && status?.updatedAt
                ? `Updated ${new Date(status.updatedAt).toLocaleDateString()}`
                : config.tokenHint}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} tokenPrefix={status?.tokenPrefix} />
          {isConnected && (
            <button
              onClick={handleValidate}
              disabled={validating}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-md hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
            >
              {validating ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Shield className="w-3 h-3" />
              )}
              Validate
            </button>
          )}
        </div>
      </div>

      {/* Validation Result */}
      {validationResult && (
        <div
          className="mx-4 mb-3 p-3 rounded-md text-xs flex items-start gap-2"
          style={{
            backgroundColor: validationResult.valid ? 'var(--status-success-light)' : 'var(--status-danger-light)',
            border: `1px solid ${validationResult.valid ? 'var(--status-success)' : 'var(--status-danger)'}`,
          }}
        >
          {validationResult.valid ? (
            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-success-text)' }} />
          ) : (
            <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-danger-text)' }} />
          )}
          <div>
            <p style={{ color: validationResult.valid ? 'var(--status-success-text)' : 'var(--status-danger-text)' }}>
              {validationResult.valid ? 'Credential is valid and active' : (validationResult.error || 'Credential is invalid')}
            </p>
            {validationResult.suggestion && (
              <p className="text-[var(--text-muted)] mt-1">{validationResult.suggestion}</p>
            )}
            {validationResult.expiresAt && (
              <p className="text-[var(--text-muted)] mt-1 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Expires: {new Date(validationResult.expiresAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Auth Method Toggle */}
      <div className="px-4 pb-4">
        {supportsApiKey && (
          <div className="flex gap-1 p-0.5 rounded-md bg-[var(--surface-base)] border border-[var(--border-subtle)] mb-3">
            <button
              onClick={() => setAuthMethod('oauth')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                authMethod === 'oauth'
                  ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Terminal className="w-3 h-3" />
              OAuth (recommended)
            </button>
            <button
              onClick={() => setAuthMethod('api_key')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors ${
                authMethod === 'api_key'
                  ? 'bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Key className="w-3 h-3" />
              API Key
            </button>
          </div>
        )}

        {/* OAuth Instructions */}
        {authMethod === 'oauth' && (
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-muted)]">
              Connect via CLI for automatic OAuth token management:
            </p>
            <div
              className="p-3 rounded-md flex items-center gap-2 font-mono text-xs"
              style={{ backgroundColor: 'var(--status-success-light)', border: '1px solid var(--status-success)' }}
            >
              <Terminal className="w-3.5 h-3.5 text-[var(--text-secondary)] flex-shrink-0" />
              <code className="text-[var(--text-primary)]">gal auth {providerId}</code>
            </div>
            <p className="text-xs text-[var(--text-muted)]">
              The CLI will open your browser, complete the OAuth flow, and sync credentials automatically.
            </p>
          </div>
        )}

        {/* API Key Input */}
        {authMethod === 'api_key' && apiKeyHint && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <ExternalLink className="w-3 h-3" />
              <a
                href={apiKeyHint.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--text-secondary)] underline underline-offset-2"
              >
                {apiKeyHint.label}
              </a>
            </div>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => {
                  setApiKeyInput(e.target.value)
                  setSaveError(null)
                  setSaveSuccess(false)
                }}
                placeholder={`Paste ${config.displayName} API key...`}
                className="flex-1 px-3 py-2 text-sm font-mono rounded-md bg-[var(--surface-base)] border border-[var(--border-default)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--border-interactive)]"
              />
              <button
                onClick={handleSaveApiKey}
                disabled={saving || !apiKeyInput.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-[var(--text-on-accent)] bg-[var(--interactive-primary)] rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                Save
              </button>
            </div>
            {saveError && (
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--status-danger-text)' }}>
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--status-success-text)' }}>
                <CheckCircle2 className="w-3 h-3 flex-shrink-0" />
                API key saved successfully
              </div>
            )}
          </div>
        )}
      </div>

      {/* Consent modal (#189) — gates API-key save for consent-required providers */}
      {showConsentModal && requiresConsent && (
        <CredentialConsentModal
          provider={providerId as ConsentProvider}
          providerDisplayName={config.displayName}
          onConsent={handleConsentGranted}
          onCancel={handleConsentCancelled}
        />
      )}
    </div>
  )
}

// ============================================================================
// Readiness Check Component
// ============================================================================

function ReadinessCheck() {
  const [checking, setChecking] = useState(false)
  const [results, setResults] = useState<DispatchReadinessResult[] | null>(null)

  const handleCheckReadiness = useCallback(async () => {
    setChecking(true)
    setResults(null)
    try {
      const providers: CredentialProvider[] = ['claude', 'codex', 'gemini', 'cursor']
      const readinessResults = await Promise.all(
        providers.map((p) => api.checkDispatchReadiness(p))
      )
      setResults(readinessResults)
    } catch {
      // Fallback: show all as failed
      setResults([
        { provider: 'claude', ready: false, credentialStatus: 'not_configured', validationResult: { valid: false, status: 'error', error: 'Check failed' } },
        { provider: 'codex', ready: false, credentialStatus: 'not_configured', validationResult: { valid: false, status: 'error', error: 'Check failed' } },
        { provider: 'gemini', ready: false, credentialStatus: 'not_configured', validationResult: { valid: false, status: 'error', error: 'Check failed' } },
        { provider: 'cursor', ready: false, credentialStatus: 'not_configured', validationResult: { valid: false, status: 'error', error: 'Check failed' } },
      ])
    } finally {
      setChecking(false)
    }
  }, [])

  const allReady = results?.every((r) => r.ready) ?? false
  const someReady = results?.some((r) => r.ready) ?? false

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm hover:shadow-md transition-shadow duration-200">
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Pre-Dispatch Readiness</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Validate all provider credentials before creating a background session
          </p>
        </div>
        <button
          onClick={handleCheckReadiness}
          disabled={checking}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-on-accent)] bg-[var(--interactive-primary)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {checking ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Shield className="w-3.5 h-3.5" />
          )}
          Check Readiness
        </button>
      </div>

      {results && (
        <div className="p-6">
          {/* Summary */}
          <div
            className="mb-4 p-3 rounded-md text-sm font-medium flex items-center gap-2"
            style={{
              backgroundColor: allReady
                ? 'var(--status-success-light)'
                : someReady
                  ? 'var(--status-warning-light)'
                  : 'var(--status-danger-light)',
              color: allReady
                ? 'var(--status-success-text)'
                : someReady
                  ? 'var(--status-warning-text)'
                  : 'var(--status-danger-text)',
              border: `1px solid ${
                allReady ? 'var(--status-success)' : someReady ? 'var(--status-warning)' : 'var(--status-danger)'
              }`,
            }}
          >
            {allReady ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {allReady
              ? 'All providers ready for dispatch'
              : someReady
                ? 'Some providers are not ready'
                : 'No providers are ready for dispatch'}
          </div>

          {/* Per-Provider Results */}
          <div className="space-y-2">
            {results.map((result) => {
              const providerConfig = CREDENTIAL_PROVIDER_CONFIGS.find((c) => c.id === result.provider)
              return (
                <div
                  key={result.provider}
                  className="flex items-center justify-between p-3 rounded-md bg-[var(--surface-sunken)] border border-[var(--border-subtle)]"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-base">{providerConfig?.icon || '?'}</span>
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      {providerConfig?.displayName || result.provider}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.ready ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--status-success-text)' }}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Ready
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--status-danger-text)' }}>
                        <XCircle className="w-3.5 h-3.5" />
                        {result.validationResult?.error || 'Not ready'}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Token Usage Card Component (#4673)
// ============================================================================

type DeveloperUsageEntry = {
  userId: string
  githubLogin: string
  organizationId: string
  providers: Array<{
    provider: string
    currentUsage: number
    limit: number | null
    usagePercent: number | null
    usageBySource?: Partial<Record<'background_agent' | 'local', number>>
    healthState: 'ok' | 'warning' | 'critical'
    lastUpdatedAt: string
  }>
  overallHealthState: 'ok' | 'warning' | 'critical'
  lastUpdatedAt: string
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function UsageProgressBar({ usagePercent }: { usagePercent: number }) {
  const clampedPct = Math.min(Math.max(usagePercent, 0), 100)

  let barColor: string
  if (clampedPct >= CLAUDE_DANGER_THRESHOLD_PCT) {
    barColor = 'var(--status-danger)'
  } else if (clampedPct >= CLAUDE_WARNING_THRESHOLD_PCT) {
    barColor = 'var(--status-warning)'
  } else {
    barColor = 'var(--status-success)'
  }

  return (
    <div
      className="w-full h-1.5 rounded-full overflow-hidden"
      style={{ backgroundColor: 'var(--border-subtle)' }}
    >
      <div
        className="h-full rounded-full transition-all duration-300"
        style={{ width: `${clampedPct}%`, backgroundColor: barColor }}
      />
    </div>
  )
}

function TokenUsageCard() {
  const orgName = useSelectedWorkspace()
  const [usageData, setUsageData] = useState<DeveloperUsageEntry[] | null>(null)
  const [primaryUserId, setPrimaryUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUsage = useCallback(async (isRefresh = false) => {
    if (!orgName) {
      setLoading(false)
      return
    }
    if (isRefresh) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const [result, dispatchRules] = await Promise.all([
        api.getDeveloperProviderUsage(orgName),
        api.getDispatchRules(orgName),
      ])
      if (!result) {
        setUsageData([])
        return
      }
      setUsageData(result.developers)
      setPrimaryUserId(dispatchRules?.preferredCredentialOwners?.[0] ?? null)
    } catch {
      setError('Failed to load token usage data.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [orgName])

  useEffect(() => {
    fetchUsage(false)
    const interval = setInterval(() => fetchUsage(true), 30_000)
    return () => clearInterval(interval)
  }, [fetchUsage])

  // Filter to only developers that have claude usage
  const claudeUsers = (usageData ?? [])
    .map((dev) => {
      const claudeProvider = dev.providers.find((p) => p.provider === 'claude')
      return claudeProvider ? { dev, claudeProvider } : null
    })
    .filter((entry): entry is { dev: DeveloperUsageEntry; claudeProvider: DeveloperUsageEntry['providers'][number] } => entry !== null)

  // The "active" token is whoever is first in preferredCredentialOwners (from dispatch_rules)
  const activeLogin = claudeUsers.find(({ dev }) => dev.userId === primaryUserId)?.dev.githubLogin ?? null

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm hover:shadow-md transition-shadow duration-200">
      {/* Card Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)]">
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            Token Usage — Background Agents
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Claude subscription consumption this period
          </p>
        </div>
        <button
          onClick={() => fetchUsage(true)}
          disabled={refreshing || loading || !orgName}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <div className="p-6">
        {/* No workspace selected */}
        {!orgName && (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">
            Select a workspace to view token usage.
          </p>
        )}

        {/* Loading state */}
        {orgName && loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--interactive-secondary)] mx-auto mb-2" />
            <p className="text-sm text-[var(--text-muted)]">Loading usage data...</p>
          </div>
        )}

        {/* Error state */}
        {orgName && !loading && error && (
          <div
            className="p-3 rounded-md text-xs flex items-start gap-2"
            style={{
              backgroundColor: 'var(--status-danger-light)',
              border: '1px solid var(--status-danger)',
            }}
          >
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-danger-text)' }} />
            <p style={{ color: 'var(--status-danger-text)' }}>{error}</p>
          </div>
        )}

        {/* Empty state */}
        {orgName && !loading && !error && claudeUsers.length === 0 && (
          <p className="text-sm text-[var(--text-muted)] text-center py-4">
            No usage recorded yet. Usage tracking begins when background agents run.
          </p>
        )}

        {/* Usage rows */}
        {orgName && !loading && !error && claudeUsers.length > 0 && (
          <div className="space-y-4">
            {claudeUsers.map(({ dev, claudeProvider }) => {
              const usedSeconds = claudeProvider.currentUsage
              const limitSeconds = claudeProvider.limit ?? CLAUDE_LIMIT_SECONDS
              const usagePct = claudeProvider.usagePercent ?? Math.round((usedSeconds / limitSeconds) * 100)
              const localUsageSeconds = claudeProvider.usageBySource?.local ?? 0
              const backgroundUsageSeconds = claudeProvider.usageBySource?.background_agent ?? 0
              const hasSourceBreakdown = localUsageSeconds > 0 || backgroundUsageSeconds > 0
              const isActive = dev.githubLogin === activeLogin
              const autoSwitchTriggered = usagePct >= CLAUDE_WARNING_THRESHOLD_PCT

              return (
                <div key={dev.userId} className="space-y-2">
                  {/* Row header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        @{dev.githubLogin}
                      </span>
                      {isActive && (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: 'var(--status-success-light)',
                            color: 'var(--status-success-text)',
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: 'var(--status-success)' }}
                          />
                          Active
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatDuration(usedSeconds)} / 5hr ({usagePct}%)
                    </span>
                  </div>

                  {/* Progress bar */}
                  <UsageProgressBar usagePercent={usagePct} />

                  {hasSourceBreakdown && (
                    <p className="text-[11px] text-[var(--text-muted)]">
                      {localUsageSeconds > 0 && `Local ${formatDuration(localUsageSeconds)}`}
                      {localUsageSeconds > 0 && backgroundUsageSeconds > 0 && ' + '}
                      {backgroundUsageSeconds > 0 && `Background ${formatDuration(backgroundUsageSeconds)}`}
                    </p>
                  )}

                  {/* Auto-switch note */}
                  {autoSwitchTriggered && (
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--status-warning-text)' }}>
                      <Zap className="w-3 h-3 flex-shrink-0" />
                      Auto-switch triggered
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * Agent Credentials tab for Settings page (Issue #2574)
 *
 * Enhanced dual-auth credential management UI with:
 * - OAuth + API Key toggle per provider
 * - Status badges (Connected, Expiring Soon, Expired, Not Configured)
 * - Per-provider validation
 * - API Key input with provider-specific hints
 * - Pre-dispatch readiness check
 * - Token Usage section for background agent Claude consumption (#4673)
 */
export function AgentCredentialsTab() {
  const [credentials, setCredentials] = useState<Map<CredentialProvider, CredentialStatusResponse>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchCredentials = useCallback(async () => {
    setRefreshing(true)
    try {
      const response: AllCredentialsResponse = await api.getAllCredentialsStatus()
      const credMap = new Map<CredentialProvider, CredentialStatusResponse>()
      response.credentials.forEach((cred) => {
        credMap.set(cred.provider, cred)
      })
      setCredentials(credMap)
    } catch (error) {
      console.error('Failed to fetch credentials status:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchCredentials()
  }, [fetchCredentials])

  return (
    <>
      {/* Main Credentials Card */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Agent Credentials</h2>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Configure AI provider credentials for background agent sessions
            </p>
          </div>
          <button
            onClick={fetchCredentials}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--interactive-secondary)] mx-auto mb-2" />
              <p className="text-sm text-[var(--text-muted)]">Loading credential status...</p>
            </div>
          ) : (
            <div className="space-y-3">
              {CREDENTIAL_PROVIDER_CONFIGS.map((config) => (
                <ProviderCard
                  key={config.id}
                  providerId={config.id}
                  config={config}
                  status={credentials.get(config.id) || null}
                  onCredentialsChanged={fetchCredentials}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Token Usage — Background Agents (#4673) */}
      <TokenUsageCard />

      {/* Pre-Dispatch Readiness Check */}
      <ReadinessCheck />

      {/* Security Info */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm hover:shadow-md transition-shadow duration-200">
        <div className="px-6 py-4 border-b border-[var(--border-subtle)]">
          <h3 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Security</h3>
        </div>
        <div className="p-6 space-y-3">
          <div className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors duration-150">
            <Check className="w-4 h-4 text-[var(--text-secondary)] mt-0.5 flex-shrink-0" />
            <span className="text-sm text-[var(--text-secondary)]">All credentials are encrypted at rest using AES-256</span>
          </div>
          <div className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors duration-150">
            <Check className="w-4 h-4 text-[var(--text-secondary)] mt-0.5 flex-shrink-0" />
            <span className="text-sm text-[var(--text-secondary)]">Only you can access your credentials</span>
          </div>
          <div className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors duration-150">
            <Check className="w-4 h-4 text-[var(--text-secondary)] mt-0.5 flex-shrink-0" />
            <span className="text-sm text-[var(--text-secondary)]">Credentials are used only for background agent sessions</span>
          </div>
          <div className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors duration-150">
            <Check className="w-4 h-4 text-[var(--text-secondary)] mt-0.5 flex-shrink-0" />
            <span className="text-sm text-[var(--text-secondary)]">OAuth tokens are recommended over API keys for better security</span>
          </div>
        </div>
      </div>
    </>
  )
}
