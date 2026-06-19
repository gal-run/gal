'use client'

import { X, FileCode, Calendar, Database } from 'lucide-react'
import { PlatformIcon } from './PlatformBadge'
import type { AgentPlatform } from '@/lib/api'

interface ConfigDetailsModalProps {
  isOpen: boolean
  onClose: () => void
  config: {
    platform: AgentPlatform
    fileName: string
    content: string
    storageUrl?: string
    lastUpdated?: Date
  } | null
}

export function ConfigDetailsModal({ isOpen, onClose, config }: ConfigDetailsModalProps) {
  if (!isOpen || !config) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="dashboard-card w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[var(--accent-bg)] flex items-center justify-center">
              <PlatformIcon platform={config.platform} className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">{config.fileName}</h2>
              <p className="text-sm text-[var(--text-secondary)] capitalize">{config.platform} Configuration</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--surface-overlay)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {/* Metadata */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-overlay)]">
              <FileCode className="w-5 h-5 text-[var(--accent)]" />
              <div>
                <p className="text-xs text-[var(--text-secondary)]">File Type</p>
                <p className="text-sm font-medium text-[var(--text-primary)]">
                  {config.fileName.endsWith('.json') ? 'JSON' :
                   config.fileName.endsWith('.md') ? 'Markdown' :
                   config.fileName.endsWith('.mdc') ? 'MDC' : 'Text'}
                </p>
              </div>
            </div>
            {config.lastUpdated && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-overlay)]">
                <Calendar className="w-5 h-5 text-[var(--accent)]" />
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">Last Updated</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {new Date(config.lastUpdated).toLocaleDateString()}
                  </p>
                </div>
              </div>
            )}
            {config.storageUrl && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-[var(--surface-overlay)]">
                <Database className="w-5 h-5 text-[var(--accent)]" />
                <div>
                  <p className="text-xs text-[var(--text-secondary)]">Storage</p>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Firebase</p>
                </div>
              </div>
            )}
          </div>

          {/* Code Preview */}
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Content Preview</h3>
            <div className="terminal-output p-4 max-h-96 overflow-auto">
              <pre className="text-xs text-[var(--status-success-text)] whitespace-pre-wrap break-words">
                {config.content}
              </pre>
            </div>
          </div>

          {/* Actions */}
          {config.storageUrl && (
            <div className="flex gap-3">
              <a
                href={config.storageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                View in Storage
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
