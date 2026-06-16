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

describe('analytics migration contracts', () => {
  it('keeps dashboard/website runtime source free of PostHog client references (#3119)', () => {
    const repoRoot = join(__dirname, '../../..')
    const offending = gitGrep(repoRoot, 'posthog', [
      'apps/dashboard-next/src',
      'website/app',
      'website/components',
      'website/lib',
      'website/src',
    ]).filter((match) => !match.startsWith('apps/dashboard-next/src/lib/analytics-migration-contract.test.ts:'))

    expect(offending).toEqual([])
  })

  it('keeps GA-style analytics endpoints in website/dashboard security policy config (#3119)', () => {
    // Dashboard CSP was moved to middleware.ts (nonce-based, #3876/#3967) — check there
    const dashboardMiddleware = readFileSync(join(__dirname, '../middleware.ts'), 'utf8')
    // Website CSP was moved to middleware.ts for VULN-002 (SOC 2 pentest 2026-04-16)
    // so the GA endpoint allow-list lives there now instead of next.config.ts.
    const websiteMiddleware = readFileSync(join(__dirname, '../../../website/middleware.ts'), 'utf8')

    expect(dashboardMiddleware).toContain('google-analytics.com')
    expect(websiteMiddleware).toContain('google-analytics.com')
    expect(websiteMiddleware).toContain('googletagmanager.com')
  })

  it('keeps dashboard runtime free of removed createLogger bootstrap paths that previously crashed bundled builds (#2680, #2682, #2686, #2688, #2678, #2681, #2684, #2687)', () => {
    const repoRoot = join(__dirname, '../../..')
    const offenders = gitGrep(repoRoot, 'createLogger[[:space:]]*\\(', ['apps/dashboard-next/src'])
    expect(offenders).toEqual([])
  })
})
