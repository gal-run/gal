'use client'

/**
 * NewSessionModal Component (GAL-571)
 *
 * Modal dialog for creating a new background agent session.
 * Allows users to specify a name, project context, and runner label.
 */

import { useState } from 'react'
import { X, Terminal, Loader2, AlertCircle, Server, GitBranch } from 'lucide-react'
import { DEFAULT_RUNNER_LABEL, type RunnerLabel } from '@gal/types'
import { AuthenticationStatus } from './AuthenticationStatus'

const RUNNER_OPTIONS: { value: RunnerLabel; label: string; description: string }[] = [
  { value: 'agents-standard-runc-x64', label: 'agents-standard-runc-x64', description: 'Standard x64 Kata-backed microVM lane (default)' },
  { value: 'agents-medium-runc-x64', label: 'agents-medium-runc-x64', description: 'Medium x64 Kata-backed microVM lane' },
  { value: 'agents-high-runc-x64', label: 'agents-high-runc-x64', description: 'High-capacity x64 Kata-backed microVM lane' },
  { value: 'agents-kali-runc', label: 'agents-kali-runc', description: 'Kali Linux security tooling lane (requires security/admin role)' },
]

interface NewSessionModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (name: string, projectContext?: string, runnerLabel?: RunnerLabel, branch?: string, initialPrompt?: string) => Promise<void>
  isSubmitting: boolean
}

export function NewSessionModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting,
}: NewSessionModalProps) {
  const [name, setName] = useState('')
  const [initialPrompt, setInitialPrompt] = useState('')
  const [projectContext, setProjectContext] = useState('')
  const [branch, setBranch] = useState('')
  const [runnerLabel, setRunnerLabel] = useState<RunnerLabel>(DEFAULT_RUNNER_LABEL)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Session name is required')
      return
    }

    if (!initialPrompt.trim()) {
      setError('Initial task is required')
      return
    }

    try {
      await onSubmit(
        name.trim(),
        projectContext.trim() || undefined,
        runnerLabel,
        branch.trim() || undefined,
        initialPrompt.trim(),
      )
      // Reset form on success
      setName('')
      setInitialPrompt('')
      setProjectContext('')
      setBranch('')
      setRunnerLabel(DEFAULT_RUNNER_LABEL)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session')
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setName('')
      setInitialPrompt('')
      setProjectContext('')
      setBranch('')
      setRunnerLabel(DEFAULT_RUNNER_LABEL)
      setError(null)
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={handleClose} />

      {/* Modal */}
      <div
        className="relative w-full max-w-md mx-4 rounded-lg shadow-xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-bg)' }}
            >
              <Terminal className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                New Session
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Start a background coding agent session on isolated microVM infrastructure
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Error Message */}
            {error && (
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
            )}

            {/* Session Name */}
            <div>
              <label
                htmlFor="session-name"
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Session Name *
              </label>
              <input
                id="session-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Feature Development, Bug Investigation"
                disabled={isSubmitting}
                className="w-full px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
                autoFocus
              />
            </div>

            {/* Initial Task */}
            <div>
              <label
                htmlFor="initial-prompt"
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Task *
              </label>
              <textarea
                id="initial-prompt"
                value={initialPrompt}
                onChange={(e) => setInitialPrompt(e.target.value)}
                placeholder="e.g., Investigate why Claude background sessions exit after completion and patch the workflow/tests"
                disabled={isSubmitting}
                rows={4}
                className="w-full px-3 py-2 rounded-lg text-sm transition-colors resize-y"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                Sent to the agent when the session starts. Required for SDK sessions.
              </p>
            </div>

            {/* Project Context */}
            <div>
              <label
                htmlFor="project-context"
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                Project Context (Optional)
              </label>
              <input
                id="project-context"
                type="text"
                value={projectContext}
                onChange={(e) => setProjectContext(e.target.value)}
                placeholder="e.g., git@github.com:org/repo.git"
                disabled={isSubmitting}
                className="w-full px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                Repository URL to clone into the session. Leave empty to use default workspace.
              </p>
            </div>

            {/* Branch */}
            <div>
              <label
                htmlFor="branch"
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                <GitBranch className="w-4 h-4 inline mr-1" />
                Branch (Optional)
              </label>
              <input
                id="branch"
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="e.g., main, develop, feature/my-feature"
                disabled={isSubmitting}
                className="w-full px-3 py-2 rounded-lg text-sm transition-colors"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              />
              <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                Git branch to checkout. Leave empty for repository&apos;s default branch.
              </p>
            </div>

            {/* Runner Selection */}
            <div>
              <label
                htmlFor="runner-label"
                className="block text-sm font-medium mb-2"
                style={{ color: 'var(--text-secondary)' }}
              >
                <Server className="w-4 h-4 inline mr-1" />
                Runner
              </label>
              <select
                id="runner-label"
                value={runnerLabel}
                onChange={(e) => setRunnerLabel(e.target.value as RunnerLabel)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 rounded-lg text-sm transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {RUNNER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label} — {option.description}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                Kata-backed ARC runner lane for this session.
              </p>
            </div>

            {/* Authentication Status */}
            <AuthenticationStatus />

            {/* Info Box */}
            <div
              className="p-3 rounded-lg text-xs"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-muted)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <p className="font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Session Info
              </p>
              <ul className="space-y-1 list-disc list-inside">
                <li>Sessions run on secure company infrastructure (ARC runners)</li>
                <li>Agent sessions run on Kata-backed isolated microVM lanes</li>
                <li>Maximum session duration is 24 hours</li>
                <li>You can reconnect to active sessions anytime</li>
              </ul>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 p-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !name.trim() || !initialPrompt.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--text-on-accent)',
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Terminal className="w-4 h-4" />
                  Create Session
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default NewSessionModal
