import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { headers } from 'next/headers'
import './globals.css'
import { BRANDING } from '@/lib/branding'
import { ThemeScript } from '@/lib/theme-script'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://app.gal.run'),
  title: BRANDING.dashboardTitle,
  description: BRANDING.dashboardDescription,
  keywords: 'AI governance, AI security, agent safety, enterprise AI, coding agents, Claude, Cursor, AI sandbox',
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
  openGraph: {
    title: BRANDING.dashboardTitle,
    description: BRANDING.dashboardOpenGraphDescription,
    type: 'website',
  },
  icons: {
    icon: '/favicon.svg',
  },
}

export const viewport: Viewport = {
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
    <html lang="en" suppressHydrationWarning>
      <head suppressHydrationWarning>
        <ThemeScript nonce={nonce} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
