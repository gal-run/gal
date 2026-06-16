'use client'

import { type FC, useState, useMemo } from 'react'
import { X, Search, Sparkles, Loader2, Play } from 'lucide-react'
import type { SlashCommand } from '@/lib/api'

interface CommandSelectionModalProps {
  commands: SlashCommand[]
  onClose: () => void
  onSubmit: (command: string, args: string) => void
  isSubmitting?: boolean
}

export const CommandSelectionModal: FC<CommandSelectionModalProps> = ({
  commands,
  onClose,
  onSubmit,
  isSubmitting = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCommand, setSelectedCommand] = useState<SlashCommand | null>(null)
  const [args, setArgs] = useState('')

  // Group commands by category
  const groupedCommands = useMemo(() => {
    const filtered = commands.filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cmd.category.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const groups: Record<string, SlashCommand[]> = {}
    for (const cmd of filtered) {
      const category = cmd.category || 'Other'
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(cmd)
    }

    // Sort categories: SDLC first, then alphabetically
    const sortedCategories = Object.keys(groups).sort((a, b) => {
      if (a === 'SDLC') return -1
      if (b === 'SDLC') return 1
      return a.localeCompare(b)
    })

    return sortedCategories.map((category) => ({
      category,
      commands: groups[category],
    }))
  }, [commands, searchQuery])

  const handleSubmit = () => {
    if (!selectedCommand) return
    onSubmit(selectedCommand.name, args.trim())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        className="w-full max-w-2xl rounded-xl shadow-xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: 'var(--accent-bg)' }}
            >
              <Sparkles className="w-5 h-5" style={{ color: 'var(--accent)' }} />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                New Session
              </h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Select a command to start a new AI session
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
          <div
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <Search className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search commands..."
              className="flex-1 bg-transparent outline-none text-sm"
              style={{ color: 'var(--text-primary)' }}
              autoFocus
            />
          </div>
        </div>

        {/* Command List */}
        <div className="flex-1 overflow-y-auto p-4">
          {groupedCommands.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                No commands found matching &quot;{searchQuery}&quot;
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {groupedCommands.map(({ category, commands: cmds }) => (
                <div key={category}>
                  <h3
                    className="text-xs font-semibold uppercase tracking-wider mb-2 px-2"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {category}
                  </h3>
                  <div className="space-y-1">
                    {cmds.map((cmd) => (
                      <button
                        key={cmd.id}
                        onClick={() => setSelectedCommand(cmd)}
                        className="w-full text-left px-3 py-2.5 rounded-lg transition-colors"
                        style={{
                          backgroundColor:
                            selectedCommand?.id === cmd.id
                              ? 'var(--accent-bg)'
                              : 'transparent',
                          border:
                            selectedCommand?.id === cmd.id
                              ? '1px solid var(--accent)'
                              : '1px solid transparent',
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <code
                            className="text-sm font-medium shrink-0"
                            style={{
                              color:
                                selectedCommand?.id === cmd.id
                                  ? 'var(--accent)'
                                  : 'var(--text-primary)',
                            }}
                          >
                            {cmd.name}
                          </code>
                          <span
                            className="text-sm"
                            style={{ color: 'var(--text-muted)' }}
                          >
                            {cmd.description}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Command & Args */}
        {selectedCommand && (
          <div
            className="px-6 py-4 border-t"
            style={{ borderColor: 'var(--border-subtle)' }}
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
                Selected:
              </span>
              <code
                className="text-sm font-medium px-2 py-0.5 rounded"
                style={{
                  backgroundColor: 'var(--accent-bg)',
                  color: 'var(--accent)',
                }}
              >
                {selectedCommand.name}
              </code>
            </div>
            <div
              className="flex items-center gap-3 px-4 py-2.5 rounded-lg"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <input
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder="Arguments (e.g., #64, --dry-run)"
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: 'var(--text-primary)' }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
              />
            </div>
          </div>
        )}

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-3 px-6 py-4 border-t"
          style={{ borderColor: 'var(--border-subtle)' }}
        >
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedCommand || isSubmitting}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--text-on-accent)',
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Start Session
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
