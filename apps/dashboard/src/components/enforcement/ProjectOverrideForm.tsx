'use client'

import { useState } from 'react'
import { X, Save } from 'lucide-react'
import type { ProjectOverride } from '@/lib/api'

const POLICY_TYPES: { value: ProjectOverride['policyType']; label: string; description: string }[] = [
  { value: 'tool-allowlist', label: 'Tool Allowlist', description: 'Override which tools are allowed for this project' },
  { value: 'domain-allowlist', label: 'Domain Allowlist', description: 'Override which domains are accessible' },
  { value: 'model-allowlist', label: 'Model Allowlist', description: 'Override which AI models are permitted' },
  { value: 'custom', label: 'Custom Policy', description: 'Define a custom policy override' },
]

interface ProjectOverrideFormProps {
  repos: string[]
  onSave: (data: {
    projectName: string
    policyType: ProjectOverride['policyType']
    definition: Record<string, unknown>
  }) => Promise<void>
  onCancel: () => void
  saving?: boolean
}

export function ProjectOverrideForm({ repos, onSave, onCancel, saving }: ProjectOverrideFormProps) {
  const [projectName, setProjectName] = useState('')
  const [policyType, setPolicyType] = useState<ProjectOverride['policyType']>('tool-allowlist')
  const [definitionText, setDefinitionText] = useState('{\n  "allowed": []\n}')
  const [parseError, setParseError] = useState<string | null>(null)

  const handleSave = async () => {
    setParseError(null)
    let definition: Record<string, unknown>
    try {
      definition = JSON.parse(definitionText)
    } catch {
      setParseError('Invalid JSON. Please check the definition format.')
      return
    }
    if (!projectName.trim()) return
    await onSave({ projectName: projectName.trim(), policyType, definition })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-full max-w-lg rounded-xl shadow-xl max-h-[85vh] overflow-hidden flex flex-col"
        style={{ background: 'var(--surface-raised)', border: '1px solid var(--border-primary)' }}
      >
        <div className="flex items-center justify-between p-6 pb-4 flex-shrink-0" style={{ borderBottom: '1px solid var(--border-primary)' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Add Project Override
          </h2>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md hover:bg-[var(--surface-hover)] transition-colors"
          >
            <X className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto min-h-0">
          <div className="space-y-4">
          {/* Project selector */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Project
              </label>
              {repos.length > 0 ? (
                <select
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{
                    background: 'var(--surface-base)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="">Select a project...</option>
                  {repos.map((repo) => (
                    <option key={repo} value={repo}>{repo}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="owner/repo"
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{
                    background: 'var(--surface-base)',
                    border: '1px solid var(--border-primary)',
                    color: 'var(--text-primary)',
                  }}
                />
              )}
            </div>

            {/* Policy type selector */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Policy Type
              </label>
              <select
                value={policyType}
                onChange={(e) => setPolicyType(e.target.value as ProjectOverride['policyType'])}
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{
                  background: 'var(--surface-base)',
                  border: '1px solid var(--border-primary)',
                  color: 'var(--text-primary)',
                }}
              >
                {POLICY_TYPES.map((pt) => (
                  <option key={pt.value} value={pt.value}>{pt.label}</option>
                ))}
              </select>
              <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {POLICY_TYPES.find((pt) => pt.value === policyType)?.description}
              </p>
            </div>

            {/* Definition editor */}
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                Override Definition (JSON)
              </label>
              <textarea
                value={definitionText}
                onChange={(e) => {
                  setDefinitionText(e.target.value)
                  setParseError(null)
                }}
                rows={6}
                className="w-full rounded-lg px-3 py-2 text-sm font-mono"
                style={{
                  background: 'var(--surface-base)',
                  border: `1px solid ${parseError ? 'var(--status-error)' : 'var(--border-primary)'}`,
                  color: 'var(--text-primary)',
                  resize: 'vertical',
                }}
              />
              {parseError && (
                <p className="mt-1 text-xs" style={{ color: 'var(--status-error)' }}>
                  {parseError}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 p-6 pt-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border-primary)' }}>
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              border: '1px solid var(--border-primary)',
              color: 'var(--text-secondary)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!projectName.trim() || saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            style={{
              background: 'var(--interactive-primary)',
              color: 'var(--text-on-accent)',
            }}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Override'}
          </button>
        </div>
      </div>
    </div>
  )
}
