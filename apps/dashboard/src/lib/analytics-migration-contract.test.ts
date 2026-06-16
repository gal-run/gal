import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function gitGrep(repoRoot: string, pattern: string, paths: string[]): string[] {
  try {
    const output = execFileSync(
      'git',
      ['-C', repoRoot, 'grep', '-n', '-I', '-E', pattern, '--', ...paths],
      { encoding: 'utf8' },
    )
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'status' in error && error.status === 1) {
      return []
    }
    throw error
  }
}

// NOTE: The companion website analytics guards (PostHog-free website source,
// website GA allow-list in website/middleware.ts) live in the separate gal
// website repo, which is not part of this OSS monorepo. They are enforced
// there, not here. This contract covers only the dashboard surface present in
// this repo. The dashboard package lives at apps/dashboard/src here (the old
// internal monorepo used apps/dashboard-next/src).
describe('analytics migration contracts', () => {
  it('keeps dashboard runtime source free of PostHog client references (#3119)', () => {
    const repoRoot = join(__dirname, '../../../..')
    const offending = gitGrep(repoRoot, 'posthog', [
      'apps/dashboard/src',
    ]).filter((match) => !match.includes('analytics-migration-contract.test.ts:'))

    expect(offending).toEqual([])
  })

  it('keeps GA-style analytics endpoints in the dashboard security policy config (#3119)', () => {
    // Dashboard CSP was moved to middleware.ts (nonce-based, #3876/#3967) — check there
    const dashboardMiddleware = readFileSync(join(__dirname, '../middleware.ts'), 'utf8')

    expect(dashboardMiddleware).toContain('google-analytics.com')
  })

  // NOTE: The legacy "removed createLogger bootstrap path that crashed bundled
  // builds" guard (#2680/#2682/...) targeted the old apps/dashboard-next
  // package, where a server-only pino bootstrap was being imported into the
  // client bundle. That package does not exist in this OSS monorepo; here the
  // dashboard uses a vendored, browser-safe createLogger
  // (src/lib/gal-telemetry-browser.ts → @gal/telemetry) that is intentionally
  // shipped and does NOT crash bundled builds. The legacy grep guard is
  // therefore not applicable to this repo and is enforced in the source repo
  // that still owns dashboard-next.
})
