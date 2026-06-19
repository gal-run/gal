'use client'

import { type FC, useState } from 'react'
import { Search, X, SlidersHorizontal } from 'lucide-react'

interface ConfigFiltersProps {
  searchQuery: string
  onSearchChange: (query: string) => void
  typeFilter: string
  onTypeFilterChange: (type: string) => void
  statusFilter: string
  onStatusFilterChange: (status: string) => void
  sortBy: string
  onSortByChange: (sort: string) => void
}

export const ConfigFilters: FC<ConfigFiltersProps> = ({
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false)

  // Calculate active filter count
  const activeFilterCount = [
    typeFilter !== 'all' ? 1 : 0,
    statusFilter !== 'all' ? 1 : 0,
    sortBy !== 'recent' ? 1 : 0,
  ].reduce((sum, val) => sum + val, 0)

  return (
    <div className="flex flex-col gap-3 p-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {/* Search input with filter toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            placeholder="Search configs..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-2 text-sm rounded-lg"
            style={{
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-[var(--surface-overlay-hover)]"
              style={{ color: 'var(--text-muted)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter toggle button */}
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="relative px-3 py-2 text-sm rounded-lg flex items-center gap-2 transition-colors"
          style={{
            backgroundColor: filtersOpen ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
            border: filtersOpen ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
            color: filtersOpen ? 'var(--accent)' : 'var(--text-primary)',
          }}
        >
          <SlidersHorizontal className="w-4 h-4" />
          {activeFilterCount > 0 && (
            <span
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs flex items-center justify-center"
              style={{
                backgroundColor: 'var(--accent)',
                color: 'var(--text-on-accent)',
              }}
            >
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {/* Filter dropdowns - collapsed by default */}
      {filtersOpen && (
        <div className="flex flex-wrap gap-2">
        {/* Type filter */}
        <select
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value)}
          className="flex-1 min-w-[100px] px-2 py-1.5 text-xs rounded-lg truncate"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="all">All Types</option>
          <option value="instructions">AGENTS.md</option>
          <option value="command">Commands</option>
          <option value="rule">Rules</option>
          <option value="hook">Hooks</option>
          <option value="mcp">MCP</option>
          <option value="settings">Settings</option>
          <option value="subagent">Subagents</option>
          <option value="skill">Skills</option>
          <option value="policy">Policies</option>
          <option value="workflow">Workflows</option>
          <option value="prompt">Prompts</option>
          <option value="agent">Agents</option>
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="flex-1 min-w-[90px] px-2 py-1.5 text-xs rounded-lg truncate"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="all">All Status</option>
          <option value="approved">Consistent</option>
          <option value="pending">Single Repo</option>
          <option value="conflicts">Conflicts</option>
        </select>

        {/* Sort dropdown */}
        <select
          value={sortBy}
          onChange={(e) => onSortByChange(e.target.value)}
          className="flex-1 min-w-[100px] px-2 py-1.5 text-xs rounded-lg truncate"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="recent">Recent</option>
          <option value="name">Name</option>
          <option value="repos">Repos</option>
        </select>
        </div>
      )}
    </div>
  )
}
