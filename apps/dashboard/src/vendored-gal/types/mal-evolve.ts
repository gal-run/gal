/**
 * MAL Evolve Types (#1318)
 *
 * Types for automatic agentic layer improvements and evolution history.
 */

export interface MalEvolutionConfig {
  maxRulesPerCycle: number;
  minConfidence: number;
  retirementThreshold: number;
}

export interface MalEvolutionCycle {
  id: string;
  startedAt: string;
  completedAt?: string;
  result?: {
    rulesGenerated: number;
    rulesUpdated: number;
    rulesRetired: number;
  };
}

export interface MalEvolutionChange {
  id: string;
  type: 'add' | 'update' | 'retire';
  target: string;
  description: string;
  confidence: number;
  appliedAt?: string;
}

export interface MalEvolutionHistoryEntry {
  id: string;
  orgName: string;
  changes: MalEvolutionChange[];
  scoreBefore: number;
  scoreAfter: number;
  appliedAt: string;
  appliedBy: string;
  status: 'applied' | 'rolled-back' | 'pending';
}

export interface MalRollbackRequest {
  evolutionId: string;
  reason?: string;
}

export interface MalEvolveSuggestion {
  id: string;
  type: 'add' | 'update' | 'retire';
  target: string;
  description: string;
  confidence: number;
  impact: 'low' | 'medium' | 'high';
  createdAt: string;
}
