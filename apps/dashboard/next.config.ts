import { withSentryConfig } from '@sentry/nextjs'
import type { NextConfig } from 'next'
import packageJson from './package.json'

// ---------------------------------------------------------------------------
// Security headers
//
// Content-Security-Policy is intentionally absent here — it is set
// per-request in middleware.ts with a cryptographic nonce so that
// 'unsafe-inline' and 'unsafe-eval' can be removed from script-src.
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

const nextConfig: NextConfig = {
  // Required for Cloud Run — produces .next/standalone server
  output: 'standalone',

  // Remove the X-Powered-By: Next.js header (reduces fingerprinting surface)
  poweredByHeader: false,

  // Environment variables exposed to the browser at build time
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },

  // Strict mode for catching bugs early
  reactStrictMode: true,

  // OSS free build: the former @gal/* workspace packages are vendored inline
  // under src/vendored-gal/** (and the EE repo layer under src/ee/vendored-gal-api/**)
  // and resolved via tsconfig "paths". They are now in-repo source compiled by
  // Next directly, so no transpilePackages entry is required.
  transpilePackages: [],

  // Image optimization
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Custom response headers
  //
  // The Vary header tells Cloud Run's CDN to cache separate
  // variants for normal HTML requests vs RSC (React Server Component)
  // requests. Without this, the CDN may serve a cached RSC payload as HTML
  // (or vice versa) on the custom domain, causing a blank page or garbled
  // output.
  //
  // We intentionally omit Next-Router-State-Tree from Vary because that
  // header is unique per user/navigation path and would create unbounded
  // cache variants, effectively disabling CDN caching. The _rsc query
  // parameter already serves as the cache-busting mechanism for router state.
  //
  // NOTE: Next.js internally sets its own Vary on RSC responses. Verify
  // with `curl -I` that Firebase CDN deduplicates correctly.
  //
  // See: https://github.com/vercel/next.js/issues/65335
  // ---------------------------------------------------------------------------
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Vary',
            value: 'RSC, Next-Router-Prefetch, Accept',
          },
          ...securityHeaders,
        ],
      },
    ]
  },

  // Webpack config for xterm.js and other browser-only modules
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Don't bundle xterm on server
      config.externals = config.externals || []
    }

    // Resolve .js extensions to .ts for workspace packages that use ESM-style
    // barrel exports with .js extensions (e.g., export * from './foo.js')
    config.resolve = config.resolve || {}
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    // Ensure "browser" export condition is resolved for client builds.
    // @gal/telemetry uses a browser-specific entry point via the "browser"
    // export condition. While the logger module is now browser-safe
    // (createRequire loaded lazily, browser environments use console fallback),
    // we keep this condition as defense-in-depth so the browser entry is
    // preferred when available.
    if (!isServer) {
      config.resolve.conditionNames = ['browser', 'import', 'module', 'require', 'default']
    }

    return config
  },
}

export default withSentryConfig(nextConfig, {
  // Suppress Sentry CLI source map upload logs during build
  silent: true,

  // Do not ship the full App Router manifest to public auth pages.
  disableManifestInjection: true,

  // Don't upload source maps (no SENTRY_AUTH_TOKEN configured yet)
  sourcemaps: {
    disable: true,
  },

  // Automatically tree-shake Sentry logger in production
  disableLogger: true,

  // Tunnel Sentry events through the Next.js server to avoid ad blockers
  tunnelRoute: "/monitoring",
})
