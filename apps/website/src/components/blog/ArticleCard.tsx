"use client";

import Link from "next/link";
import type { Article } from "@/src/content/articles";

export function ArticleCard({ article }: { article: Article }) {
  return (
    <Link href={`/blog/${article.slug}`} className="group block">
      <div
        className="aspect-square rounded-sm overflow-hidden mb-4"
        style={{ background: article.gradient }}
      >
        <div className="w-full h-full flex items-center justify-center p-8 transition-transform duration-300 group-hover:scale-105">
          <span className="text-white text-2xl sm:text-3xl font-medium text-center leading-tight tracking-tight">
            {article.title}
          </span>
        </div>
      </div>
      <h3 className="text-lg font-medium leading-snug tracking-tight text-black mb-2 group-hover:underline">
        {article.title}
      </h3>
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="text-black">{article.category}</span>
        <span className="text-black/20">&middot;</span>
        <span className="text-black/44">{article.date}</span>
      </div>
    </Link>
  );
}
