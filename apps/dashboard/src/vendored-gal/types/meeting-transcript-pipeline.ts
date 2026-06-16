/**
 * Shared types for the meeting transcript pipeline (#4477).
 */

export type TranscriptSectionType = 'summary' | 'notes' | 'action_items' | 'other';

export interface TranscriptSection {
  heading?: string;
  content: string;
  type: TranscriptSectionType;
}

export interface TranscriptDocument {
  id: string;
  title: string;
  content: string;
  structuredContent: TranscriptSection[];
  meetingDate?: string;
  participants: string[];
  calendarEventId?: string;
  sourceUrl?: string;
}

export interface MeetingNote {
  id: string;
  title: string;
  date?: string;
  calendarEventId?: string;
  sourceUrl?: string;
}

export type DraftIssueType = 'bug' | 'feature' | 'task' | 'decision' | 'follow-up';

export interface DraftIssue {
  type: DraftIssueType;
  title: string;
  repo: string;
  body: string;
  labels: string[];
  milestone?: string | null;
  assignee?: string | null;
  confidence: number;
  transcriptQuote: string;
}

export interface PipelineResult {
  meetingId?: string;
  meetingDate?: string;
  sourceTitle?: string;
  draftIssues: DraftIssue[];
  processingTimeMs: number;
  sessionId?: string;
  agentSessionId?: string;
}
