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

  return {
    title: article.title,
    description: article.subtitle,
    alternates: { canonical: url },
    openGraph: {
      title: article.title,
      description: article.subtitle,
      url,
      type: 'article',
      publishedTime: article.isoDate,
      authors: [article.author],
    },
    twitter: {
      card: 'summary_large_image',
      title: article.title,
      description: article.subtitle,
    },
  }
}

export default function ArticleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
