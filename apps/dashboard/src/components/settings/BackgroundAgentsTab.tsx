'use client'

import { useState, useEffect, useCallback } from 'react'
import { Check, Terminal, Bot, Chrome } from 'lucide-react'
import { CredentialProviderCard } from './CredentialProviderCard'
import { api } from '@/lib/api'
import type {
  CredentialProvider,
  CredentialStatusResponse,
  AllCredentialsResponse
} from '@gal/types'
import { CREDENTIAL_PROVIDER_CONFIGS } from '@gal/types'
import { useAgentPreference, AGENT_OPTIONS } from '@/hooks/useAgentPreference'

/**
 * Background Agents tab for Settings page (Issue #1136)
 *
 * Manages OAuth credentials for multiple AI coding agent providers:
 * - Claude Code
 * - Codex CLI
 * - Gemini CLI
 *
 * Features:
 * - Per-provider credential cards
 * - Save/update/delete credentials
 * - Shows token prefix for identification
 * - Encrypted storage info
 */
export function BackgroundAgentsTab() {
  const [credentials, setCredentials] = useState<Map<CredentialProvider, CredentialStatusResponse>>(new Map())
  const [loading, setLoading] = useState(true)
  const [extensionVersion, setExtensionVersion] = useState<string | null | undefined>(undefined)

  // Fetch all credentials status on mount
  useEffect(() => {
    let isMounted = true

    async function fetchCredentials() {
      setLoading(true)
      try {
        const response: AllCredentialsResponse = await api.getAllCredentialsStatus()
        if (!isMounted) return

        // Convert array to map for easy lookup
        const credMap = new Map<CredentialProvider, CredentialStatusResponse>()
        response.credentials.forEach(cred => {
          credMap.set(cred.provider, cred)
        })
        setCredentials(credMap)
      } catch (error) {
        console.error('Failed to fetch credentials status:', error)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchCredentials()

    return () => {
      isMounted = false
    }
  }, [])

  // Fetch stored extension version on mount (#4463)
  useEffect(() => {
    let isMounted = true

    async function fetchExtensionVersion() {
      try {
        const result = await api.getExtensionVersion()
        if (isMounted) {
          setExtensionVersion(result.version)
        }
      } catch {
        if (isMounted) {
          setExtensionVersion(null)
        }
      }
    }

    fetchExtensionVersion()

    return () => {
      isMounted = false
    }
  }, [])

  // Handle saving credentials for a provider
  const handleSave = useCallback(async (
    provider: CredentialProvider,
    accessToken: string
  ) => {
    const result = await api.setCredentials(provider, accessToken)
    if (!result.success) {
      throw new Error(result.error || 'Failed to save credentials')
    }

    const status = await api.getCredentialStatus(provider)
    setCredentials(prev => {
      const next = new Map(prev)
      next.set(provider, status)
      return next
    })
  }, [])

  // Handle deleting credentials for a provider
  const handleDelete = useCallback(async (provider: CredentialProvider) => {
    const result = await api.deleteCredentials(provider)
    if (!result.success) {
      throw new Error(result.error || 'Failed to delete credentials')
    }

    // Update status to not configured
    setCredentials(prev => {
      const next = new Map(prev)
      next.set(provider, {
        exists: false,
        provider,
        status: 'not_configured'
      })
      return next
    })
  }, [])

  // Count configured providers
  const configuredCount = Array.from(credentials.values()).filter(c => c.exists).length

  // Agent preference
  const { preferredAgent, setPreferredAgent, isLoaded: prefLoaded } = useAgentPreference()

  return (
    <>
      {/* Preferred Agent Selection */}
      <div className="dashboard-card p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Bot className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Preferred Coding Agent
          </h2>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Select your default agent for SAL work items and background sessions.
          You can override this per-execution when needed.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {AGENT_OPTIONS.map(option => (
            <button
              key={option.value}
              onClick={() => setPreferredAgent(option.value)}
              disabled={!prefLoaded}
              className={`p-4 rounded-lg border text-left transition-all ${
                preferredAgent === option.value
                  ? 'border-[var(--status-success)] bg-[var(--status-success-light)]'
                  : 'border-[var(--border-subtle)] hover:border-[var(--border-interactive)]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {option.label}
                </span>
                {preferredAgent === option.value && (
                  <Check className="w-4 h-4 text-[var(--status-success)]" />
                )}
              </div>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {option.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="dashboard-card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Background Agent Credentials
          </h2>
          {configuredCount > 0 && (
            <span
              className="text-xs px-2 py-1 rounded"
              style={{ backgroundColor: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
            >
              {configuredCount} of {CREDENTIAL_PROVIDER_CONFIGS.length} configured
            </span>
          )}
        </div>

        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Configure credentials for AI coding agents to enable background sessions.
          Each provider uses different authentication - see instructions below each card.
        </p>

        {/* Provider Cards */}
        <div className="space-y-4">
          {CREDENTIAL_PROVIDER_CONFIGS.map(config => (
            <CredentialProviderCard
              key={config.id}
              config={config}
              status={credentials.get(config.id) ?? null}
              loading={loading}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>

      {/* CLI Setup Instructions */}
      <div className="dashboard-card p-6">
        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
          Quick Setup via CLI
        </h3>
        <div
          className="p-4 rounded-lg mb-4 flex items-center gap-3"
          style={{ backgroundColor: 'var(--accent-bg)', border: '1px solid var(--accent)' }}
        >
          <Terminal className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <code className="text-sm" style={{ color: 'var(--accent)' }}>
            gal auth &lt;provider&gt;
          </code>
        </div>
        <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
          Replace <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>&lt;provider&gt;</code> with:{' '}
          <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>claude</code>,{' '}
          <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>codex</code>, or{' '}
          <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-tertiary)' }}>gemini</code>
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          The CLI will automatically detect and sync your local credentials to GAL.
        </p>
      </div>

      {/* Security Info */}
      <div className="dashboard-card p-6">
        <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>
          Security
        </h3>
        <div className="space-y-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex items-start gap-2">
            <Check className="w-3 h-3 mt-0.5" style={{ color: 'var(--accent)' }} />
            <span>All credentials are encrypted at rest using AES-256</span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-3 h-3 mt-0.5" style={{ color: 'var(--accent)' }} />
            <span>Only you can access your credentials</span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-3 h-3 mt-0.5" style={{ color: 'var(--accent)' }} />
            <span>Credentials are used only for background agent sessions</span>
          </div>
          <div className="flex items-start gap-2">
            <Check className="w-3 h-3 mt-0.5" style={{ color: 'var(--accent)' }} />
            <span>You can delete credentials at any time</span>
          </div>
        </div>
      </div>

      {/* Chrome Extension Version (#4463) */}
      <div className="dashboard-card p-6">
        <div className="flex items-center gap-3 mb-3">
          <Chrome className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Chrome Extension
          </h3>
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {extensionVersion === undefined ? (
            <span>Loading...</span>
          ) : extensionVersion === null ? (
            <span>No version recorded yet. Install the GAL Chrome extension and log in to report your version.</span>
          ) : (
            <span>
              Installed version:{' '}
              <code
                className="px-1 py-0.5 rounded"
                style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                v{extensionVersion}
              </code>
            </span>
          )}
        </div>
      </div>
    </>
  )
}
