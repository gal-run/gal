import { MetadataRoute } from 'next'
import { articles } from '@/src/content/articles'

const siteUrl = 'https://gal.run'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: new Date('2026-03-17'),
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: `${siteUrl}/vision`,
      lastModified: new Date('2026-03-17'),
      changeFrequency: 'monthly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/blog`,
      lastModified: new Date(articles[0]?.isoDate ?? '2026-03-17'),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${siteUrl}/integrations/claude-code`,
      lastModified: new Date('2026-05-03'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/integrations/cursor`,
      lastModified: new Date('2026-05-12'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/integrations/copilot`,
      lastModified: new Date('2026-05-12'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/integrations/gemini`,
      lastModified: new Date('2026-05-12'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/integrations/codex`,
      lastModified: new Date('2026-05-12'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/features/observability`,
      lastModified: new Date('2026-05-03'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/features/config`,
      lastModified: new Date('2026-05-04'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/features/security`,
      lastModified: new Date('2026-05-04'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/compliance`,
      lastModified: new Date('2026-05-04'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/governance`,
      lastModified: new Date('2026-05-04'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/features/security`,
      lastModified: new Date('2026-05-04'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${siteUrl}/docs`,
      lastModified: new Date('2026-05-04'),
      changeFrequency: 'monthly',
      priority: 0.7,
    },
  ]

  const blogPosts: MetadataRoute.Sitemap = articles.map((article) => ({
    url: `${siteUrl}/blog/${article.slug}`,
    lastModified: new Date(article.isoDate),
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }))

  return [...staticPages, ...blogPosts]
}
