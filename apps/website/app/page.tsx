/**
 * @fileoverview Landing Page - GAL Marketing Website
 * @module app/page
 *
 * Next.js App Router page component (Server Component by default).
 * Renders the full marketing landing page.
 */

import type { Metadata } from 'next'
import { LandingPage } from '@/src/components/LandingPage'

export const metadata: Metadata = {
  alternates: {
    canonical: 'https://gal.run/',
  },
}

export default function HomePage() {
  return <LandingPage />
}
