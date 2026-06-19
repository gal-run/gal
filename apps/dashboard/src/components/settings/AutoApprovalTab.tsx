'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2, RotateCcw, Info, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { getUserFriendlyError } from '@/lib/errors'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import type { AutoApprovalSettings, AutoApprovalDecision } from '@/lib/api'

const DEFAULT_SYSTEM_PROMPT = `You are GAL Auto-Approval Agent, an AI governance reviewer for AI agent configurations.

Your job is to evaluate a proposed change to the organisation's approved AI agent configuration and decide whether it is safe to auto-approve.

## Decision criteria
- APPROVE if: the change is additive or editorial, does not introduce shell execution, network access, secrets handling, or dangerous permissions, and aligns with the stated rationale.
- REJECT if: the static policy scanner has already flagged critical or high-severity violations (these are provided to you), or the content contains patterns clearly inconsistent with a legitimate coding workflow.
- ESCALATE (return to human review) if: you are uncertain, the change is large or structural, or the rationale is absent or implausible.

## Output format (JSON only, no prose)
{
  "decision": "approve" | "reject" | "escalate",
  "confidence": <float 0.0-1.0>,
  "reasoning": "<one paragraph>"
}

## Hard rules (always override your analysis)
- Never approve a proposal whose static policy violations include severity "critical" or "high".
- Never approve proposals that add or modify shell hooks without explicit justification in the rationale.
- When in doubt, escalate.`

/**
 * Auto-Approval Settings Tab (Issue #3296)
 *
 * Manages AI auto-approval configuration for config proposals:
 * - Enable/disable toggle
 * - Confidence threshold slider
 * - System prompt editor
 * - Dry-run mode
 * - Recent AI decisions table
 */
export function AutoApprovalTab() {
  const selectedWorkspace = useSelectedWorkspace()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Settings state
  const [enabled, setEnabled] = useState(false)
  const [confidenceThreshold, setConfidenceThreshold] = useState(85)
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT)
  const [dryRun, setDryRun] = useState(false)

  // Decisions state
  const [decisions, setDecisions] = useState<AutoApprovalDecision[]>([])
  const [decisionsLoading, setDecisionsLoading] = useState(false)

  // Track if settings have been modified
  const [originalSettings, setOriginalSettings] = useState<AutoApprovalSettings | null>(null)

  const hasChanges = originalSettings !== null && (
    enabled !== originalSettings.enabled ||
    confidenceThreshold !== originalSettings.confidenceThreshold ||
    systemPrompt !== (originalSettings.systemPrompt || DEFAULT_SYSTEM_PROMPT) ||
    dryRun !== originalSettings.dryRun
  )

  // Fetch settings
  const fetchSettings = useCallback(async () => {
    if (!selectedWorkspace) return
    setLoading(true)
    setError(null)
    setPermissionDenied(false)

    try {
      const settings = await api.getAutoApprovalSettings(selectedWorkspace)
      setEnabled(settings.enabled)
      setConfidenceThreshold(settings.confidenceThreshold)
      setSystemPrompt(settings.systemPrompt || DEFAULT_SYSTEM_PROMPT)
      setDryRun(settings.dryRun)
      setOriginalSettings(settings)
    } catch (err: unknown) {
      console.error('Failed to fetch auto-approval settings:', err)
      const msg = err instanceof Error ? err.message : ''
      if (msg.toLowerCase().includes('admin access required')) {
        setPermissionDenied(true)
      } else {
        setError(getUserFriendlyError(err, 'Unable to load auto-approval settings.'))
      }
    } finally {
      setLoading(false)
    }
  }, [selectedWorkspace])

  // Fetch recent decisions
  const fetchDecisions = useCallback(async () => {
    if (!selectedWorkspace) return
    setDecisionsLoading(true)

    try {
      const result = await api.getAutoApprovalDecisions(selectedWorkspace)
      setDecisions(result)
    } catch (err: unknown) {
      console.error('Failed to fetch auto-approval decisions:', err)
    } finally {
      setDecisionsLoading(false)
    }
  }, [selectedWorkspace])

  useEffect(() => {
    fetchSettings()
    fetchDecisions()
  }, [fetchSettings, fetchDecisions])

  // Save settings
  const handleSave = async () => {
    if (!selectedWorkspace) return
    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    try {
      await api.updateAutoApprovalSettings(selectedWorkspace, {
        enabled,
        confidenceThreshold,
        systemPrompt: systemPrompt === DEFAULT_SYSTEM_PROMPT ? null : systemPrompt,
        dryRun,
      })
      setOriginalSettings({ enabled, confidenceThreshold, systemPrompt, dryRun })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: unknown) {
      console.error('Failed to save auto-approval settings:', err)
      setError(getUserFriendlyError(err, 'Unable to save settings.'))
    } finally {
      setSaving(false)
    }
  }

  const handleResetPrompt = () => {
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT)
  }

  const getDecisionBadgeClasses = (decision: string) => {
    const base = 'px-2 py-0.5 rounded text-xs font-medium'
    switch (decision) {
      case 'approve':
        return `${base} bg-[var(--status-success-light)] text-[var(--status-success)]`
      case 'reject':
        return `${base} bg-[var(--status-danger-light)] text-[var(--status-danger)]`
      case 'escalate':
        return `${base} bg-[var(--status-warning-light)] text-[var(--status-warning)]`
      default:
        return `${base} bg-[var(--badge-gray-bg)] text-[var(--badge-gray-text)]`
    }
  }

  if (!selectedWorkspace) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-secondary)]">
          Select a workspace to configure auto-approval settings.
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin mx-auto mb-4" />
          <p className="text-[var(--text-muted)] text-sm">Loading auto-approval settings...</p>
        </div>
      </div>
    )
  }

  if (permissionDenied) {
    return (
      <div className="text-center py-12">
        <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-[var(--status-warning)]" />
        <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
          Admin access required
        </p>
        <p className="text-sm text-[var(--text-secondary)]">
          Only organization admins can manage auto-approval settings.
          Contact your organization admin to request access.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Error */}
      {error && (
        <div
          className="p-4 rounded-lg border"
          style={{
            backgroundColor: 'var(--status-danger-light)',
            borderColor: 'var(--status-danger)',
            color: 'var(--status-danger-text)',
          }}
        >
          <p className="text-sm">{error}</p>
        </div>
      )}

      {/* Enable / Disable Toggle */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm">
        <div className="px-6 py-5 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            Auto-Approval
          </h2>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Let AI automatically review and approve safe config proposals
          </p>
        </div>

        <div className="p-6 space-y-6">
          {/* Enable toggle */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="auto-approval-toggle"
                className="text-sm font-medium text-[var(--text-primary)] cursor-pointer"
              >
                Enable AI Auto-Approval
              </label>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                When enabled, new proposals are automatically evaluated by AI
              </p>
            </div>
            <button
              id="auto-approval-toggle"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                enabled
                  ? 'bg-[var(--interactive-primary)]'
                  : 'bg-[var(--border-default)]'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                  enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Dry-run mode */}
          <div className="flex items-center justify-between">
            <div>
              <label
                htmlFor="dry-run-toggle"
                className="text-sm font-medium text-[var(--text-primary)] cursor-pointer"
              >
                Dry-run mode
              </label>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                AI evaluates proposals and logs decisions, but does not act on them
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                id="dry-run-toggle"
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--interactive-primary)] focus:ring-[var(--interactive-primary)]"
              />
            </label>
          </div>

          {/* Confidence threshold slider */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label
                htmlFor="confidence-threshold"
                className="text-sm font-medium text-[var(--text-primary)]"
              >
                Confidence Threshold
              </label>
              <span className="text-sm font-mono font-medium text-[var(--text-primary)]">
                {confidenceThreshold}%
              </span>
            </div>
            <input
              id="confidence-threshold"
              type="range"
              min={0}
              max={100}
              value={confidenceThreshold}
              onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
              className="w-full h-2 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, var(--interactive-primary) ${confidenceThreshold}%, var(--border-default) ${confidenceThreshold}%)`,
              }}
            />
            <div className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
              <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
              <span>
                Proposals with AI confidence at or above this threshold will be auto-approved.
                Below the threshold, proposals are escalated for human review.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* System Prompt Editor */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm">
        <div className="flex items-center justify-between px-6 py-5 border-b border-[var(--border-subtle)]">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
              System Prompt
            </h2>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
              Customize the AI evaluation policy for your organization
            </p>
          </div>
          <button
            onClick={handleResetPrompt}
            disabled={systemPrompt === DEFAULT_SYSTEM_PROMPT}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] bg-[var(--surface-raised)] border border-[var(--border-default)] rounded-lg hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to default
          </button>
        </div>

        <div className="p-6">
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={14}
            className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-1 resize-y font-mono"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
            placeholder="Enter a system prompt for the auto-approval AI agent..."
          />
          <div className="flex items-center justify-between mt-2 text-xs text-[var(--text-muted)]">
            <span>{systemPrompt.length} characters</span>
            {systemPrompt !== DEFAULT_SYSTEM_PROMPT && (
              <span className="text-[var(--status-warning)]">Modified from default</span>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex items-center justify-end gap-3">
        {saveSuccess && (
          <span className="text-sm text-[var(--status-success)]">Settings saved</span>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: hasChanges ? 'var(--interactive-primary)' : 'var(--border-default)',
            color: hasChanges ? 'var(--text-on-accent)' : 'var(--text-muted)',
          }}
        >
          {saving && <Loader2 className="w-4 h-4 animate-spin" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Recent AI Decisions */}
      <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-sm">
        <div className="px-6 py-5 border-b border-[var(--border-subtle)]">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            Recent AI Decisions
          </h2>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            Last 10 auto-approval evaluations
          </p>
        </div>

        <div className="p-6">
          {decisionsLoading ? (
            <div className="text-center py-8">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-[var(--text-muted)]" />
              <p className="text-sm text-[var(--text-muted)]">Loading decisions...</p>
            </div>
          ) : decisions.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-[var(--text-muted)]">
                No AI decisions yet. Decisions will appear here once auto-approval evaluates proposals.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)]">
                    <th className="text-left py-2 pr-4 font-medium text-[var(--text-secondary)]">
                      Timestamp
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-[var(--text-secondary)]">
                      Proposal
                    </th>
                    <th className="text-left py-2 pr-4 font-medium text-[var(--text-secondary)]">
                      Decision
                    </th>
                    <th className="text-right py-2 font-medium text-[var(--text-secondary)]">
                      Confidence
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((decision) => (
                    <tr
                      key={decision.id}
                      className="border-b border-[var(--border-subtle)] last:border-0"
                    >
                      <td className="py-2.5 pr-4 text-[var(--text-muted)] whitespace-nowrap">
                        {new Date(decision.timestamp).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 pr-4 text-[var(--text-primary)] font-mono text-xs">
                        {decision.proposalId}
                      </td>
                      <td className="py-2.5 pr-4">
                        <span className={getDecisionBadgeClasses(decision.decision)}>
                          {decision.decision}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-[var(--text-primary)] font-mono">
                        {Math.round(decision.confidence * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
