import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import Script from 'next/script'
import './globals.css'

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? ''
const GOOGLE_ADS_CONVERSION_ID =
  process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_ID ?? ''

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
})

const siteUrl = 'https://gal.run'
const siteTitle = 'GAL — Governance Agentic Layer'
const siteDescription =
  'gal is a config-and-policy control plane for AI coding agents — it discovers, standardizes, and installs one canonical ruleset as hooks across Claude Code, Cursor, Copilot, Gemini, Windsurf, and Codex (per-tool blocking enforcement is in active development).'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteTitle,
    template: '%s | GAL',
  },
  description: siteDescription,
  keywords: [
    'AI governance',
    'coding agents',
    'Claude Code',
    'Cursor',
    'GitHub Copilot',
    'agent security',
    'enterprise AI',
    'AI compliance',
  ],
  authors: [{ name: 'Scheduler Systems Ltd' }],
  creator: 'Scheduler Systems Ltd',
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'gal.run',
    title: siteTitle,
    description: siteDescription,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'GAL — Governance Agentic Layer',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteTitle,
    description: siteDescription,
    images: ['/og-image.png'],
    creator: '@galgovernance',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: '/favicon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
              strategy="afterInteractive"
              nonce={nonce}
            />
            <Script id="google-analytics" strategy="afterInteractive" nonce={nonce}>
              {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
            ${GOOGLE_ADS_CONVERSION_ID ? `gtag('config', '${GOOGLE_ADS_CONVERSION_ID}');` : ''}
          `}
            </Script>
          </>
        )}
        <script
          nonce={nonce}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify([
              {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: 'Scheduler Systems',
                url: 'https://gal.run',
                logo: 'https://gal.run/logo.svg',
                sameAs: ['https://github.com/gal-run/gal'],
              },
              {
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: 'GAL',
                url: 'https://gal.run',
              },
              {
                '@context': 'https://schema.org',
                '@type': 'SoftwareApplication',
                name: 'GAL — Governance Agentic Layer',
                applicationCategory: 'DeveloperApplication',
                operatingSystem: 'Web',
                url: 'https://gal.run',
                description: siteDescription,
                offers: {
                  '@type': 'Offer',
                  price: '0',
                  priceCurrency: 'USD',
                },
              },
            ]),
          }}
        />
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  )
}
