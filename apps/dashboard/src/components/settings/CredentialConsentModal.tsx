'use client'

/**
 * Credential Consent Modal (Issue #189)
 *
 * Point-of-capture consent gate for provider credential storage. Addresses the
 * FTC §5 deception-by-omission risk identified in the issue analysis:
 * at CLI/dashboard capture time, the user is not told where the key is stored,
 * how it will be used, or who receives it.
 *
 * This modal surfaces that disclosure + requires affirmative consent before the
 * credential-store flow proceeds, and records the consent event server-side so
 * we have an FTC-defensible audit trail.
 */

import React, { useCallback, useState } from 'react'
import {
  Shield,
  X,
  Loader2,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react'
import { api } from '@/lib/api'
import {
  CURRENT_POLICY_VERSION_REF,
  CURRENT_PRIVACY_VERSION_REF,
  GAL_PRIVACY_URL,
  GAL_TERMS_URL,
  type ConsentProvider,
} from '@gal/types'

// ============================================================================
// Props
// ============================================================================

export interface CredentialConsentModalProps {
  /** Provider the user is about to add a credential for. */
  provider: ConsentProvider
  /** Display name used in copy; defaults to a Title-Cased provider name. */
  providerDisplayName?: string
  /** Called after the consent event has been recorded server-side. */
  onConsent: () => void
  /** Called when the user dismisses the modal without consenting. */
  onCancel: () => void
}

// ============================================================================
// Display helpers
// ============================================================================

const DEFAULT_DISPLAY_NAMES: Record<ConsentProvider, string> = {
  claude: 'Claude (Anthropic)',
  codex: 'Codex (OpenAI)',
  gemini: 'Gemini (Google)',
}

// Deep-link into the specific Terms / Privacy sections that govern credential
// handling. Uses PDF fragment hints where the pipeline supports them.
const TOS_SECTION_URL = `${GAL_TERMS_URL}#section-14`
const PRIVACY_SECTION_URL = `${GAL_PRIVACY_URL}#credentials`

// ============================================================================
// Component
// ============================================================================

export function CredentialConsentModal({
  provider,
  providerDisplayName,
  onConsent,
  onCancel,
}: CredentialConsentModalProps) {
  const [checked, setChecked] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const displayName = providerDisplayName ?? DEFAULT_DISPLAY_NAMES[provider] ?? provider

  const handleConfirm = useCallback(async () => {
    if (!checked || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await api.fetch('/api/credentials/consent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          policyVersionRef: CURRENT_POLICY_VERSION_REF,
          privacyVersionRef: CURRENT_PRIVACY_VERSION_REF,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string }
        setError(body.error || body.message || `Consent request failed (${res.status})`)
        setSubmitting(false)
        return
      }
      onConsent()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Consent request failed')
      setSubmitting(false)
    }
  }, [checked, submitting, provider, onConsent])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credential-consent-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={submitting ? undefined : onCancel}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-xl mx-4 rounded-xl shadow-2xl"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--surface-raised)]">
              <Shield className="w-5 h-5 text-[var(--text-secondary)]" />
            </div>
            <h2
              id="credential-consent-title"
              className="text-lg font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Confirm credential storage and use
            </h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--surface-overlay)] disabled:opacity-50"
            style={{ color: 'var(--text-muted)' }}
            aria-label="Close consent dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Before you add your <strong style={{ color: 'var(--text-primary)' }}>{displayName}</strong>{' '}
            credential, please review how GAL will handle it.
          </p>

          <DisclosureSection title="What we collect">
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>- Your {displayName} API key or OAuth token</li>
              <li>- Provider metadata (token prefix, expiry, account id if supplied)</li>
              <li>- Nothing else from the provider account</li>
            </ul>
          </DisclosureSection>

          <DisclosureSection title="How we use it">
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>
                - Only to dispatch background agents on your behalf. The token is injected as
                an environment variable into the runner process for the duration of the session.
              </li>
              <li>
                - Never for analytics, telemetry aggregation, machine-learning training, or any
                purpose other than agent execution.
              </li>
            </ul>
          </DisclosureSection>

          <DisclosureSection title="Who receives it">
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>- GAL API and Firestore (encrypted at rest)</li>
              <li>- A GitHub Actions runner (self-hosted or GitHub-hosted) during dispatch</li>
              <li>- The provider itself ({displayName}), via its own API</li>
            </ul>
          </DisclosureSection>

          <DisclosureSection title="Retention">
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>- Stored until you delete it from Settings or revoke via this dashboard</li>
              <li>- Deleted within 30 days after you delete your account</li>
              <li>- Retained in encrypted backups for up to 90 days</li>
            </ul>
          </DisclosureSection>

          <DisclosureSection title="Your rights">
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>- View all consent events you have recorded</li>
              <li>- Delete the credential at any time (deletion is immediate)</li>
              <li>- Export a copy of your consent audit log on request</li>
            </ul>
          </DisclosureSection>

          {/* Policy links */}
          <div className="flex flex-col gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
            <a
              href={TOS_SECTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[var(--text-secondary)] underline underline-offset-2"
            >
              <ExternalLink className="w-3 h-3" />
              Terms §14 — Provider Credentials (API Keys Required)
            </a>
            <a
              href={PRIVACY_SECTION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-[var(--text-secondary)] underline underline-offset-2"
            >
              <ExternalLink className="w-3 h-3" />
              Privacy Policy — Provider Credentials
            </a>
          </div>

          {/* Consent checkbox */}
          <label
            className="flex items-start gap-3 p-3 rounded-lg cursor-pointer"
            style={{
              backgroundColor: 'var(--surface-sunken)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => {
                setChecked(e.target.checked)
                setError(null)
              }}
              disabled={submitting}
              className="mt-0.5 w-4 h-4"
              data-testid="credential-consent-checkbox"
              aria-label="I have read and understood the above and consent to storing this credential for agent dispatch."
            />
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
              I have read and understood the above and consent to storing this credential
              for agent dispatch.
            </span>
          </label>

          {/* Error */}
          {error && (
            <div
              className="rounded-lg border px-3 py-2 text-sm flex items-start gap-2"
              style={{
                backgroundColor: 'var(--status-danger-light)',
                borderColor: 'var(--status-danger)',
                color: 'var(--status-danger-text)',
              }}
              role="alert"
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 p-4 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!checked || submitting}
            data-testid="credential-consent-confirm"
            className="px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 bg-[var(--interactive-primary)] hover:opacity-90 text-[var(--text-on-accent)] disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Recording consent...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Consent and continue
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Internal
// ============================================================================

function DisclosureSection({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <h3
        className="text-xs font-semibold uppercase tracking-wide mb-1"
        style={{ color: 'var(--text-muted)' }}
      >
        {title}
      </h3>
      {children}
    </section>
  )
}
