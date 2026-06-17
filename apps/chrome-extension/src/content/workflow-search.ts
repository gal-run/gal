/**
 * Workflow Search & Frecency Module
 *
 * Provides fuzzy search over workflows/commands using Fuse.js
 * and frecency-based ranking for recently/frequently used items.
 */

import Fuse, { type FuseResult, type FuseResultMatch } from "fuse.js";
import type { Command } from "../lib/api";

// ---- Frecency Storage ----

export interface WorkflowUsageEntry {
 workflowId: string;
 lastUsed: number; // timestamp
 useCount: number;
}

const USAGE_STORAGE_KEY = "galWorkflowUsage";

/**
 * Load usage data from Chrome storage.
 */
export async function loadUsageData(): Promise<
 Record<string, WorkflowUsageEntry>
> {
 try {
 const result = await chrome.storage.local.get(USAGE_STORAGE_KEY);
 const raw = result[USAGE_STORAGE_KEY];
 if (raw) {
 return JSON.parse(raw as string) as Record<string, WorkflowUsageEntry>;
 }
 } catch {
 // Non-critical — return empty
 }
 return {};
}

/**
 * Record a workflow usage event.
 */
export async function recordUsage(workflowId: string): Promise<void> {
 const data = await loadUsageData();
 const existing = data[workflowId];
 data[workflowId] = {
 workflowId,
 lastUsed: Date.now(),
 useCount: (existing?.useCount ?? 0) + 1,
 };
 try {
 await chrome.storage.local.set({
 [USAGE_STORAGE_KEY]: JSON.stringify(data),
 });
 } catch {
 // Non-critical
 }
}

/**
 * Compute frecency score for a workflow.
 * frecency = useCount * recency_decay
 * recency_decay = 1 / (days_since_last_use + 1)
 */
export function computeFrecency(entry: WorkflowUsageEntry | undefined): number {
 if (!entry) return 0;
 const daysSinceLastUse =
 (Date.now() - entry.lastUsed) / (1000 * 60 * 60 * 24);
 const recencyDecay = 1 / (daysSinceLastUse + 1);
 return entry.useCount * recencyDecay;
}

/**
 * Sort commands by frecency (descending), falling back to alphabetical.
 */
export function sortByFrecency(commands: Command[],
 usageData: Record<string, WorkflowUsageEntry>,): Command[] {
 return [...commands].sort((a, b) => {
 const frecA = computeFrecency(usageData[a.id]);
 const frecB = computeFrecency(usageData[b.id]);
 if (frecA !== frecB) return frecB - frecA;
 // Alphabetical fallback
 return a.name.localeCompare(b.name);
 });
}

// ---- Fuse.js Search ----

export interface FuseSearchResult {
 item: Command;
 matches: readonly FuseResultMatch[];
}

/**
 * Create a Fuse.js instance for searching commands.
 */
export function createFuseIndex(commands: Command[]): Fuse<Command> {
 return new Fuse(commands, {
 keys: [
 { name: "name", weight: 2 },
 { name: "description", weight: 1 },
 { name: "tags", weight: 1.5 },
 ],
 threshold: 0.4,
 includeMatches: true,
 ignoreLocation: true,
 minMatchCharLength: 1,
 });
}

/**
 * Search commands using Fuse.js fuzzy search.
 * Returns results with match indices for highlighting.
 */
export function searchWorkflows(fuse: Fuse<Command>,
 query: string,): FuseSearchResult[] {
 if (!query.trim()) return [];
 const results = fuse.search(query);
 return results.map((r: FuseResult<Command>) => ({
 item: r.item,
 matches: r.matches ?? [],
 }));
}

// ---- Match Highlighting ----

export interface HighlightSegment {
 text: string;
 highlighted: boolean;
}

/**
 * Build highlight segments from Fuse.js match indices.
 * Returns segments with `highlighted: true` for matched characters.
 */
export function buildHighlightSegments(text: string,
 indices: readonly [number, number][] | undefined,): HighlightSegment[] {
 if (!indices || indices.length === 0) {
 return [{ text, highlighted: false }];
 }

 const segments: HighlightSegment[] = [];
 let lastIndex = 0;

 // Sort indices by start position
 const sorted = [...indices].sort((a, b) => a[0] - b[0]);

 for (const [start, end] of sorted) {
 // Non-highlighted text before this match
 if (start > lastIndex) {
 segments.push({
 text: text.slice(lastIndex, start),
 highlighted: false,
 });
 }
 // Highlighted match
 segments.push({
 text: text.slice(start, end + 1),
 highlighted: true,
 });
 lastIndex = end + 1;
 }

 // Remaining non-highlighted text
 if (lastIndex < text.length) {
 segments.push({
 text: text.slice(lastIndex),
 highlighted: false,
 });
 }

 return segments;
}

// ---- Discoverability ----

const SESSION_COUNT_KEY = "galWorkflowSessionCount";
const TOOLTIP_SHOWN_KEY = "galWorkflowTooltipShown";

/**
 * Increment session count and return whether the "NEW" badge should be shown.
 * Badge appears for the first 3 sessions.
 */
export async function shouldShowNewBadge(): Promise<boolean> {
 try {
 const result = await chrome.storage.local.get(SESSION_COUNT_KEY);
 const count = (result[SESSION_COUNT_KEY] as number) ?? 0;
 if (count < 3) {
 await chrome.storage.local.set({ [SESSION_COUNT_KEY]: count + 1 });
 return true;
 }
 } catch {
 // Non-critical
 }
 return false;
}

/**
 * Check if the one-time tooltip has been shown for a given platform.
 */
export async function hasTooltipBeenShown(platform: string): Promise<boolean> {
 try {
 const result = await chrome.storage.local.get(TOOLTIP_SHOWN_KEY);
 const shown = result[TOOLTIP_SHOWN_KEY] as Record<string, boolean> | undefined;
 return shown?.[platform] === true;
 } catch {
 return false;
 }
}

/**
 * Mark the one-time tooltip as shown for a platform.
 */
export async function markTooltipShown(platform: string): Promise<void> {
 try {
 const result = await chrome.storage.local.get(TOOLTIP_SHOWN_KEY);
 const shown = (result[TOOLTIP_SHOWN_KEY] as Record<string, boolean>) ?? {};
 shown[platform] = true;
 await chrome.storage.local.set({ [TOOLTIP_SHOWN_KEY]: shown });
 } catch {
 // Non-critical
 }
}
