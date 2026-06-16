'use client'

import { formatDistanceToNowStrict } from 'date-fns'

export type DiffCompareMode = 'single' | 'all'

export interface ConfigInstance {
  repo: string
  path: string
  content: string
  lastModified: string
  hash: string
}

export interface DiffSummary {
  added: number
  removed: number
  identical: boolean
}

export interface CompareSection {
  id: string
  path: string
  leftInstance: ConfigInstance
  rightInstance: ConfigInstance
  summary: DiffSummary
}

export function computeDiffSummary(oldContent: string, newContent: string): DiffSummary {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const lcsLength = computeLcsLength(oldLines, newLines)
  const removed = oldLines.length - lcsLength
  const added = newLines.length - lcsLength

  return {
    added,
    removed,
    identical: added === 0 && removed === 0,
  }
}

export function formatCompareRelativeDate(lastModified: string): string {
  if (!lastModified) return 'Unknown date'

  const parsedDate = new Date(lastModified)
  if (Number.isNaN(parsedDate.getTime())) return 'Unknown date'

  const now = new Date()
  const diffDays = Math.floor((now.getTime() - parsedDate.getTime()) / 86400000)

  if (diffDays <= 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`

  return formatDistanceToNowStrict(parsedDate, { addSuffix: true })
}

export function getShortHash(hash: string): string {
  return hash ? hash.slice(0, 7) : 'No hash'
}

export function getInstanceOptionLabel(instance: ConfigInstance): string {
  return `${instance.repo} · ${instance.path}`
}

export function getSharedPath(leftInstance: ConfigInstance, rightInstance: ConfigInstance): string {
  if (leftInstance.path === rightInstance.path) return leftInstance.path
  return `${leftInstance.path} ↔ ${rightInstance.path}`
}

export function getCompareSectionId(path: string, repo: string): string {
  return `diff-file-${`${path}-${repo}`.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-')}`
}

function computeLcsLength(oldLines: string[], newLines: string[]): number {
  const previous = new Array<number>(newLines.length + 1).fill(0)
  const current = new Array<number>(newLines.length + 1).fill(0)

  for (let oldIndex = 1; oldIndex <= oldLines.length; oldIndex += 1) {
    current[0] = 0

    for (let newIndex = 1; newIndex <= newLines.length; newIndex += 1) {
      if (oldLines[oldIndex - 1] === newLines[newIndex - 1]) {
        current[newIndex] = previous[newIndex - 1] + 1
      } else {
        current[newIndex] = Math.max(previous[newIndex], current[newIndex - 1])
      }
    }

    for (let newIndex = 0; newIndex <= newLines.length; newIndex += 1) {
      previous[newIndex] = current[newIndex]
    }
  }

  return previous[newLines.length]
}
