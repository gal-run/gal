import type { Metadata } from 'next'

const url = 'https://gal.run/vision'

export const metadata: Metadata = {
  title: 'GAL Vision: Governance for AI Agents',
  description:
    "GAL's mission: governed AI agents with visibility, policy, and trust built in.",
  alternates: { canonical: url },
  openGraph: {
    title: 'GAL Vision: Governance for AI Agents',
    description:
      "GAL's mission: governed AI agents with visibility, policy, and trust built in.",
    url,
  },
}

const webPageSchema = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'GAL Vision',
  description: "GAL's mission: governed AI agents with visibility, policy, and trust built in.",
  url,
  isPartOf: {
    '@type': 'WebSite',
    name: 'GAL',
    url: 'https://gal.run',
  },
}

export default function VisionLayout({ children }: { children: React.ReactNode }) {
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
