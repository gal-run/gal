import type { Metadata } from "next";

const url = "https://gal.run/blog";

export const metadata: Metadata = {
  title: "GAL Blog | AI Agent Governance Insights",
  description:
    "AI agent governance, Claude Code config sync, and enterprise compliance insights from GAL.",
  alternates: {
    canonical: url,
  },
  openGraph: {
    title: "GAL Blog | AI Agent Governance Insights",
    description:
      "AI agent governance, Claude Code config sync, and enterprise compliance insights from GAL.",
    url,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GAL Blog | AI Agent Governance Insights",
    description:
      "AI agent governance, Claude Code config sync, and enterprise compliance insights from GAL.",
  },
};

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "GAL Blog",
  description:
    "AI agent governance, Claude Code config sync, and enterprise compliance insights from GAL.",
  url,
  isPartOf: {
    "@type": "WebSite",
    name: "GAL",
    url: "https://gal.run",
  },
};

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webPageSchema) }}
      />
      {children}
    </>
  );
}
