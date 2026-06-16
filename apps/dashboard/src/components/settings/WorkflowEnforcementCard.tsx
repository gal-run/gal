'use client'

import { useState } from 'react'
import { Shield, AlertTriangle, Lock, HelpCircle, Users, Terminal } from 'lucide-react'

/**
 * Workflow Enforcement Card (#4702)
 *
 * Displays org-level workflow enforcement settings within the dispatch rules page.
 * Allows admins to configure "background agents only" mode, which restricts
 * local sessions to orchestration activities only.
 */

export type WorkflowEnforcementMode = 'off' | 'warn' | 'background-only'

export interface WorkflowEnforcementConfig {
  mode: WorkflowEnforcementMode
  enabled: boolean
  blockedTools?: string[]
  blockMessage?: string
  exemptUsers?: string[]
}

interface WorkflowEnforcementCardProps {
  config: WorkflowEnforcementConfig
  onChange: (config: WorkflowEnforcementConfig) => void
}

const MODE_OPTIONS: { value: WorkflowEnforcementMode; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: 'off',
    label: 'Off',
    description: 'No restrictions. Developers can work locally or via background agents.',
    icon: <Terminal className="w-4 h-4" />,
  },
  {
    value: 'warn',
    label: 'Warn',
    description: 'Local implementation triggers a warning suggesting queue usage, but does not block.',
    icon: <AlertTriangle className="w-4 h-4" />,
  },
  {
    value: 'background-only',
    label: 'Background Only',
    description: 'Local sessions are restricted to orchestration. All implementation must go through the queue.',
    icon: <Lock className="w-4 h-4" />,
  },
]

const DEFAULT_BLOCKED_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

export function WorkflowEnforcementCard({ config, onChange }: WorkflowEnforcementCardProps) {
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [exemptUserInput, setExemptUserInput] = useState('')

  const handleModeChange = (mode: WorkflowEnforcementMode) => {
    onChange({
      ...config,
      mode,
      enabled: mode !== 'off',
    })
  }

  const handleAddExemptUser = () => {
    const user = exemptUserInput.trim()
    if (!user) return
    const current = config.exemptUsers || []
    if (current.includes(user)) return
    onChange({
      ...config,
      exemptUsers: [...current, user],
    })
    setExemptUserInput('')
  }

  const handleRemoveExemptUser = (user: string) => {
    onChange({
      ...config,
      exemptUsers: (config.exemptUsers || []).filter((u) => u !== user),
    })
  }

  return (
    <div className="dashboard-card p-6">
      <div className="flex items-center gap-3 mb-4">
        <Shield className="w-5 h-5" style={{ color: 'var(--accent)' }} />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Workflow Enforcement
        </h2>
        <span
          className="px-2 py-0.5 text-xs rounded-full font-medium"
          style={{
            backgroundColor: config.mode === 'background-only'
              ? 'var(--status-danger-bg)'
              : config.mode === 'warn'
                ? 'var(--status-warning-bg)'
                : 'var(--bg-tertiary)',
            color: config.mode === 'background-only'
              ? 'var(--status-danger-text)'
              : config.mode === 'warn'
                ? 'var(--status-warning-text)'
                : 'var(--text-muted)',
          }}
        >
          {config.mode === 'background-only' ? 'Enforcing' : config.mode === 'warn' ? 'Warning' : 'Disabled'}
        </span>
      </div>

      <p className="text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        Control whether developers can implement directly in local sessions or must use background agents.
        When &quot;Background Only&quot; is enabled, local sessions are restricted to creating issues,
        reviewing output, and dispatching agents.
      </p>

      {/* Mode Selection */}
      <div className="space-y-3 mb-6">
        {MODE_OPTIONS.map((option) => (
          <label
            key={option.value}
            className="flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors"
            style={{
              backgroundColor: config.mode === option.value ? 'var(--bg-tertiary)' : 'transparent',
              border: `1px solid ${config.mode === option.value ? 'var(--accent)' : 'var(--border-subtle)'}`,
            }}
          >
            <input
              type="radio"
              name="workflow-enforcement-mode"
              value={option.value}
              checked={config.mode === option.value}
              onChange={() => handleModeChange(option.value)}
              className="mt-1"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {option.icon}
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {option.label}
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                {option.description}
              </p>
            </div>
          </label>
        ))}
      </div>

      {/* Active Mode Details */}
      {config.mode !== 'off' && (
        <div
          className="rounded-lg p-4 mb-4"
          style={{
            backgroundColor: config.mode === 'background-only' ? 'var(--status-danger-bg)' : 'var(--status-warning-bg)',
          }}
        >
          <div className="flex items-start gap-2">
            {config.mode === 'background-only' ? (
              <Lock className="w-4 h-4 mt-0.5" style={{ color: 'var(--status-danger-text)' }} />
            ) : (
              <AlertTriangle className="w-4 h-4 mt-0.5" style={{ color: 'var(--status-warning-text)' }} />
            )}
            <div>
              <p
                className="text-sm font-medium"
                style={{
                  color: config.mode === 'background-only' ? 'var(--status-danger-text)' : 'var(--status-warning-text)',
                }}
              >
                {config.mode === 'background-only'
                  ? 'Implementation tools are blocked in local sessions'
                  : 'Warnings will appear when developers use implementation tools locally'}
              </p>
              <div className="mt-2 space-y-1">
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  <strong>Blocked tools:</strong> {(config.blockedTools || DEFAULT_BLOCKED_TOOLS).join(', ')}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  <strong>Blocked bash patterns:</strong> git push, git commit, git add, npm/pnpm publish
                </p>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  <strong>Always allowed:</strong> Read, Grep, Glob, WebSearch, Task (orchestration tools)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Settings Toggle */}
      {config.mode !== 'off' && (
        <>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-sm mb-4 transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
          </button>

          {showAdvanced && (
            <div className="space-y-4">
              {/* Exempt Users */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>
                  <Users className="w-4 h-4" />
                  Exempt Users
                </label>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                  GitHub usernames that bypass enforcement (e.g., org admins for emergency access).
                </p>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={exemptUserInput}
                    onChange={(e) => setExemptUserInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddExemptUser()}
                    placeholder="GitHub username"
                    className="flex-1 px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-1"
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    onClick={handleAddExemptUser}
                    disabled={!exemptUserInput.trim()}
                    className="px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--bg-tertiary)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    Add
                  </button>
                </div>
                {(config.exemptUsers || []).length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {(config.exemptUsers || []).map((user) => (
                      <span
                        key={user}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs"
                        style={{
                          backgroundColor: 'var(--bg-tertiary)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        @{user}
                        <button
                          onClick={() => handleRemoveExemptUser(user)}
                          className="hover:opacity-70"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Custom Block Message */}
              <div>
                <label className="text-sm font-medium mb-2 block" style={{ color: 'var(--text-primary)' }}>
                  Custom Block Message
                </label>
                <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                  Message shown when a tool is blocked. Use {'{tool}'} and {'{org}'} as placeholders.
                </p>
                <textarea
                  value={config.blockMessage || ''}
                  onChange={(e) => onChange({ ...config, blockMessage: e.target.value || undefined })}
                  placeholder="Leave empty for default message"
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-1 font-mono"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
