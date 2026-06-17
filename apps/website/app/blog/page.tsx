"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { articles, CATEGORIES, getArticlesByCategory } from "@/src/content/articles";
import { ArticleCard } from "@/src/components/blog";
import { DASHBOARD_URL } from "@/src/config";

export default function BlogPage() {
  const [activeCategory, setActiveCategory] = useState("all");
  const filtered = getArticlesByCategory(activeCategory);

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-100">
        <nav className="max-w-[1376px] mx-auto px-8 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3 group">
            <svg viewBox="0 0 36 36" className="w-10 h-10" fill="none">
              <rect width="36" height="36" rx="8" fill="black" />
              <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="#00FF2A" />
              <path d="M8 18L18 12L28 18V24L18 18L8 24V18Z" fill="#00FF2A" fillOpacity="0.6" />
              <path d="M8 24L18 18L28 24V30L18 24L8 30V24Z" fill="#00FF2A" fillOpacity="0.3" />
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
              className="text-sm font-medium text-black transition-colors hidden sm:block"
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

      {/* Content */}
      <main className="max-w-[1376px] mx-auto px-8 pt-32 pb-24">
        {/* Page title */}
        <h1 className="text-5xl font-medium tracking-tight text-black mb-8">
          GAL Blog
        </h1>

        {/* Category tabs */}
        <div className="flex items-center gap-6 mb-12 overflow-x-auto pb-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.slug}
              onClick={() => setActiveCategory(cat.slug)}
              className={`text-lg font-medium whitespace-nowrap transition-colors ${
                activeCategory === cat.slug
                  ? "text-black"
                  : "text-black/44 hover:text-black/70"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Article grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-16">
            {filtered.map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        ) : (
          <p className="text-black/44 text-lg">
            No articles in this category yet.
          </p>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-[1376px] mx-auto px-8 flex items-center justify-between">
          <span className="text-sm text-black/44">
            &copy; {new Date().getFullYear()} Scheduler Systems Ltd.
          </span>
          <Link href="/" className="text-sm text-black/44 hover:text-black transition-colors">
            gal.run
          </Link>
        </div>
      </footer>
    </div>
  );
}
