"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ArticleSection } from "@/src/content/articles";

export function TableOfContents({
  sections,
  currentSection,
}: {
  sections: ArticleSection[];
  currentSection: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="sticky top-[65px] z-40 bg-white border-b border-gray-100">
      <div className="max-w-[1376px] mx-auto px-8">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between w-full py-3 text-sm font-medium text-black"
        >
          <span className="truncate">
            {currentSection
              ? sections.find((s) => s.id === currentSection)?.heading ??
                "Table of contents"
              : "Table of contents"}
          </span>
          <ChevronDown
            className={`w-4 h-4 ml-2 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </button>
        {isOpen && (
          <div className="pb-4 space-y-1">
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                onClick={() => setIsOpen(false)}
                className={`block py-1.5 text-sm transition-colors ${
                  currentSection === section.id
                    ? "text-black font-medium"
                    : "text-black/44 hover:text-black"
                }`}
              >
                {section.heading}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
