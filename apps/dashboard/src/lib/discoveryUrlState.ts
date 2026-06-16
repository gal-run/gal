import type { DiscoveredConfigGroup } from './api'
import { getDiscoveryGroupKey, normalizeDiscoveredConfigType } from './discoveryPolicy'
import { DISCOVERY_TYPE_GUIDES } from './discoveryTypeGuidance'

function matchesTypeFilter(group: Pick<DiscoveredConfigGroup, 'type'>, filterType: string | null): boolean {
  if (!filterType) return true
  return normalizeDiscoveredConfigType(group.type) === filterType
}

export function parseDiscoveryTypeParam(value: string | null): string | null {
  if (!value) return null

  const normalizedValue = value.trim().toLowerCase()
  const guide = DISCOVERY_TYPE_GUIDES.find(({ filterType, label }) =>
    filterType.toLowerCase() === normalizedValue || label.toLowerCase() === normalizedValue,
  )

  return guide?.filterType ?? null
}

export function formatDiscoveryTypeParam(filterType: string | null): string | null {
  if (!filterType || filterType === 'all') return null
  return DISCOVERY_TYPE_GUIDES.find((guide) => guide.filterType === filterType)?.label ?? filterType
}

export function resolveDiscoverySelectedConfigKey(
  groups: DiscoveredConfigGroup[],
  itemParam: string | null,
  filterType: string | null,
): string | null {
  if (!itemParam) return null

  const candidateGroups = groups.filter((group) => matchesTypeFilter(group, filterType))
  const exactKeyMatch = candidateGroups.find((group) => getDiscoveryGroupKey(group) === itemParam)
  if (exactKeyMatch) {
    return getDiscoveryGroupKey(exactKeyMatch)
  }

  const namedMatches = candidateGroups.filter((group) => group.name === itemParam)
  if (namedMatches.length === 0) return null

  return getDiscoveryGroupKey(namedMatches[0]!)
}

export function retainDiscoverySelectedConfigKey(
  groups: DiscoveredConfigGroup[],
  selectedConfigKey: string | null,
  filterType: string | null,
): string | null {
  if (!selectedConfigKey) return null

  const selectedGroup = groups.find((group) => getDiscoveryGroupKey(group) === selectedConfigKey)
  if (!selectedGroup) return null

  return matchesTypeFilter(selectedGroup, filterType) ? selectedConfigKey : null
}

export function formatDiscoverySelectedItemParam(
  groups: DiscoveredConfigGroup[],
  selectedConfigKey: string | null,
  filterType: string | null,
): string | null {
  if (!selectedConfigKey) return null

  const selectedGroup = groups.find((group) => getDiscoveryGroupKey(group) === selectedConfigKey)
  if (!selectedGroup || !matchesTypeFilter(selectedGroup, filterType)) return null

  const relevantGroups = groups.filter((group) => matchesTypeFilter(group, filterType))
  const sameNameMatches = relevantGroups.filter((group) => group.name === selectedGroup.name)

  return sameNameMatches.length === 1 ? selectedGroup.name : selectedConfigKey
}
