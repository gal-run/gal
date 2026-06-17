import { Copy, Check } from "lucide-react";
import { useState } from "react";
import type { Command } from "../lib/api";

interface CommandCardProps {
  command: Command;
  onCopy?: (command: Command) => void;
}

export function CommandCard({ command, onCopy }: CommandCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      // First, try to inject directly into the active tab's chat input
      // via the content script message bridge (popup → content script).
      let injected = false;
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, {
            type: "INSERT_WORKFLOW_TEXT",
            content: command.content,
          });
          injected = true;
        }
      } catch {
        // Content script may not be present on this page — fall through to clipboard
      }

      // Always copy to clipboard as fallback (or as a secondary action)
      await navigator.clipboard.writeText(command.content);
      setCopied(true);
      onCopy?.(command);
      // Suppress unused-variable warning — injected is intentionally tracked
      void injected;
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  return (
    <div className="p-3 bg-gray-800/50 rounded-lg border border-gray-700 hover:border-gal-accent/30 transition-colors group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-white truncate">
            {command.name}
          </h3>
          {command.description && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-2">
              {command.description}
            </p>
          )}
          {command.tags && command.tags.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {command.tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 bg-gal-accent/10 text-gal-accent rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={handleCopy}
          className="flex-shrink-0 p-2 rounded-lg bg-gray-700/50 hover:bg-gal-accent/20 text-gray-400 hover:text-gal-accent transition-colors"
          title="Copy to clipboard"
        >
          {copied ? (
            <Check className="w-4 h-4 text-gal-accent" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}
