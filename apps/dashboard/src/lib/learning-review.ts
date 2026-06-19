import type { Learning } from '@gal/types'

export interface LearningReviewGroup {
  repo: string
  items: Learning[]
}

export interface LearningReviewSummary {
  counts: {
    approved: number
    pending: number
    rejected: number
  }
  groups: LearningReviewGroup[]
  uniqueRepos: number
  totalLearnings: number
}

function getLearningTimestamp(learning: Pick<Learning, 'updatedAt' | 'createdAt'>): number {
  const candidate = learning.updatedAt ?? learning.createdAt
  const timestamp = candidate ? Date.parse(candidate) : Number.NaN
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function buildLearningReviewSummary(learnings: Learning[]): LearningReviewSummary {
  const counts = {
    approved: 0,
    pending: 0,
    rejected: 0,
  }

  const grouped = new Map<string, Learning[]>()

  for (const learning of learnings) {
    if (learning.status === 'approved') counts.approved++
    else if (learning.status === 'rejected') counts.rejected++
    else counts.pending++

    const repo = learning.repo || 'Unscoped repo'
    const current = grouped.get(repo) ?? []
    current.push(learning)
    grouped.set(repo, current)
  }

  const groups = [...grouped.entries()]
    .map(([repo, items]) => ({
      repo,
      items: items.sort((a, b) => getLearningTimestamp(b) - getLearningTimestamp(a)),
    }))
    .sort((a, b) => b.items.length - a.items.length || a.repo.localeCompare(b.repo))

  return {
    counts,
    groups,
    uniqueRepos: groups.length,
    totalLearnings: learnings.length,
  }
}
