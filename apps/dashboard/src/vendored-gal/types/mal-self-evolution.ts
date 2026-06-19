/**
 * MAL Self-Evolution Types (#1322)
 *
 * Types for meta-layer self-improvement tracking and suggestion management.
 */

export interface MalSelfEvolutionConfig {
  enabled: boolean;
  maxIterations: number;
  evaluationInterval: number;
}

export interface MalSelfEvolutionReport {
  iteration: number;
  improvements: string[];
  timestamp: string;
}

export interface MalSelfEvolutionMetrics {
  totalSuggestions: number;
  acceptedSuggestions: number;
  rejectedSuggestions: number;
  averageImpact: number;
  lastEvaluationAt: string;
  improvementRate: number;
}

export interface MalSelfEvolutionSuggestion {
  id: string;
  type: 'rule' | 'agent' | 'workflow' | 'knowledge';
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high';
  confidence: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  acceptedAt?: string;
}
