import type {
  AgentPlatform,
  ApprovedConfigResponse,
  DiscoveredConfigGroup,
} from './api'
import type { StageSelection } from './approvalHandoff'

export type ApprovedConfigsByPlatform = Partial<Record<AgentPlatform, ApprovedConfigResponse>>

export interface PublishedPolicyItem {
  platform: AgentPlatform
  type: string
  name?: string
  sourceRepo?: string
  sourcePath?: string
  matchType: 'exact' | 'same-name' | 'singleton'
}

type GroupLike = Pick<DiscoveredConfigGroup, 'name' | 'type' | 'platform' | 'instances'>

export function normalizeDiscoveredConfigType(type: string): string {
  return type === 'agent' ? 'subagent' : type
}

function normalizeConfigName(value: string | undefined): string {
  if (!value) return ''
  const basename = value.split('/').pop() || value
  return basename
    .replace(/\.instructions\.md$/i, '')
    .replace(/\.agent\.md$/i, '')
    .replace(/\.mdc$/i, '')
    .replace(/\.json$/i, '')
    .replace(/\.md$/i, '')
    .toLowerCase()
}

function matchesInstanceSource(
  group: GroupLike,
  sourceRepo?: string,
  sourcePath?: string,
): boolean {
  if (!sourcePath) return false
  return group.instances.some((instance) => {
    if (instance.path !== sourcePath) return false
    if (sourceRepo && instance.repo && sourceRepo !== instance.repo) return false
    return true
  })
}

export function getDiscoveryGroupKey(group: Pick<GroupLike, 'name' | 'type' | 'platform'>): string {
  return `${group.platform || 'claude'}:${normalizeDiscoveredConfigType(group.type)}:${group.name}`
}

export function isPublishedInstance(
  publishedItem: PublishedPolicyItem | null,
  instance: { repo: string; path: string },
): boolean {
  if (!publishedItem?.sourcePath) return false
  if (publishedItem.sourcePath !== instance.path) return false
  if (publishedItem.sourceRepo && publishedItem.sourceRepo !== instance.repo) return false
  return true
}

export function getPublishedPolicyItem(
  group: GroupLike,
  approvedConfigs: ApprovedConfigsByPlatform,
): PublishedPolicyItem | null {
  const platform = (group.platform || 'claude') as AgentPlatform
  const approvedConfig = approvedConfigs[platform]

  if (!approvedConfig?.approved) return null

  const normalizedType = normalizeDiscoveredConfigType(group.type)

  if (group.type === 'instructions' && approvedConfig.instructions) {
    return {
      platform,
      type: group.type,
      name: 'instructions',
      sourceRepo: approvedConfig.instructions.sourceRepo,
      sourcePath: approvedConfig.instructions.sourcePath,
      matchType: matchesInstanceSource(
        group,
        approvedConfig.instructions.sourceRepo,
        approvedConfig.instructions.sourcePath,
      )
        ? 'exact'
        : 'singleton',
    }
  }

  if (group.type === 'settings' && approvedConfig.settings) {
    return {
      platform,
      type: group.type,
      name: 'settings',
      sourceRepo: approvedConfig.settings.sourceRepo,
      sourcePath: approvedConfig.settings.sourcePath,
      matchType: matchesInstanceSource(
        group,
        approvedConfig.settings.sourceRepo,
        approvedConfig.settings.sourcePath,
      )
        ? 'exact'
        : 'singleton',
    }
  }

  if (group.type === 'mcp' && approvedConfig.mcp) {
    return {
      platform,
      type: group.type,
      name: 'mcp',
      sourceRepo: approvedConfig.mcp.sourceRepo,
      sourcePath: approvedConfig.mcp.sourcePath,
      matchType: matchesInstanceSource(
        group,
        approvedConfig.mcp.sourceRepo,
        approvedConfig.mcp.sourcePath,
      )
        ? 'exact'
        : 'singleton',
    }
  }

  type ApprovedCollectionItem = {
    name?: string
    sourceRepo?: string
    sourcePath?: string
  }

  const collectionItems: ApprovedCollectionItem[] =
    group.type === 'workflow' || group.type === 'prompt'
      ? approvedConfig.commands || []
      : normalizedType === 'command'
      ? approvedConfig.commands || []
      : normalizedType === 'hook'
        ? approvedConfig.hooks || []
        : group.type === 'skill'
          ? approvedConfig.skills || []
        : normalizedType === 'subagent'
          ? approvedConfig.subagents || []
          : group.type === 'policy'
            ? approvedConfig.rules || []
          : normalizedType === 'rule'
            ? approvedConfig.rules || []
            : []

  if (collectionItems.length === 0) return null

  const exactItem = collectionItems.find((item) =>
    matchesInstanceSource(group, item.sourceRepo, item.sourcePath),
  )

  if (exactItem) {
      return {
        platform,
      type: normalizedType,
      name: exactItem.name,
      sourceRepo: exactItem.sourceRepo,
      sourcePath: exactItem.sourcePath,
      matchType: 'exact',
    }
  }

  const groupName = normalizeConfigName(group.name)
  const sameNameItem = collectionItems.find((item) => {
    const itemName = normalizeConfigName(item.name || item.sourcePath)
    return itemName === groupName
  })

  if (!sameNameItem) return null

  return {
    platform,
    type: normalizedType,
    name: sameNameItem.name,
    sourceRepo: sameNameItem.sourceRepo,
    sourcePath: sameNameItem.sourcePath,
    matchType: 'same-name',
  }
}

export type ConfigInstance = {
  repo: string
  path: string
  lastModified: string
  commitCount30d?: number
}

export function getRecommendedInstanceIndex(
  instances: ConfigInstance[],
  publishedItem: PublishedPolicyItem | null | undefined,
): number {
  if (!instances.length) return 0
  // Priority 1: published
  if (publishedItem) {
    const publishedIdx = instances.findIndex(i => isPublishedInstance(publishedItem, i))
    if (publishedIdx >= 0) return publishedIdx
  }
  // Priority 2: highest commit activity
  const mostActiveIdx = instances.reduce((best, inst, idx) =>
    (inst.commitCount30d ?? 0) > (instances[best]!.commitCount30d ?? 0) ? idx : best, 0)
  if ((instances[mostActiveIdx]!.commitCount30d ?? 0) > 0) return mostActiveIdx
  // Priority 3: most recent
  return instances.reduce((best, inst, idx) =>
    new Date(inst.lastModified) > new Date(instances[best]!.lastModified) ? idx : best, 0)
}

export function groupSelectionsByPlatform(
  selections: StageSelection[],
): Map<AgentPlatform, StageSelection[]> {
  const grouped = new Map<AgentPlatform, StageSelection[]>()

  for (const selection of selections) {
    const platform = (selection.platform || 'claude') as AgentPlatform
    const current = grouped.get(platform) || []
    current.push({ ...selection, platform })
    grouped.set(platform, current)
  }

  return grouped
}
