import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const packageJson = require('./package.json')

// ---------------------------------------------------------------------------
// Security headers
//
// Content-Security-Policy is set per-request in `middleware.ts` with a nonce
// (VULN-002 SOC 2 pentest 2026-04-16) so `unsafe-inline` can be removed from
// script-src. Other headers below stay static here.
// ---------------------------------------------------------------------------
const securityHeaders = [
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=31536000; includeSubDomains; preload',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=()',
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required for Cloud Run — produces .next/standalone server
  output: 'standalone',

  // Remove the X-Powered-By: Next.js header (reduces fingerprinting surface)
  poweredByHeader: false,

  // Environment variables exposed to the browser
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Allow install.sh to be fetched by curl without CORS issues
        source: '/install.sh',
        headers: [
          { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
        ],
      },
      {
        source: '/install.ps1',
        headers: [
          { key: 'Content-Type', value: 'text/plain; charset=utf-8' },
        ],
      },
    ]
  },

  async redirects() {
    return [
      {
        // Restore VS Marketplace backlink: /docs was the listed URL in the extension listing.
        // Redirect to the features section on the landing page so the link remains valid.
        source: '/docs',
        destination: '/#features',
        permanent: true,
      },
      {
        // Google Ads sitelinks and older marketing links use page-style URLs.
        // Keep those crawler-visible destinations away from 404s.
        source: '/documentation',
        destination: '/#features',
        permanent: true,
      },
      {
        source: '/pricing',
        destination: '/#pricing',
        permanent: true,
      },
      {
        source: '/github-integration',
        destination: '/#features',
        permanent: true,
      },
      {
        source: '/install',
        destination: '/install.sh',
        permanent: true,
      },
      {
        source: '/download',
        destination: 'https://github.com/gal-run/gal/releases',
        permanent: true,
      },
      // Redirect legacy feature pages to the landing page anchors
      {
        source: '/features',
        destination: '/#features',
        permanent: true,
      },
      // Redirect legacy integration links to the integrations landing page
      {
        source: '/integrations',
        destination: '/integrations/claude-code',
        permanent: true,
      },
      // Redirect removed Windsurf integration link (no landing page exists)
      {
        source: '/integrations/windsurf',
        destination: '/integrations/claude-code',
        permanent: true,
      },
      // Legal pages redirect to the centralized Legal Center.
      {
        source: '/privacy',
        destination: 'https://scheduler-systems.com/legal#gal-privacy',
        permanent: true,
      },
      {
        source: '/terms',
        destination: 'https://scheduler-systems.com/legal#gal-terms',
        permanent: true,
      },
      {
        source: '/legal/security',
        destination: 'https://scheduler-systems.com/legal#gal-privacy',
        permanent: true,
      },
      {
        source: '/legal/data-retention',
        destination: 'https://scheduler-systems.com/legal#gal-privacy',
        permanent: true,
      },
      {
        source: '/legal/subprocessors',
        destination: 'https://scheduler-systems.com/legal#gal-privacy',
        permanent: true,
      },
    ]
  },

  async rewrites() {
    return [
      {
        // Proxy CLI release tarballs to the public gal-run repo's GitHub Releases
        source: '/cli/releases/:version/:file',
        destination: 'https://github.com/gal-run/gal-run/releases/download/v:version/:file',
      },
    ]
  },
}

export default nextConfig
