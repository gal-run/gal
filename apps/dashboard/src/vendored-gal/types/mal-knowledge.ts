/**
 * MAL Knowledge Store Types (#1319)
 *
 * Types for universal knowledge store of reusable agentic patterns.
 */

import type { MalKnowledgeEntry } from './mal.js';

export interface MalKnowledgeBase {
  orgName: string;
  entries: MalKnowledgeEntry[];
  lastUpdated: string;
}

export interface MalKnowledgeSearchResult {
  entry: MalKnowledgeEntry;
  relevanceScore: number;
}

export interface MalKnowledgeSearchRequest {
  query?: string;
  type?: MalKnowledgeEntry['type'];
  tags?: string[];
  limit?: number;
}

export interface MalKnowledgeStats {
  totalEntries: number;
  byType: Record<string, number>;
  topTags: { tag: string; count: number }[];
  lastUpdated: string;
}
