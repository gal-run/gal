import { AlertTriangle, ExternalLink, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getActiveDegradations,
  type ServiceDegradation,
} from "../lib/service-degradation";

export function ServiceDegradationBanner() {
  const [degradations, setDegradations] = useState<ServiceDegradation[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    getActiveDegradations().then(setDegradations);

    const handleChange = (
      changes: Record<string, chrome.storage.StorageChange>,
    ) => {
      if (changes.serviceDegradations) {
        getActiveDegradations().then(setDegradations);
      }
    };

    chrome.storage.local.onChanged.addListener(handleChange);
    return () => chrome.storage.local.onChanged.removeListener(handleChange);
  }, []);

  if (dismissed || degradations.length === 0) return null;

  const latest = degradations[0];

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30 px-3 py-2">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-amber-200 font-medium">
            {latest.type === "rate_limited"
              ? "Rate Limited"
              : "Service Degradation"}
          </p>
          <p className="text-[11px] text-amber-300/80 mt-0.5">
            {latest.message}
            {latest.retryAfter && (
              <span className="ml-1">
                (retry in {Math.ceil(latest.retryAfter / 60)}m)
              </span>
            )}
          </p>
          {latest.requestId && (
            <p className="text-[10px] text-amber-400/60 mt-1 font-mono">
              Request ID: {latest.requestId}
            </p>
          )}
          <a
            href={latest.statusPageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 mt-1"
          >
            Check status page
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 hover:bg-amber-500/20 rounded text-amber-400"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
