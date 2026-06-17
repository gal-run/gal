"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 text-sm font-medium text-black hover:text-black/70 transition-colors"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4" />
          Copied
        </>
      ) : (
        <>
          <Link2 className="w-4 h-4" />
          Share
        </>
      )}
    </button>
  );
}
