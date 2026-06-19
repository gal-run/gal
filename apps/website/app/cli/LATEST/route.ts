import { NextResponse } from 'next/server'

/**
 * GET /cli/LATEST
 *
 * Returns the latest CLI version string by querying the npm registry.
 *
 * Used by install.sh: `curl -fsSL https://gal.run/cli/LATEST`
 */
export const dynamic = 'force-dynamic'
export const revalidate = 0

const NPM_LATEST_URL = 'https://registry.npmjs.org/@scheduler-systems/gal-run/latest'

async function fetchLatestVersion(): Promise<string | null> {
  const res = await fetch(NPM_LATEST_URL, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  })

  if (!res.ok) {
    return null
  }

  const data = await res.json()
  const version = typeof data?.version === 'string' ? data.version.trim() : ''

  return version || null
}

export async function GET() {
  try {
    const version = await fetchLatestVersion()

    if (!version) {
      return new NextResponse('', {
        status: 503,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      })
    }

    return new NextResponse(version, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return new NextResponse('', {
      status: 503,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  }
}
