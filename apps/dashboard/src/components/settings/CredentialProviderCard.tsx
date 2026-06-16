'use client'

import { useState } from 'react'
import { Loader2, Trash2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'
import type {
  CredentialProvider,
  CredentialProviderConfig,
  CredentialStatusResponse
} from '@gal/types'

interface CredentialProviderCardProps {
  config: CredentialProviderConfig
  status: CredentialStatusResponse | null
  loading: boolean
  onSave: (provider: CredentialProvider, accessToken: string) => Promise<void>
  onDelete: (provider: CredentialProvider) => Promise<void>
}

/**
 * Card component for managing credentials of a single provider.
 * Used in the Background Agents tab for Claude, Codex, and Gemini.
 */
export function CredentialProviderCard({
  config,
  status,
  loading,
  onSave,
  onDelete
}: CredentialProviderCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [jsonInput, setJsonInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isConfigured = status?.exists ?? false

  const handleSave = async () => {
    setError(null)

    let accessToken: string | undefined

    const trimmed = jsonInput.trim()

    if (config.id === 'codex' && trimmed.startsWith('sk-')) {
      accessToken = trimmed
    } else if (config.id === 'gemini' && trimmed.startsWith('AIza')) {
      accessToken = trimmed
    } else if (config.id === 'claude' && trimmed.startsWith('sk-ant-')) {
      accessToken = trimmed
    } else {
      try {
        const parsed = JSON.parse(trimmed)
        switch (config.id) {
          case 'claude':
            accessToken = parsed?.claudeAiOauth?.accessToken || parsed?.accessToken
            break
          case 'codex':
            accessToken = parsed?.apiKey || parsed?.access_token || parsed
            break
          case 'gemini':
            accessToken = parsed?.access_token || parsed?.apiKey
            break
          default:
            accessToken = parsed?.accessToken || parsed?.apiKey
        }
        if (typeof accessToken !== 'string') {
          accessToken = undefined
        }
      } catch {
        accessToken = trimmed || undefined
      }
    }

    if (!accessToken) {
      setError('API key is required')
      return
    }

    if (config.accessTokenPattern && !config.accessTokenPattern.test(accessToken)) {
      setError(`Invalid API key format. ${config.tokenHint}`)
      return
    }

    setSaving(true)
    try {
      await onSave(config.id, accessToken)
      setJsonInput('')
      setExpanded(false)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save credentials')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete your ${config.displayName} credentials? Background agent sessions using this provider will not work.`)) {
      return
    }

    setDeleting(true)
    try {
      await onDelete(config.id)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete credentials')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div
      className="rounded-lg overflow-hidden"
      data-testid={`credential-provider-${config.id}`}
      style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
    >
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
              style={{
                backgroundColor: isConfigured ? 'var(--status-success-light)' : 'var(--bg-secondary)',
                border: `1px solid ${isConfigured ? 'var(--status-success)' : 'var(--border-subtle)'}`
              }}
            >
              {config.icon}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {config.displayName}
              </p>
              {loading ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Checking status...
                </p>
              ) : isConfigured ? (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Token: {status?.tokenPrefix || '***'}
                  {status?.updatedAt && ` • Updated ${new Date(status.updatedAt).toLocaleDateString()}`}
                </p>
              ) : (
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  Not configured
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--text-muted)' }} />
            ) : isConfigured ? (
              <>
                {status?.status === 'active' ? (
                  <span
                    className="text-xs px-2 py-1 rounded"
                    style={{ backgroundColor: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
                  >
                    Active
                  </span>
                ) : status?.status === 'expired' ? (
                  <span
                    className="text-xs px-2 py-1 rounded"
                    style={{ backgroundColor: 'var(--status-danger-light)', color: 'var(--status-danger-text)' }}
                  >
                    Expired
                  </span>
                ) : null}
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="p-1.5 rounded-lg transition-colors hover:bg-[var(--status-danger-light)]"
                  style={{ color: 'var(--text-muted)' }}
                  title="Delete credentials"
                >
                  {deleting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4 hover:text-[var(--status-danger-text)]" />
                  )}
                </button>
              </>
            ) : (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-sm"
                style={{ color: 'var(--accent)' }}
              >
                Configure
                {expanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Input Section */}
      {(expanded || isConfigured) && (
        <div
          className="px-4 pb-4 space-y-3"
          style={{ borderTop: '1px solid var(--border-subtle)' }}
        >
          <div className="pt-4">
            <label className="block text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
              {config.instructions}
            </label>
            <textarea
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value)
                setError(null)
              }}
              data-testid={`credential-json-${config.id}`}
              placeholder={config.tokenHint}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono resize-none"
              style={{
                backgroundColor: 'var(--bg-secondary)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                minHeight: '80px',
              }}
            />
          </div>

          {error && (
            <div
              className="flex items-start gap-2 p-3 rounded-lg"
              style={{ backgroundColor: 'var(--status-danger-light)', border: '1px solid var(--status-danger)' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--status-danger-text)' }} />
              <p className="text-xs" style={{ color: 'var(--status-danger-text)' }}>{error}</p>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !jsonInput.trim()}
              className="btn-primary text-sm flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving...' : isConfigured ? 'Update' : 'Save'}
            </button>
            {expanded && !isConfigured && (
              <button
                onClick={() => {
                  setExpanded(false)
                  setJsonInput('')
                  setError(null)
                }}
                className="text-sm px-3 py-1.5"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
