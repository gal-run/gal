'use client'

import { type FC, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Copy, Check, Loader2, ShieldCheck, ShieldAlert, Shield } from 'lucide-react'
import { getConfigPresentation } from './configPresentation'

/** Fixed-position tooltip that escapes overflow containers via portal */
const FixedTooltip: FC<{ text: string; children: React.ReactNode }> = ({ text, children }) => {
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const ref = useRef<HTMLDivElement>(null)

  const show = useCallback(() => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 6, left: rect.left })
    setVisible(true)
  }, [])

  const hide = useCallback(() => setVisible(false), [])

  return (
    <div ref={ref} onMouseEnter={show} onMouseLeave={hide} className="inline-flex min-w-0">
      {children}
      {visible &&
        createPortal(
          <span
            className="px-2 py-1 text-xs rounded whitespace-nowrap pointer-events-none"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-md)',
              zIndex: 9999,
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </div>
  )
}

interface ConfigViewerToolbarProps {
  configName: string
  configType: string
  platform?: string
  repo: string
  path: string
  lastModified: string
  content: string
  isMarkdown: boolean
  viewMode: 'source' | 'rendered'
  onViewModeChange: (mode: 'source' | 'rendered') => void
  isAdmin: boolean
  policyStatusLabel: string
  policyStatusTone: 'success' | 'warning' | 'neutral'
  primaryActionLabel?: string
  onPrimaryAction?: () => void
  secondaryActionLabel?: string
  onSecondaryAction?: () => void
  primaryActionPending?: boolean
  secondaryActionPending?: boolean
}

export const ConfigViewerToolbar: FC<ConfigViewerToolbarProps> = ({
  configName,
  configType,
  platform,
  repo,
  path,
  lastModified,
  content,
  isMarkdown,
  viewMode,
  onViewModeChange,
  isAdmin,
  policyStatusLabel,
  policyStatusTone,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  primaryActionPending = false,
  secondaryActionPending = false,
}) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const presentation = getConfigPresentation({ type: configType, platform, path })

  const formattedDate = new Date(lastModified).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const statusIcon = policyStatusTone === 'success'
    ? <ShieldCheck className="h-3.5 w-3.5" />
    : policyStatusTone === 'warning'
      ? <ShieldAlert className="h-3.5 w-3.5" />
      : <Shield className="h-3.5 w-3.5" />

  return (
    <div className="px-5 py-4 space-y-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Row 1: Config name and type */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-xl flex-shrink-0">{presentation.icon}</span>
        <h3 className="text-xl font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
          {configName}
        </h3>
        <span
          className="text-xs px-2 py-0.5 rounded flex-shrink-0"
          style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
        >
          {presentation.label}
        </span>
        {presentation.platformBadge && (
          <span
            className="text-xs px-2 py-0.5 rounded flex-shrink-0"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
          >
            {presentation.platformBadge}
          </span>
        )}
      </div>
      {presentation.detail && (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {presentation.detail}
        </p>
      )}

      {/* Row 2: Source info + actions */}
      <div className="flex flex-col gap-3">
        {/* Left: Source info */}
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          <span className="font-medium truncate" style={{ color: 'var(--text-secondary)' }}>
            {repo}
          </span>
          <span className="flex-shrink-0">•</span>
          <FixedTooltip text={path}>
            <code className="block min-w-0 max-w-full truncate text-xs">{path}</code>
          </FixedTooltip>
          <span className="flex-shrink-0">•</span>
          <span className="flex-shrink-0 whitespace-nowrap">Modified {formattedDate}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
            style={{
              backgroundColor: copied ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
              color: copied ? 'var(--accent)' : 'var(--text-secondary)',
              border: '1px solid var(--border-subtle)',
            }}
            title="Copy config contents"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{
              backgroundColor: policyStatusTone === 'success'
                ? 'var(--status-success-light)'
                : policyStatusTone === 'warning'
                  ? 'var(--status-warning-light)'
                  : 'var(--bg-tertiary)',
              color: policyStatusTone === 'success'
                ? 'var(--status-success-text)'
                : policyStatusTone === 'warning'
                  ? 'var(--status-warning-text)'
                  : 'var(--text-secondary)',
              border: `1px solid ${
                policyStatusTone === 'success'
                  ? 'var(--status-success)'
                  : policyStatusTone === 'warning'
                    ? 'var(--status-warning)'
                    : 'var(--border-subtle)'
              }`,
            }}
          >
            {statusIcon}
            {policyStatusLabel}
          </span>

          {/* Source/Rendered toggle for markdown */}
          {isMarkdown && (
            <div
              role="group"
              aria-label="Preview mode"
              className="flex items-center rounded-lg overflow-hidden"
              style={{ border: '1px solid var(--border-subtle)' }}
            >
              <button
                type="button"
                onClick={() => onViewModeChange('source')}
                aria-pressed={viewMode === 'source'}
                className="px-3 py-1.5 text-xs transition-colors"
                style={{
                  backgroundColor: viewMode === 'source' ? 'var(--accent)' : 'transparent',
                  color: viewMode === 'source' ? 'var(--text-on-accent)' : 'var(--text-muted)',
                }}
              >
                Source
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('rendered')}
                aria-pressed={viewMode === 'rendered'}
                className="px-3 py-1.5 text-xs transition-colors"
                style={{
                  backgroundColor: viewMode === 'rendered' ? 'var(--accent)' : 'transparent',
                  color: viewMode === 'rendered' ? 'var(--text-on-accent)' : 'var(--text-muted)',
                }}
              >
                Rendered
              </button>
            </div>
          )}

          {isAdmin && secondaryActionLabel && onSecondaryAction && (
            <button
              type="button"
              onClick={onSecondaryAction}
              disabled={secondaryActionPending || primaryActionPending}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {secondaryActionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />}
              {secondaryActionLabel}
            </button>
          )}

          {isAdmin && primaryActionLabel && onPrimaryAction && (
            <button
              type="button"
              onClick={onPrimaryAction}
              disabled={primaryActionPending || secondaryActionPending}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors whitespace-nowrap shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                backgroundColor: 'var(--interactive-primary)',
                color: 'var(--text-on-accent)',
                border: '1px solid color-mix(in srgb, var(--interactive-primary) 75%, black)',
              }}
            >
              {primaryActionPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {primaryActionLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
