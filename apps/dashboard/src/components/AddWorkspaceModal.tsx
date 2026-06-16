'use client'

import { X, User, Building2 } from 'lucide-react'

interface AddWorkspaceModalProps {
  isOpen: boolean
  onClose: () => void
  githubAppSlug: string
  isAdmin?: boolean // GAL-134: Only show org option for admins
}

export function AddWorkspaceModal({ isOpen, onClose, githubAppSlug, isAdmin = false }: AddWorkspaceModalProps) {
  if (!isOpen) return null

  const installUrl = `https://github.com/apps/${githubAppSlug}/installations/new`

  const handleSelect = () => {
    // Both go to same GitHub URL - GitHub will show appropriate options
    window.location.href = installUrl
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-xl"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-subtle)'
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-6"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Add Workspace
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="p-6 space-y-4">
          <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            What type of workspace do you want to connect?
          </p>

          {/* Personal Account Option */}
          <button
            onClick={handleSelect}
            className="w-full p-4 rounded-lg transition-all text-left group"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)'
              e.currentTarget.style.backgroundColor = 'var(--accent-bg)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-subtle)'
              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
            }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: 'var(--accent-bg)' }}
              >
                <User className="w-6 h-6" style={{ color: 'var(--accent)' }} />
              </div>
              <div>
                <h3
                  className="font-medium transition-colors"
                  style={{ color: 'var(--text-primary)' }}
                >
                  Personal Account
                </h3>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  Connect your personal GitHub repositories
                </p>
              </div>
            </div>
          </button>

          {/* Organization Option - GAL-134: Only show for admins */}
          {isAdmin && (
            <button
              onClick={handleSelect}
              className="w-full p-4 rounded-lg transition-all text-left group"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)'
                e.currentTarget.style.backgroundColor = 'var(--accent-bg)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-subtle)'
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'
              }}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: 'var(--accent-bg)' }}
                >
                  <Building2 className="w-6 h-6" style={{ color: 'var(--accent)' }} />
                </div>
                <div>
                  <h3
                    className="font-medium transition-colors"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    Organization
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    Connect a GitHub organization you manage
                  </p>
                </div>
              </div>
            </button>
          )}

          <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
            You'll be redirected to GitHub to complete the installation
          </p>
        </div>
      </div>
    </div>
  )
}
