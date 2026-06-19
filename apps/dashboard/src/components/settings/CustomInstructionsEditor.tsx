'use client'

import { useState } from 'react'
import { Info, Eye, AlertTriangle, Check } from 'lucide-react'

interface CustomInstructionsEditorProps {
  value: string
  onChange: (value: string) => void
  provider: 'claude' | 'codex' | 'gemini'
}

const MAX_LENGTH = 4000
const WARN_LENGTH = 3000

/**
 * CustomInstructionsEditor - Explicit and previewable custom instructions (Issue #2002)
 *
 * Features:
 * - Clear scope explanation (org-wide, all dispatched sessions)
 * - Injection location details (appended to user prompt)
 * - Preview of effective prompt envelope
 * - Validation (length limits, unsafe content warnings)
 * - Provider-specific compatibility notes
 */
export function CustomInstructionsEditor({ value, onChange, provider }: CustomInstructionsEditorProps) {
  const [showPreview, setShowPreview] = useState(false)

  const charCount = value.length
  const isOverLimit = charCount > MAX_LENGTH
  const isNearLimit = charCount >= WARN_LENGTH

  // Compute validation errors and warnings (derived state, not in effect)
  const validationErrors: string[] = []
  const validationWarnings: string[] = []

  // Length validation
  if (isOverLimit) {
    validationErrors.push(`Instructions exceed ${MAX_LENGTH} character limit (currently ${charCount})`)
  } else if (isNearLimit) {
    validationWarnings.push(`Approaching character limit (${charCount}/${MAX_LENGTH})`)
  }

  // Empty/whitespace-only validation
  if (value.trim().length === 0 && value.length > 0) {
    validationWarnings.push('Instructions contain only whitespace and will be ignored')
  }

  // Unsafe content patterns (basic heuristics)
  const unsafePatterns = [
    { pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i, msg: 'Potential prompt injection detected' },
    { pattern: /system\s*:\s*/i, msg: 'Avoid using "System:" prefix - may interfere with agent prompts' },
    { pattern: /<\|[^|]*\|>/g, msg: 'Special tokens detected - may cause unexpected behavior' },
  ]

  for (const { pattern, msg } of unsafePatterns) {
    if (pattern.test(value)) {
      validationWarnings.push(msg)
    }
  }

  const hasIssues = validationErrors.length > 0 || validationWarnings.length > 0

  // Generate preview of effective prompt
  const generatePreview = () => {
    const userPrompt = 'Fix the authentication bug in user-service.ts'
    const systemContext = `You are a ${provider} coding agent running in a background session.
Working directory: /workspace/project-name
Branch: feature/auth-fix
Issue: #123 - Fix OAuth token refresh`

    return {
      system: systemContext,
      user: userPrompt,
      custom: value.trim() || '(No custom instructions)',
    }
  }

  const preview = generatePreview()

  return (
    <div className="space-y-4">
      {/* Scope and Behavior Explanation */}
      <div
        className="p-4 rounded-lg border"
        style={{
          backgroundColor: 'var(--accent-bg)',
          borderColor: 'var(--accent)',
        }}
      >
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
          <div className="space-y-2 text-sm">
            <div>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                Scope:
              </span>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>
                Organization-wide. Applied to <strong>all</strong> automatically dispatched background agents.
              </span>
            </div>
            <div>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                Injection:
              </span>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>
                Appended to the user prompt (after task description, before agent execution).
              </span>
            </div>
            <div>
              <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                When ignored:
              </span>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>
                Manual sessions (created via dashboard/CLI) do NOT receive these instructions.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Provider Compatibility Notes */}
      <div className="text-xs space-y-1" style={{ color: 'var(--text-muted)' }}>
        <div className="flex items-start gap-2">
          <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
            Provider compatibility:
          </span>
        </div>
        <ul className="space-y-1 ml-4 list-disc" style={{ color: 'var(--text-muted)' }}>
          <li>
            <strong>Claude:</strong> Supports full markdown formatting (headers, lists, code blocks)
          </li>
          <li>
            <strong>Codex:</strong> Plain text preferred; complex markdown may be misinterpreted
          </li>
          <li>
            <strong>Gemini:</strong> Supports markdown; keep formatting simple for best results
          </li>
        </ul>
      </div>

      {/* Textarea with validation */}
      <div className="space-y-2">
        <label
          className="block text-sm font-medium"
          style={{ color: 'var(--text-primary)' }}
          htmlFor="custom-instructions"
        >
          Custom Instructions
        </label>
        <textarea
          id="custom-instructions"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          maxLength={MAX_LENGTH}
          placeholder="Example:

- Follow our coding standards at /docs/standards
- Prefer TypeScript over JavaScript
- Test coverage must be ≥80%
- Use conventional commits format
- Always run `pnpm test` before committing"
          className={`w-full px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-1 resize-y font-mono ${
            isOverLimit ? 'focus:ring-[var(--status-danger)]' : ''
          }`}
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: isOverLimit ? '1px solid var(--status-danger)' : '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        />
        <div className="flex items-center justify-between text-xs">
          <span style={{ color: isOverLimit ? 'var(--status-danger-text)' : isNearLimit ? 'var(--status-warning-text)' : 'var(--text-muted)' }}>
            {charCount} / {MAX_LENGTH} characters
          </span>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
            style={{ color: 'var(--accent)' }}
          >
            <Eye className="w-3.5 h-3.5" />
            {showPreview ? 'Hide' : 'Show'} Preview
          </button>
        </div>
      </div>

      {/* Validation Messages */}
      {hasIssues && (
        <div className="space-y-2">
          {validationErrors.map((error, i) => (
            <div
              key={`error-${i}`}
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--status-danger-light)',
                border: '1px solid var(--status-danger)',
                color: 'var(--status-danger-text)',
              }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ))}
          {validationWarnings.map((warning, i) => (
            <div
              key={`warning-${i}`}
              className="flex items-start gap-2 p-3 rounded-lg text-sm"
              style={{
                backgroundColor: 'var(--status-warning-light)',
                border: '1px solid var(--status-warning)',
                color: 'var(--status-warning-text)',
              }}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Preview Panel */}
      {showPreview && (
        <div
          className="p-4 rounded-lg border space-y-4"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
            <Eye className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Effective Prompt Envelope
            </h4>
          </div>

          <div className="space-y-3 text-xs">
            {/* System Prompt */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>
                  System
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px]"
                  style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}
                >
                  Agent Context
                </span>
              </div>
              <pre
                className="p-2 rounded font-mono text-xs overflow-x-auto whitespace-pre-wrap"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {preview.system}
              </pre>
            </div>

            {/* User Prompt */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>
                  User
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px]"
                  style={{ backgroundColor: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}
                >
                  Task Description
                </span>
              </div>
              <pre
                className="p-2 rounded font-mono text-xs overflow-x-auto whitespace-pre-wrap"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {preview.user}
              </pre>
            </div>

            {/* Custom Instructions */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono font-medium" style={{ color: 'var(--text-secondary)' }}>
                  User (continued)
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px]"
                  style={{ backgroundColor: 'var(--badge-purple-bg)', color: 'var(--badge-purple-text)' }}
                >
                  Custom Instructions (Appended)
                </span>
              </div>
              <pre
                className="p-2 rounded font-mono text-xs overflow-x-auto whitespace-pre-wrap"
                style={{
                  backgroundColor: 'var(--bg-primary)',
                  color: value.trim() ? 'var(--text-primary)' : 'var(--text-muted)',
                  border: '1px solid var(--border-subtle)',
                  fontStyle: value.trim() ? 'normal' : 'italic',
                }}
              >
                {preview.custom}
              </pre>
            </div>
          </div>

          <div
            className="flex items-start gap-2 p-2 rounded text-xs"
            style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--text-secondary)' }}
          >
            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: 'var(--accent)' }} />
            <span>
              This preview shows how your custom instructions are combined with the task prompt. The agent
              receives the full envelope with system context, user task, and your custom instructions appended.
            </span>
          </div>
        </div>
      )}

      {/* Auditability Notice */}
      {value.trim() && !hasIssues && (
        <div
          className="flex items-start gap-2 p-3 rounded-lg text-xs"
          style={{
            backgroundColor: 'var(--surface-sunken)',
            border: '1px solid var(--border-default)',
            color: 'var(--status-success)',
          }}
        >
          <Check className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            Instructions are valid and will be versioned in Firestore. Changes are auditable via{' '}
            <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--badge-green-bg)' }}>
              updatedAt
            </code>{' '}
            and{' '}
            <code className="px-1 py-0.5 rounded" style={{ backgroundColor: 'var(--badge-green-bg)' }}>
              updatedBy
            </code>{' '}
            fields.
          </span>
        </div>
      )}
    </div>
  )
}
