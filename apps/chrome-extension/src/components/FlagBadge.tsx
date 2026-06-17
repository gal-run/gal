/**
 * Feature Flag Badge Component
 *
 * Contextual indicator showing feature flag status.
 * Only visible in development environment for the team.
 *
 * Usage:
 * <FlagBadge featureId="commands" />
 * <FlagBadge featureId="widget" />
 */

import { isProduction } from "../lib/api";

/**
 * Chrome Extension specific feature flags
 */
interface ChromeFeatureFlag {
 name: string;
 enabled: boolean;
 audience?: "public" | "internal" | "partners";
 environments?: Array<"dev" | "prod">;
}

/**
 * Feature flags for Chrome extension features
 */
const CHROME_FEATURE_FLAGS: Record<string, ChromeFeatureFlag> = {
 commands: {
 name: "Commands Panel",
 enabled: true,
 audience: "public",
 },
 widget: {
 name: "Floating Widget",
 enabled: true,
 audience: "internal",
 environments: ["dev"],
 },
 "quick-insert": {
 name: "Quick Insert",
 enabled: true,
 audience: "internal",
 environments: ["dev"],
 },
};

interface FlagBadgeProps {
 featureId: string;
 className?: string;
}

export function FlagBadge({ featureId, className = "" }: FlagBadgeProps) {
 // Don't show in production
 if (isProduction()) {
 return null;
 }

 const flag = CHROME_FEATURE_FLAGS[featureId];
 if (!flag) {
 return null;
 }

 const parts: string[] = [];

 // Enabled status
 if (!flag.enabled) {
 parts.push("disabled");
 }

 // Environment restrictions
 if (flag.environments && flag.environments.length > 0) {
 parts.push(flag.environments.join("/"));
 }

 // Audience
 if (flag.audience === "internal") {
 parts.push("internal");
 } else if (flag.audience === "partners") {
 parts.push("partners");
 }

 // If no restrictions, don't show badge
 if (parts.length === 0) {
 return null;
 }

 // Badge colors based on enabled status
 let bgClass = "bg-amber-500/10 border-amber-500/30 text-amber-400";
 if (!flag.enabled) {
 bgClass = "bg-gray-500/10 border-gray-500/30 text-gray-400";
 }

 return (<span
 className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono border ${bgClass} ${className}`}
 title={`${flag.name}\nEnabled: ${flag.enabled}${flag.audience ? `\nAudience: ${flag.audience}` : ""}${
 flag.environments ? `\nEnvs: ${flag.environments.join(", ")}` : ""
 }`}
 >
 {parts.join(" · ")}
 </span>);
}
