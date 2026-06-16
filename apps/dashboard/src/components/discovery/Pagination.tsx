'use client'

/**
 * Pagination Component
 *
 * Task T8: Add Pagination Component (FR-011, FR-012, FR-013, FR-014)
 *
 * Props:
 * - currentPage: Current page number (1-indexed)
 * - totalItems: Total number of items
 * - pageSize: Items per page
 * - onPageChange: Callback when page changes
 */

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'

interface PaginationProps {
  currentPage: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

export function Pagination({ currentPage, totalItems, pageSize, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(totalItems / pageSize)
  const hasItems = totalItems > 0
  const startItem = hasItems ? (currentPage - 1) * pageSize + 1 : 0
  const endItem = hasItems ? Math.min(currentPage * pageSize, totalItems) : 0
  const showControls = totalPages > 1

  const handlePageChange = (page: number) => {
    if (page < 1 || page > totalPages) return
    onPageChange(page)
  }

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages: (number | string)[] = []
    const maxVisible = 5

    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
    } else {
      // Show first, last, and pages around current
      pages.push(1)

      if (currentPage > 3) {
        pages.push('...')
      }

      const start = Math.max(2, currentPage - 1)
      const end = Math.min(totalPages - 1, currentPage + 1)

      for (let i = start; i <= end; i++) {
        pages.push(i)
      }

      if (currentPage < totalPages - 2) {
        pages.push('...')
      }

      pages.push(totalPages)
    }

    return pages
  }

  return (
    <div data-testid="pagination" className="flex items-center justify-between gap-4 mt-4">
      {/* Info text */}
      <p data-testid="pagination-info" className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Showing {startItem}-{endItem} of {totalItems}
      </p>

      {/* Navigation controls */}
      {showControls && (
        <div className="flex items-center gap-1">
          {/* First page */}
          <button
            onClick={() => handlePageChange(1)}
            disabled={currentPage === 1}
            className="p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
              backgroundColor: 'var(--bg-tertiary)',
            }}
            title="First page"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>

          {/* Previous page */}
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              color: currentPage === 1 ? 'var(--text-muted)' : 'var(--text-primary)',
              backgroundColor: 'var(--bg-tertiary)',
            }}
            title="Previous page"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Page numbers */}
          <div className="flex items-center gap-1">
            {getPageNumbers().map((page, idx) => {
              if (page === '...') {
                return (
                  <span key={`ellipsis-${idx}`} className="px-2" style={{ color: 'var(--text-muted)' }}>
                    ...
                  </span>
                )
              }

              const pageNum = page as number
              const isActive = pageNum === currentPage

              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className="px-3 py-1.5 text-sm rounded transition-colors"
                  style={{
                    backgroundColor: isActive ? 'var(--accent)' : 'var(--bg-tertiary)',
                    color: isActive ? 'var(--text-on-accent)' : 'var(--text-primary)',
                    border: isActive ? 'none' : '1px solid var(--border-subtle)',
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  {pageNum}
                </button>
              )
            })}
          </div>

          {/* Next page */}
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
              backgroundColor: 'var(--bg-tertiary)',
            }}
            title="Next page"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Last page */}
          <button
            onClick={() => handlePageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="p-1.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              color: currentPage === totalPages ? 'var(--text-muted)' : 'var(--text-primary)',
              backgroundColor: 'var(--bg-tertiary)',
            }}
            title="Last page"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
