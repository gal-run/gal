'use client'

/**
 * ScreenshotArtifactView Component (#2124)
 *
 * Renders screenshot artifacts inline in the session chat view.
 * Shows a clickable thumbnail that expands to full-size with metadata.
 *
 * Features:
 * - Thumbnail preview (max 200px wide)
 * - Click to expand full-size in a modal
 * - Download button for the full-resolution image
 * - Source tool metadata (which MCP backend, capture mode)
 * - Timestamp and page URL display
 */

import { useState } from 'react'
import {
  Camera,
  Download,
  ExternalLink,
  X,
  Maximize2,
  Monitor,
  Globe,
} from 'lucide-react'

export interface ScreenshotArtifactData {
  id: string
  sessionId: string
  mode: 'viewport' | 'full_page' | 'element'
  backendId: string
  toolName: string
  format: 'png' | 'jpeg' | 'webp'
  base64Data?: string
  filePath?: string
  width?: number
  height?: number
  sizeBytes?: number
  pageUrl?: string
  pageTitle?: string
  capturedAt: string
  thumbnailBase64?: string
}

interface ScreenshotArtifactViewProps {
  artifact: ScreenshotArtifactData
  /** When true, renders in compact inline style */
  compact?: boolean
}

// Map backend IDs to display names
const BACKEND_DISPLAY_NAMES: Record<string, string> = {
  'chrome-devtools': 'Chrome DevTools MCP',
  playwright: 'Playwright MCP',
  'claude-chrome': 'Claude Chrome',
}

// Map capture modes to labels
const MODE_LABELS: Record<string, string> = {
  viewport: 'Viewport',
  full_page: 'Full Page',
  element: 'Element',
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getImageSrc(artifact: ScreenshotArtifactData): string | null {
  const data = artifact.thumbnailBase64 || artifact.base64Data
  if (!data) return null
  // If data already has the data URI prefix, use as-is
  if (data.startsWith('data:')) return data
  return `data:image/${artifact.format};base64,${data}`
}

function getFullImageSrc(artifact: ScreenshotArtifactData): string | null {
  const data = artifact.base64Data
  if (!data) return null
  if (data.startsWith('data:')) return data
  return `data:image/${artifact.format};base64,${data}`
}

/**
 * Full-screen modal for viewing screenshot at full resolution.
 */
function ScreenshotModal({
  artifact,
  onClose,
}: {
  artifact: ScreenshotArtifactData
  onClose: () => void
}) {
  const fullSrc = getFullImageSrc(artifact)

  const handleDownload = () => {
    if (!fullSrc) return
    const link = document.createElement('a')
    link.href = fullSrc
    link.download = `screenshot-${artifact.id}.${artifact.format}`
    link.click()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
      onClick={onClose}
      role="dialog"
      aria-label="Screenshot preview"
      aria-modal="true"
    >
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 rounded-t-lg" style={{ backgroundColor: 'var(--bg-card)' }}>
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
              Screenshot — {MODE_LABELS[artifact.mode] || artifact.mode}
            </span>
            {artifact.width && artifact.height && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {artifact.width}x{artifact.height}
              </span>
            )}
            {artifact.sizeBytes && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                ({formatFileSize(artifact.sizeBytes)})
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-1.5 rounded hover:bg-[var(--surface-overlay)] transition-colors"
              title="Download screenshot"
              aria-label="Download screenshot"
            >
              <Download className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-[var(--surface-overlay)] transition-colors"
              title="Close"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" style={{ color: 'var(--text-primary)' }} />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="overflow-auto rounded-b-lg" style={{ backgroundColor: 'var(--bg-primary)' }}>
          {fullSrc ? (
            <img
              src={fullSrc}
              alt={`Screenshot of ${artifact.pageTitle || artifact.pageUrl || 'page'}`}
              className="max-w-full max-h-[80vh] object-contain mx-auto"
            />
          ) : (
            <div className="flex items-center justify-center p-8" style={{ color: 'var(--text-muted)' }}>
              <span className="text-sm">Full-resolution image not available (saved to file)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Inline screenshot artifact view for session chat.
 */
export function ScreenshotArtifactView({ artifact, compact = false }: ScreenshotArtifactViewProps) {
  const [showModal, setShowModal] = useState(false)
  const thumbnailSrc = getImageSrc(artifact)
  const backendName = BACKEND_DISPLAY_NAMES[artifact.backendId] || artifact.backendId
  const modeLabel = MODE_LABELS[artifact.mode] || artifact.mode
  const capturedDate = new Date(artifact.capturedAt)

  if (compact) {
    // Compact inline view — just thumbnail + metadata badge
    return (
      <>
        <div
          className="inline-flex items-center gap-2 p-2 rounded-lg border cursor-pointer hover:bg-[var(--surface-overlay)] transition-colors"
          style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }}
          onClick={() => setShowModal(true)}
          role="button"
          aria-label="View screenshot"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setShowModal(true)}
        >
          {thumbnailSrc ? (
            <img
              src={thumbnailSrc}
              alt="Screenshot thumbnail"
              className="rounded"
              style={{ maxWidth: '120px', maxHeight: '80px', objectFit: 'contain' }}
            />
          ) : (
            <div
              className="flex items-center justify-center rounded"
              style={{ width: '120px', height: '80px', backgroundColor: 'var(--bg-tertiary)' }}
            >
              <Camera className="w-6 h-6" style={{ color: 'var(--text-muted)' }} />
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {modeLabel} Screenshot
            </span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              via {backendName}
            </span>
          </div>
          <Maximize2 className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
        </div>
        {showModal && <ScreenshotModal artifact={artifact} onClose={() => setShowModal(false)} />}
      </>
    )
  }

  // Full card view
  return (
    <>
      <div
        className="rounded-xl overflow-hidden border"
        style={{ backgroundColor: 'var(--bg-card)', borderColor: 'var(--border-subtle)' }}
      >
        {/* Header */}
        <div
          className="px-3 py-2 border-b flex items-center justify-between"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4" style={{ color: 'var(--accent)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              Screenshot Artifact
            </span>
            <span
              className="text-xs px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-muted)' }}
            >
              {modeLabel}
            </span>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {capturedDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        {/* Thumbnail */}
        <div
          className="p-3 cursor-pointer hover:bg-[var(--surface-overlay)] transition-colors"
          onClick={() => setShowModal(true)}
          role="button"
          aria-label="Expand screenshot"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setShowModal(true)}
        >
          {thumbnailSrc ? (
            <div className="relative group">
              <img
                src={thumbnailSrc}
                alt={`Screenshot of ${artifact.pageTitle || artifact.pageUrl || 'page'}`}
                className="rounded-lg border max-w-full"
                style={{
                  maxWidth: '400px',
                  maxHeight: '300px',
                  objectFit: 'contain',
                  borderColor: 'var(--border-subtle)',
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                <Maximize2 className="w-6 h-6" style={{ color: 'var(--text-on-accent)' }} />
              </div>
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-2 p-6 rounded-lg border"
              style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-tertiary)' }}
            >
              <Camera className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {artifact.filePath ? `Saved to ${artifact.filePath}` : 'Image data not available'}
              </span>
            </div>
          )}
        </div>

        {/* Metadata footer */}
        <div
          className="px-3 py-2 border-t flex items-center gap-3 flex-wrap"
          style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-tertiary)' }}
        >
          {/* Backend */}
          <div className="flex items-center gap-1">
            <Monitor className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {backendName}
            </span>
          </div>

          {/* Page URL */}
          {artifact.pageUrl && (
            <div className="flex items-center gap-1">
              <Globe className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
              <span
                className="text-xs truncate max-w-[200px]"
                title={artifact.pageUrl}
                style={{ color: 'var(--text-muted)' }}
              >
                {artifact.pageUrl}
              </span>
            </div>
          )}

          {/* Dimensions */}
          {artifact.width && artifact.height && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {artifact.width}x{artifact.height}
            </span>
          )}

          {/* File size */}
          {artifact.sizeBytes && (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {formatFileSize(artifact.sizeBytes)}
            </span>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* Actions */}
          {artifact.base64Data && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                const fullSrc = getFullImageSrc(artifact)
                if (!fullSrc) return
                const link = document.createElement('a')
                link.href = fullSrc
                link.download = `screenshot-${artifact.id}.${artifact.format}`
                link.click()
              }}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-[var(--surface-overlay)] transition-colors"
              style={{ color: 'var(--accent)' }}
              title="Download screenshot"
            >
              <Download className="w-3 h-3" />
              Download
            </button>
          )}

          {artifact.pageUrl && (
            <a
              href={artifact.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-[var(--surface-overlay)] transition-colors"
              style={{ color: 'var(--text-muted)' }}
              title="Open page URL"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink className="w-3 h-3" />
              Open
            </a>
          )}
        </div>
      </div>

      {showModal && <ScreenshotModal artifact={artifact} onClose={() => setShowModal(false)} />}
    </>
  )
}

export default ScreenshotArtifactView
