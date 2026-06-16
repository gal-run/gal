import {
  DEFAULT_ENFORCEMENT_SETTINGS,
  type EnforcementSettings,
} from '@gal/types'
import type { ApprovedConfig } from './repositories/IConfigRepository'

export interface ApprovedConfigEnforcementManifest {
  platform: string
  hash: string
  version: string
  approvedAt: string
  approvedBy: string
  enforcementSettings: EnforcementSettings
  allowedDomains: string[]
  allowedExecutables: string[]
  hasMcp: boolean
  hasEnvironment: boolean
}

function uniqueStrings(values: Iterable<string>): string[] {
  return Array.from(
    new Set(
      Array.from(values)
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
  )
}

function tryParseJson(content?: string | null): Record<string, unknown> | null {
  if (!content || content.trim().length === 0) {
    return null
  }

  try {
    const parsed = JSON.parse(content) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

function extractHostname(value: string): string | null {
  try {
    const normalized = value.includes('://') ? value : `https://${value}`
    return new URL(normalized).hostname.toLowerCase()
  } catch {
    return null
  }
}

function extractUrlsFromText(content: string): string[] {
  const matches = content.match(/https?:\/\/[^\s"'`<>]+/g) ?? []
  return uniqueStrings(matches)
}

function extractMcpServerDomains(data: Record<string, unknown>): string[] {
  const domains: string[] = []
  const mcpServers = data['mcpServers']
  if (!mcpServers || typeof mcpServers !== 'object' || Array.isArray(mcpServers)) {
    return domains
  }

  for (const server of Object.values(mcpServers as Record<string, unknown>)) {
    if (!server || typeof server !== 'object' || Array.isArray(server)) {
      continue
    }
    const url = (server as Record<string, unknown>)['url']
    if (typeof url !== 'string') {
      continue
    }
    const hostname = extractHostname(url)
    if (hostname) {
      domains.push(hostname)
    }
  }

  return domains
}

function extractInterpreterFromShebang(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('#!')) {
    return null
  }

  const parts = trimmed.slice(2).trim().split(/\s+/)
  if (parts.length === 0) {
    return null
  }

  if (parts[0] === '/usr/bin/env' && parts[1]) {
    return parts[1]
  }

  const interpreterPath = parts[0]
  if (!interpreterPath) {
    return null
  }
  const pathParts = interpreterPath.split('/')
  return pathParts[pathParts.length - 1] || null
}

function extractExecutableFromCommandLine(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }

  const withoutPrompt = trimmed.startsWith('$') ? trimmed.slice(1).trim() : trimmed
  const tokens = withoutPrompt.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return null
  }

  const candidate = tokens[0]
  if (!candidate) {
    return null
  }
  if (!/^[a-zA-Z0-9._/-]+$/.test(candidate)) {
    return null
  }

  if (candidate.includes('/')) {
    const parts = candidate.split('/')
    return parts[parts.length - 1] || null
  }

  return candidate
}

export function normalizeApprovedConfigEnforcementSettings(
  settings?: Partial<EnforcementSettings> | null,
): EnforcementSettings {
  return {
    ...DEFAULT_ENFORCEMENT_SETTINGS,
    ...(settings ?? {}),
  }
}

export function extractAllowedDomainsFromApprovedConfig(
  config: ApprovedConfig,
): string[] {
  const domains: string[] = []

  const settingsJson = tryParseJson(config.settings?.content)
  if (settingsJson) {
    domains.push(...extractMcpServerDomains(settingsJson))
  }

  const mcpJson = tryParseJson(config.mcp?.content)
  if (mcpJson) {
    domains.push(...extractMcpServerDomains(mcpJson))
  }

  const contentSources = [
    config.instructions?.content,
    config.settings?.content,
    config.mcp?.content,
    ...(config.commands ?? []).map((item) => item.content),
    ...(config.hooks ?? []).map((item) => item.content),
    ...(config.subagents ?? []).map((item) => item.content),
    ...(config.rules ?? []).map((item) => item.content),
    ...(config.skills ?? []).map((item) => item.content),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  for (const content of contentSources) {
    for (const url of extractUrlsFromText(content)) {
      const hostname = extractHostname(url)
      if (hostname) {
        domains.push(hostname)
      }
    }
  }

  return uniqueStrings(domains)
}

export function extractAllowedExecutablesFromApprovedConfig(
  config: ApprovedConfig,
): string[] {
  const executables: string[] = []
  const contentSources = [
    config.instructions?.content,
    ...(config.commands ?? []).map((item) => item.content),
    ...(config.hooks ?? []).map((item) => item.content),
  ].filter((value): value is string => typeof value === 'string' && value.length > 0)

  for (const content of contentSources) {
    let inCodeFence = false
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim()

      if (trimmed.startsWith('```')) {
        inCodeFence = !inCodeFence
        continue
      }

      const shebang = extractInterpreterFromShebang(line)
      if (shebang) {
        executables.push(shebang)
        continue
      }

      if (!inCodeFence && !trimmed.startsWith('$')) {
        continue
      }

      const executable = extractExecutableFromCommandLine(line)
      if (executable) {
        executables.push(executable)
      }
    }
  }

  return uniqueStrings(executables)
}

export function compileApprovedConfigEnforcementManifest(
  config: ApprovedConfig,
): ApprovedConfigEnforcementManifest {
  return {
    platform: config.platform,
    hash: config.hash,
    version: config.version,
    approvedAt: config.approvedAt,
    approvedBy: config.approvedBy,
    enforcementSettings: normalizeApprovedConfigEnforcementSettings(
      config.enforcementSettings,
    ),
    allowedDomains: extractAllowedDomainsFromApprovedConfig(config),
    allowedExecutables: extractAllowedExecutablesFromApprovedConfig(config),
    hasMcp: Boolean(config.mcp),
    hasEnvironment: Boolean(config.environment),
  }
}
