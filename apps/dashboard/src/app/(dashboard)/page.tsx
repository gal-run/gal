import HomeContent from './HomeContent'

/**
 * Root page (/) - rendered inside the (dashboard) route group layout.
 *
 * This is a **server component** that renders the client-side HomeContent.
 * The indirection is required to avoid the Next.js standalone-output bug where
 * a `'use client'` page directly inside a route group causes:
 *
 *   InvariantError: Expected clientReferenceManifest to be defined.
 *
 * By keeping the page.tsx as a server component and delegating to a client
 * component, Next.js correctly resolves the client-reference manifest during
 * SSR in standalone mode (Cloud Run).
 *
 * See: https://github.com/vercel/next.js/issues/53569
 * See: https://github.com/vercel/next.js/pull/73606
 */
export default function HomePage() {
  return <HomeContent />
}
