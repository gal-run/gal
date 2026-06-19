'use client'

/**
 * useBulkSelection Hook
 *
 * Task T5: Create useBulkSelection Hook (FR-007, FR-008, FR-009)
 *
 * Interface:
 * - selectedIds: Set<string> - tracks selected items by ID
 * - toggle: (id: string) => void - add/remove single item
 * - selectAll: (ids: string[]) => void - select all provided IDs (current page)
 * - selectAllPages: (ids: string[]) => void - select all IDs across all pages
 * - clearAll: () => void - deselect everything
 * - isSelected: (id: string) => boolean - check if selected
 * - count: number - number of selected items
 * - allAcrossPages: boolean - whether cross-page selection is active
 */

import { useState, useCallback } from 'react'

export interface UseBulkSelection {
  selectedIds: Set<string>
  toggle: (id: string) => void
  selectAll: (ids: string[]) => void
  selectAllPages: (ids: string[]) => void
  clearAll: () => void
  isSelected: (id: string) => boolean
  count: number
  allAcrossPages: boolean
}

export function useBulkSelection(): UseBulkSelection {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [allAcrossPages, setAllAcrossPages] = useState(false)

  const toggle = useCallback((id: string) => {
    setAllAcrossPages(false)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const selectAll = useCallback((ids: string[]) => {
    setAllAcrossPages(false)
    setSelectedIds(new Set(ids))
  }, [])

  const selectAllPages = useCallback((ids: string[]) => {
    setAllAcrossPages(true)
    setSelectedIds(new Set(ids))
  }, [])

  const clearAll = useCallback(() => {
    setAllAcrossPages(false)
    setSelectedIds(new Set())
  }, [])

  const isSelected = useCallback(
    (id: string) => {
      return selectedIds.has(id)
    },
    [selectedIds]
  )

  return {
    selectedIds,
    toggle,
    selectAll,
    selectAllPages,
    clearAll,
    isSelected,
    count: selectedIds.size,
    allAcrossPages,
  }
}
