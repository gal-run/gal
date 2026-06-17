import type { Metadata } from 'next'

const url = 'https://gal.run/docs'

export const metadata: Metadata = {
  title: 'Get Started with GAL | Documentation',
  description:
    'Install GAL CLI, Chrome extension, or VS Code extension. Bring AI agent governance to your workflow.',
  alternates: { canonical: url },
  openGraph: {
    title: 'Get Started with GAL | Documentation',
    description:
      'Install GAL CLI, Chrome extension, or VS Code extension. Bring AI agent governance to your workflow.',
    url,
    type: 'website',
  },
}

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'GAL Documentation',
  description: 'Install GAL CLI, Chrome extension, or VS Code extension. Bring AI agent governance to your workflow.',
  url,
  isPartOf: {
    '@type': 'WebSite',
    name: 'GAL',
    url: 'https://gal.run',
  },
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />
      {children}
    </>
  )
}
