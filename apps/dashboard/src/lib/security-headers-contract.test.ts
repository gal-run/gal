import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dashboardNextConfigSource = readFileSync(
  join(__dirname, '../../next.config.ts'),
  'utf8',
)

// Dashboard CSP is set per-request in middleware.ts (nonce-based, #3876/#3967).
// next.config.ts intentionally omits it — checked below.
const dashboardMiddlewareSource = readFileSync(
  join(__dirname, '../middleware.ts'),
  'utf8',
)

// NOTE: The companion website security-header guards (poweredByHeader,
// CSP-in-middleware, VULN-002 nonce policy) live in the separate gal website
// repo, which is not part of this OSS monorepo. They are enforced there, not
// here. This contract covers only the dashboard surface present in this repo.
describe('web security header contracts', () => {
  it('keeps X-Powered-By disabled on the dashboard Next.js config (#2583)', () => {
    expect(dashboardNextConfigSource).toContain('poweredByHeader: false')
  })

  it('keeps CSP and baseline security headers configured on the dashboard surface (#2582)', () => {
    // Dashboard: CSP is set per-request in middleware.ts, NOT in next.config.ts (#3876/#3967)
    expect(dashboardNextConfigSource).not.toContain("key: 'Content-Security-Policy'")
    expect(dashboardNextConfigSource).not.toContain("key: 'Content-Security-Policy-Report-Only'")
    expect(dashboardNextConfigSource).toContain('headers: [')
    expect(dashboardNextConfigSource).toContain('...securityHeaders')

    // Dashboard CSP lives in middleware.ts (nonce-based)
    expect(dashboardMiddlewareSource).toContain('Content-Security-Policy')
    // apis.google.com is not matched by *.googleapis.com — must be listed explicitly (#3989)
    expect(dashboardMiddlewareSource).toContain('https://apis.google.com')
  })
})
