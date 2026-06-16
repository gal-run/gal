import type { DiscoveredConfigGroup } from '@/lib/api'

export interface ConfigContentBatchEntry {
  content?: string
  sha?: string
  error?: string
}

export type ConfigPreviewFailureStatus = 'partial' | 'unavailable'

export interface ConfigPreviewFailureState {
  status: ConfigPreviewFailureStatus
  message: string
  availableCount: number
  failedCount: number
}

export interface VisibleConfigGroupOptions {
  searchQuery: string
  typeFilter: string
  statusFilter: string
  sortBy: string
}

export function isConfigGroupConsistent(group: DiscoveredConfigGroup): boolean {
  if (group.instances.length <= 1) return true

  const hashes = new Set(group.instances.map((instance) => instance.hash).filter(Boolean))
  return hashes.size <= 1
}

export function filterConfigGroups(
  groups: DiscoveredConfigGroup[],
  options: Pick<VisibleConfigGroupOptions, 'searchQuery' | 'typeFilter' | 'statusFilter'>,
): DiscoveredConfigGroup[] {
  const { searchQuery, typeFilter, statusFilter } = options

  return groups.filter((group) => {
    if (typeFilter !== 'all' && group.type !== typeFilter) {
      return false
    }

    if (searchQuery && !group.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }

    if (statusFilter === 'all') {
      return true
    }

    const hasMultipleRepos = group.instances.length > 1
    const isConsistent = isConfigGroupConsistent(group)

    if (statusFilter === 'approved') {
      return hasMultipleRepos && isConsistent
    }

    if (statusFilter === 'pending') {
      return !hasMultipleRepos
    }

    if (statusFilter === 'conflicts') {
      return hasMultipleRepos && !isConsistent
    }

    return true
  })
}

export function sortConfigGroups(groups: DiscoveredConfigGroup[], sortBy: string): DiscoveredConfigGroup[] {
  return [...groups].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'repos':
        return b.instances.length - a.instances.length
      case 'recent':
      default: {
        const aLatest = Math.max(...a.instances.map((instance) => new Date(instance.lastModified).getTime()))
        const bLatest = Math.max(...b.instances.map((instance) => new Date(instance.lastModified).getTime()))
        return bLatest - aLatest
      }
    }
  })
}

export function getVisibleConfigGroups(
  groups: DiscoveredConfigGroup[],
  options: VisibleConfigGroupOptions,
): DiscoveredConfigGroup[] {
  return sortConfigGroups(filterConfigGroups(groups, options), options.sortBy)
}

export function analyzeConfigContentBatchResults(
  results: Record<string, ConfigContentBatchEntry>,
  fallbackMessage: string,
): {
  contentEntries: Array<[string, string]>
  failure: ConfigPreviewFailureState | null
} {
  const entries = Object.entries(results)
  const contentEntries = entries.flatMap(([key, value]) =>
    typeof value?.content === 'string' ? ([[key, value.content]] as Array<[string, string]>) : [],
  )
  const failedEntries = entries.filter(([, value]) => typeof value?.content !== 'string')

  if (failedEntries.length === 0) {
    return { contentEntries, failure: null }
  }

  const firstError =
    failedEntries.find(([, value]) => typeof value?.error === 'string')?.[1]?.error || fallbackMessage

  if (contentEntries.length === 0) {
    return {
      contentEntries,
      failure: {
        status: 'unavailable',
        message: firstError,
        availableCount: 0,
        failedCount: failedEntries.length,
      },
    }
  }

  return {
    contentEntries,
    failure: {
      status: 'partial',
      message: `Config preview partially available — ${failedEntries.length} source${failedEntries.length === 1 ? '' : 's'} could not be loaded. Please re-sync your organization in Settings > GitHub.`,
      availableCount: contentEntries.length,
      failedCount: failedEntries.length,
    },
  }
}
