"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  getArticleBySlug,
  getRelatedArticles,
  type Article,
} from "@/src/content/articles";
import { ArticleCard, TableOfContents, ShareButton } from "@/src/components/blog";
import { DASHBOARD_URL } from "@/src/config";

export default function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const article = getArticleBySlug(slug);
  const [currentSection, setCurrentSection] = useState("");

  useEffect(() => {
    if (!article) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setCurrentSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-100px 0px -60% 0px", threshold: 0 }
    );

    for (const section of article.sections) {
      const el = document.getElementById(section.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [article]);

  if (!article) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-medium text-black mb-4">
            Article not found
          </h1>
          <Link
            href="/blog"
            className="text-sm font-medium text-black/44 hover:text-black transition-colors"
          >
            Back to blog
          </Link>
        </div>
      </div>
    );
  }

  const related = getRelatedArticles(slug);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <BlogHeader />

      {/* Hero */}
      <ArticleHero article={article} />

      {/* TOC */}
      <TableOfContents
        sections={article.sections}
        currentSection={currentSection}
      />

      {/* Article Body */}
      <article className="max-w-[1376px] mx-auto px-8 py-16">
        <div className="grid grid-cols-12">
          <div className="col-span-12 md:col-span-8 md:col-start-3">
            {article.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="mb-16 scroll-mt-[120px]"
              >
                <h2 className="text-[30px] font-medium leading-[1.32] tracking-[-0.3px] text-black mb-6">
                  {section.heading}
                </h2>
                <div className="article-content text-[17px] leading-[28px] tracking-[-0.17px] text-black space-y-6">
                  {section.content}
                </div>
              </section>
            ))}
          </div>
        </div>
      </article>

      {/* Author & Tags */}
      <div className="max-w-[1376px] mx-auto px-8">
        <div className="bg-gray-50 rounded-sm p-8 mb-16">
          <span className="inline-block px-3 py-1 bg-white rounded-full text-sm font-medium text-black border border-gray-200 mb-6">
            {new Date(article.isoDate).getFullYear()}
          </span>
          <div>
            <span className="text-sm text-black/44 block mb-1">Author</span>
            <span className="text-sm font-medium text-black underline">
              {article.author}
            </span>
          </div>
        </div>
      </div>

      {/* Keep Reading */}
      {related.length > 0 && (
        <div className="max-w-[1376px] mx-auto px-8 pb-24">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-medium text-black">Keep reading</h2>
            <Link
              href="/blog"
              className="text-sm font-medium text-black/44 hover:text-black transition-colors"
            >
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-16">
            {related.map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-[1376px] mx-auto px-8 flex items-center justify-between">
          <span className="text-sm text-black/44">
            &copy; {new Date().getFullYear()} Scheduler Systems Ltd.
          </span>
          <Link
            href="/"
            className="text-sm text-black/44 hover:text-black transition-colors"
          >
            gal.run
          </Link>
        </div>
      </footer>
    </div>
  );
}

function BlogHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100">
      <nav className="max-w-[1376px] mx-auto px-8 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <svg viewBox="0 0 36 36" className="w-10 h-10" fill="none">
            <rect width="36" height="36" rx="8" fill="black" />
            <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="#00FF2A" />
            <path
              d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
              fill="#00FF2A"
              fillOpacity="0.6"
            />
            <path
              d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
              fill="#00FF2A"
              fillOpacity="0.3"
            />
          </svg>
          <span className="text-4xl font-black tracking-tight text-gray-900">
            gal<span className="text-[#00FF2A]">.</span>run
          </span>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-sm font-medium text-black/44 hover:text-black transition-colors hidden sm:block"
          >
            HOME
          </Link>
          <Link
            href="/blog"
            className="text-sm font-medium text-black/44 hover:text-black transition-colors hidden sm:block"
          >
            BLOG
          </Link>
          <a
            href={`${DASHBOARD_URL}/login`}
            className="hidden sm:flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-800 transition-colors"
          >
            GET STARTED
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </nav>
    </header>
  );
}

function ArticleHero({ article }: { article: Article }) {
  return (
    <div className="pt-28 pb-8">
      <div className="max-w-[1000px] mx-auto px-8 text-center">
        {/* Meta */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <span className="text-sm font-medium text-black/44">
            {article.date}
          </span>
          <Link
            href={`/blog?category=${article.categorySlug}`}
            className="text-sm font-medium text-black/44 hover:text-black transition-colors"
          >
            {article.category}
          </Link>
        </div>

        {/* Title */}
        <h1 className="text-[64px] font-medium leading-[1] tracking-[-1.92px] text-black mb-6 text-balance">
          {article.title}
        </h1>

        {/* Subtitle */}
        <p className="text-[17px] leading-[28px] tracking-[-0.17px] text-black/70 max-w-2xl mx-auto mb-8">
          {article.subtitle}
        </p>

        {/* Actions row */}
        <div className="flex items-center justify-between max-w-[900px] mx-auto pt-4 border-t border-gray-100">
          <span className="text-sm font-medium text-black/44">
            {article.readingTime}
          </span>
          <ShareButton />
        </div>
      </div>
    </div>
  );
}
