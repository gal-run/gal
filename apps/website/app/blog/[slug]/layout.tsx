import type { Metadata } from 'next'
import { getArticleBySlug } from '@/src/content/articles'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const article = getArticleBySlug(slug)

  if (!article) {
    return { title: 'Article Not Found' }
  }

  const url = `https://gal.run/blog/${slug}`
  const title = article.seoTitle ?? article.title
  const description = article.seoDescription ?? article.subtitle

  return {
    title,
    description,
    keywords: article.keywords,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      siteName: 'gal.run',
      type: 'article',
      publishedTime: article.isoDate,
      authors: [article.author],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  }
}

export default async function ArticleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const article = getArticleBySlug(slug)
  const schema = article && {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: article.title,
    description: article.seoDescription ?? article.subtitle,
    datePublished: article.isoDate,
    dateModified: article.isoDate,
    articleSection: article.category,
    author: {
      '@type': 'Organization',
      name: article.author,
      url: 'https://gal.run',
    },
    publisher: {
      '@type': 'Organization',
      name: 'Scheduler Systems Ltd',
      url: 'https://gal.run',
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `https://gal.run/blog/${slug}` },
    keywords: article.keywords?.join(', '),
  }

  return (
    <>
      {schema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      )}
      {children}
    </>
  )
}
