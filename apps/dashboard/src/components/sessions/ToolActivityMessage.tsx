'use client'

/**
 * ToolActivityMessage Component
 *
 * Displays tool activity inline in chat, similar to claude.ai/code.
 * Shows compact list of tools with icons, status, and expandable details.
 *
 * Compact tree-line style (GAL-1459):
 * When `compact` prop is true, tools are rendered using tree-line markers
 * for improved visual grouping and readability in session logs.
 */

import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  FileText,
  Edit3,
  CheckCircle2,
  XCircle,
  Search,
  Globe,
  Code,
  FileCode,
  FileSearch,
  GitBranch,
  Plug,
} from 'lucide-react'

export interface ToolActivity {
  id: string
  name: string
  status: 'pending' | 'success' | 'error'
  summary: string
  timestamp?: Date
  input?: Record<string, unknown>
  result?: unknown
  error?: string
}

interface ToolActivityMessageProps {
  tools: ToolActivity[]
  timestamp: Date
  /** When true, renders tools in compact tree-line style instead of card layout (GAL-1459). */
  compact?: boolean
}

const TOOL_PAYLOAD_TRUNCATION_LIMIT = 2000
const TOOL_PAYLOAD_TRUNCATION_MARKER = '[truncated]'

// Get color for status
function getStatusColor(status: ToolActivity['status']) {
  switch (status) {
    case 'pending':
      return 'var(--status-warning)'
    case 'success':
      return 'var(--text-primary)'
    case 'error':
      return 'var(--status-danger)'
  }
}

function normalizePayloadValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined || value === null) return ''
  return JSON.stringify(value, null, 2)
}

function truncatePayload(value: string, limit = TOOL_PAYLOAD_TRUNCATION_LIMIT): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n${TOOL_PAYLOAD_TRUNCATION_MARKER}`
}

function renderInputBlock(label: string, value: string) {
  return (
    <div>
      <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
        {label}:
      </div>
      <pre
        className="text-xs p-2 rounded overflow-x-auto font-mono"
        style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
      >
        {value}
      </pre>
    </div>
  )
}

// Format tool input for display
function formatToolInput(tool: ToolActivity): string {
  const input = tool.input || {}

  switch (tool.name.toLowerCase()) {
    case 'bash':
      return (input['command'] as string) || ''
    case 'read':
      return (input['file_path'] as string) || ''
    case 'write':
    case 'edit':
      return (input['file_path'] as string) || ''
    case 'grep':
      return `"${input['pattern'] || ''}" in ${input['path'] || '.'}`
    case 'glob':
      return (input['pattern'] as string) || ''
    case 'websearch':
      return (input['query'] as string) || ''
    case 'webfetch':
      return (input['url'] as string) || ''
    default:
      return JSON.stringify(input, null, 2)
  }
}

function renderToolInputContent(tool: ToolActivity) {
  const toolName = tool.name.toLowerCase()
  if (toolName === 'write' || toolName === 'edit') {
    const input = tool.input || {}
    const filePath = normalizePayloadValue(input['file_path'])
    if (toolName === 'edit') {
      const oldString = truncatePayload(normalizePayloadValue(input['old_string']))
      const newString = truncatePayload(normalizePayloadValue(input['new_string']))
      return (
        <div className="space-y-2">
          {renderInputBlock('File', filePath)}
          {renderInputBlock('Old', oldString)}
          {renderInputBlock('New', newString)}
        </div>
      )
    }
    const content = truncatePayload(normalizePayloadValue(input['content']))
    return (
      <div className="space-y-2">
        {renderInputBlock('File', filePath)}
        {renderInputBlock('Content', content)}
      </div>
    )
  }

  return (
    <pre
      className="text-xs p-2 rounded overflow-x-auto font-mono"
      style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
    >
      {formatToolInput(tool)}
    </pre>
  )
}

// Format tool result for display
function formatToolResult(result: unknown): string {
  if (typeof result === 'string') {
    return result
  }
  if (Array.isArray(result)) {
    return result.map((item) => JSON.stringify(item)).join('\n')
  }
  return JSON.stringify(result, null, 2)
}

// Tool icon component - renders the appropriate icon based on tool name
function ToolIcon({ toolName, className, style }: { toolName: string; className?: string; style?: React.CSSProperties }) {
  const props = { className, style }

  switch (toolName.toLowerCase()) {
    case 'bash':
    case 'execute':
      return <Terminal {...props} />
    case 'read':
    case 'readfile':
      return <FileText {...props} />
    case 'write':
    case 'writefile':
    case 'edit':
      return <Edit3 {...props} />
    case 'grep':
    case 'search':
      return <Search {...props} />
    case 'glob':
      return <FileSearch {...props} />
    case 'webfetch':
    case 'websearch':
      return <Globe {...props} />
    case 'task':
    case 'agent':
      return <GitBranch {...props} />
    case 'mcp':
      return <Plug {...props} />
    default:
      // Check for common patterns
      if (toolName.toLowerCase().includes('file')) return <FileCode {...props} />
      if (toolName.toLowerCase().includes('mcp')) return <Plug {...props} />
      return <Code {...props} />
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tree-line compact helpers (GAL-1459)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the tree-line prefix for a tool row in the compact view.
 */
export function getTreeLineMarker(index: number, total: number): string {
  if (total <= 1) return '\u2514\u2500'
  return index < total - 1 ? '\u251C\u2500' : '\u2514\u2500'
}

/**
 * Compact, single-line tool row rendered with a tree-line prefix (GAL-1459).
 */
function CompactToolItem({
  tool,
  index,
  total,
}: {
  tool: ToolActivity
  index: number
  total: number
}) {
  const shouldExpandByDefault = tool.name.toLowerCase() === 'write' || tool.name.toLowerCase() === 'edit'
  const [isExpanded, setIsExpanded] = useState(shouldExpandByDefault)
  const statusColor = getStatusColor(tool.status)
  const marker = getTreeLineMarker(index, total)
  const hasInput = tool.input !== undefined && Object.keys(tool.input).length > 0
  const hasResult = tool.status === 'success' && tool.result !== undefined
  const hasError = tool.status === 'error' && tool.error !== undefined
  const isLast = index === total - 1

  return (
    <div
      className={!isLast ? 'border-b' : ''}
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      {/* Tree-line row */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-1.5 px-2 py-1.5 hover:bg-[var(--surface-overlay)] transition-colors text-left"
        aria-expanded={isExpanded}
        aria-label={`${tool.name}: ${tool.summary}`}
      >
        {/* Tree-line marker */}
        <span
          className="font-mono text-xs flex-shrink-0 select-none"
          style={{ color: 'var(--text-muted)', minWidth: '1.5rem' }}
          aria-hidden="true"
        >
          {marker}
        </span>

        <ToolIcon toolName={tool.name} className="w-3.5 h-3.5 flex-shrink-0" style={{ color: statusColor }} />

        <span className="text-xs font-medium flex-shrink-0" style={{ color: statusColor }}>
          {tool.name}
        </span>

        <span className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-muted)' }}>
          {tool.summary}
        </span>

        {/* Diff badge for edit/write */}
        {(tool.name.toLowerCase() === 'edit' || tool.name.toLowerCase() === 'write') && tool.input && (
          (() => {
            const oldStr = (tool.input['old_string'] as string) || ''
            const newStr = (tool.input['new_string'] as string) || (tool.input['content'] as string) || ''
            const oldLines = oldStr ? oldStr.split('\n').length : 0
            const newLines = newStr ? newStr.split('\n').length : 0
            if (oldLines === 0 && newLines === 0) return null
            return (
              <span className="flex items-center gap-1 text-xs flex-shrink-0">
                {newLines > 0 && <span className="text-[var(--text-tertiary)]">+{newLines}</span>}
                {oldLines > 0 && <span className="text-[var(--status-danger-text)]">-{oldLines}</span>}
              </span>
            )
          })()
        )}

        {/* Status indicator */}
        {tool.status === 'pending' && (
          <div className="flex items-center gap-0.5 flex-shrink-0" aria-label="In progress">
            <div className="w-1 h-1 rounded-full animate-bounce" style={{ backgroundColor: statusColor, animationDelay: '0ms' }} />
            <div className="w-1 h-1 rounded-full animate-bounce" style={{ backgroundColor: statusColor, animationDelay: '150ms' }} />
            <div className="w-1 h-1 rounded-full animate-bounce" style={{ backgroundColor: statusColor, animationDelay: '300ms' }} />
          </div>
        )}
        {tool.status === 'success' && (
          <CheckCircle2 className="w-3 h-3 flex-shrink-0" style={{ color: statusColor }} aria-label="Success" />
        )}
        {tool.status === 'error' && (
          <XCircle className="w-3 h-3 flex-shrink-0" style={{ color: statusColor }} aria-label="Error" />
        )}

        {/* Expand chevron */}
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
        ) : (
          <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
        )}
      </button>

      {/* Inline expanded details */}
      {isExpanded && (
        <div
          className="px-3 pb-3 ml-8 space-y-2 border-l"
          style={{ backgroundColor: 'var(--bg-tertiary)', borderColor: 'var(--border-subtle)' }}
        >
          {hasInput && (
            <div>
              <div className="text-xs mb-1 mt-2" style={{ color: 'var(--text-muted)' }}>Input:</div>
              {renderToolInputContent(tool)}
            </div>
          )}
          {hasResult && (
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Result:</div>
              <pre
                className="text-xs p-2 rounded overflow-x-auto max-h-48 font-mono"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                {formatToolResult(tool.result)}
              </pre>
            </div>
          )}
          {hasError && (
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--status-danger)' }}>Error:</div>
              <pre
                className="text-xs p-2 rounded overflow-x-auto font-mono"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--status-danger)' }}
              >
                {tool.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Individual tool item
function ToolItem({ tool }: { tool: ToolActivity }) {
  const shouldExpandByDefault = tool.name.toLowerCase() === 'write' || tool.name.toLowerCase() === 'edit'
  const [isExpanded, setIsExpanded] = useState(shouldExpandByDefault)
  const statusColor = getStatusColor(tool.status)
  const hasInput = tool.input !== undefined && Object.keys(tool.input).length > 0
  const hasResult = tool.status === 'success' && tool.result !== undefined
  const hasError = tool.status === 'error' && tool.error !== undefined

  return (
    <div className="border-b last:border-b-0" style={{ borderColor: 'var(--border-subtle)' }}>
      {/* Compact tool header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[var(--surface-overlay)] transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        ) : (
          <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        )}
        <ToolIcon toolName={tool.name} className="w-4 h-4 flex-shrink-0" style={{ color: statusColor }} />
        <span className="text-xs font-medium flex-shrink-0" style={{ color: statusColor }}>
          {tool.name}
        </span>
        <span className="text-xs truncate flex-1 min-w-0" style={{ color: 'var(--text-muted)' }}>
          {tool.summary}
        </span>
        {/* Diff badge for edit/write */}
        {(tool.name.toLowerCase() === 'edit' || tool.name.toLowerCase() === 'write') && tool.input && (
          (() => {
            const oldStr = (tool.input['old_string'] as string) || ''
            const newStr = (tool.input['new_string'] as string) || (tool.input['content'] as string) || ''
            const oldLines = oldStr ? oldStr.split('\n').length : 0
            const newLines = newStr ? newStr.split('\n').length : 0
            if (oldLines === 0 && newLines === 0) return null
            return (
              <span className="flex items-center gap-1 text-xs flex-shrink-0">
                {newLines > 0 && <span className="text-[var(--text-tertiary)]">+{newLines}</span>}
                {oldLines > 0 && <span className="text-[var(--status-danger-text)]">-{oldLines}</span>}
              </span>
            )
          })()
        )}
        {tool.status === 'pending' && (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: statusColor, animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: statusColor, animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: statusColor, animationDelay: '300ms' }} />
          </div>
        )}
        {tool.status === 'success' && (
          <CheckCircle2 className="w-3 h-3 flex-shrink-0" style={{ color: statusColor }} />
        )}
        {tool.status === 'error' && (
          <XCircle className="w-3 h-3 flex-shrink-0" style={{ color: statusColor }} />
        )}
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-2" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
          {/* Input */}
          {hasInput && (
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                Input:
              </div>
              {renderToolInputContent(tool)}
            </div>
          )}

          {/* Result */}
          {hasResult && (
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                Result:
              </div>
              <pre
                className="text-xs p-2 rounded overflow-x-auto max-h-48 font-mono"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}
              >
                {formatToolResult(tool.result)}
              </pre>
            </div>
          )}

          {/* Error */}
          {hasError && (
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--status-danger)' }}>
                Error:
              </div>
              <pre
                className="text-xs p-2 rounded overflow-x-auto font-mono"
                style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--status-danger)' }}
              >
                {tool.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Main component
export function ToolActivityMessage({ tools, timestamp, compact = false }: ToolActivityMessageProps) {
  if (compact) {
    // Compact tree-line style (GAL-1459): no card header, just the indented rows
    return (
      <div
        className="rounded-lg overflow-hidden border"
        style={{
          backgroundColor: 'var(--bg-card)',
          borderColor: 'var(--border-subtle)',
        }}
        role="list"
        aria-label={`${tools.length} tool${tools.length === 1 ? '' : 's'}`}
      >
        {tools.map((tool, index) => (
          <div key={tool.id} role="listitem">
            <CompactToolItem tool={tool} index={index} total={tools.length} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div
      className="rounded-xl overflow-hidden border"
      style={{
        backgroundColor: 'var(--bg-card)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4" style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Tool Activity
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
          </span>
        </div>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      {/* Tool list */}
      <div>
        {tools.map((tool) => (
          <ToolItem key={tool.id} tool={tool} />
        ))}
      </div>
    </div>
  )
}

export default ToolActivityMessage
