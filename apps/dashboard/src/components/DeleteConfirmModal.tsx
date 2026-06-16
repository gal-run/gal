'use client'

import { AlertTriangle, X, Loader2 } from 'lucide-react'

interface DeleteConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  accountName: string
  accountType: 'Organization' | 'User' | 'Enterprise'
  isDeleting: boolean
  errorMessage?: string | null
}

export function DeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  accountName,
  accountType,
  isDeleting,
  errorMessage,
}: DeleteConfirmModalProps) {
  if (!isOpen) return null

  const isOrg = accountType === 'Organization' || accountType === 'Enterprise'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-md mx-4 rounded-xl shadow-2xl"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--status-danger-light)]">
              <AlertTriangle className="w-5 h-5 text-[var(--status-danger-text)]" />
            </div>
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Remove {isOrg ? 'Workspace' : 'Account'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--surface-overlay)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Are you sure you want to remove <strong style={{ color: 'var(--text-primary)' }}>{accountName}</strong>?
          </p>

          {/* Warning box */}
          <div
            className="p-4 rounded-lg mb-4"
            style={{ backgroundColor: 'var(--status-danger-light)', border: '1px solid var(--status-danger)' }}
          >
            <p className="text-sm font-medium mb-2 text-[var(--status-danger-text)]">This will permanently delete:</p>
            <ul className="text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>- The GAL GitHub App installation for this {isOrg ? 'workspace' : 'account'}</li>
              <li>- All scanned agent configurations and repository scan history</li>
              {isOrg && <li>- Workspace memberships, audit logs, and org-level settings</li>}
              <li>- This {isOrg ? 'workspace' : 'account'} from your GAL dashboard</li>
            </ul>
          </div>

          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            You can reconnect this {isOrg ? 'workspace' : 'account'} later by installing the GAL GitHub App again.
          </p>

          {errorMessage && (
            <div
              className="mt-4 rounded-lg border px-3 py-2 text-sm"
              style={{
                backgroundColor: 'var(--status-danger-light)',
                borderColor: 'var(--status-danger)',
                color: 'var(--status-danger-text)'
              }}
              role="alert"
            >
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm rounded-lg transition-colors"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)'
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 bg-[var(--status-danger)] hover:opacity-90 text-[var(--text-on-accent)] disabled:opacity-50"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Removing...
              </>
            ) : (
              'Remove'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
