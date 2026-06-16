/**
 * Meta Agentic Layer (MAL) Core Types
 *
 * Foundational types for MAL scoring, health, signals, learnings, and knowledge.
 * Issue #1314
 */

export interface MalScore {
  overall: number;
  dimensions: {
    prevention: { score: number; metric: string };
    delegation: { score: number; metric: string };
    automation: { score: number; metric: string };
    efficiency: { score: number; metric: string };
    accuracy: { score: number; metric: string };
  };
  trend: 'improving' | 'stable' | 'declining';
}

export interface MalHealthReport {
  score: number;
  issues: {
    critical: string[];
    warnings: string[];
    suggestions: string[];
  };
  coverage: {
    rulesForErrorPatterns: number;
    agentsForTaskTypes: number;
    skillsForWorkflows: number;
  };
  staleness: {
    unusedRules: string[];
    outdatedAgents: string[];
    missingPatterns: string[];
  };
}

export interface MalSignal {
  type: string;
  pattern?: string;
  context?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  timestamp?: string;
}

export interface MalLearning {
  id?: string;
  trigger: {
    type: string;
    signal?: string;
    count?: number;
  };
  when: {
    errorPatterns?: string[];
    conditions?: Record<string, unknown>;
  };
  then: {
    type: string;
    content?: string;
    confidence?: number;
  };
  meta: {
    created: string;
    lastApplied: string;
    successRate: number;
    projects: string[];
  };
}

export interface MalIssue {
  id: string;
  severity: 'critical' | 'warning' | 'suggestion';
  message: string;
  category: string;
}

export interface MalProjectProfile {
  orgName: string;
  projectName: string;
  learningCount: number;
  signalCount: number;
  knowledgeCount: number;
  score: MalScore;
}

export interface MalEvolutionResult {
  rulesGenerated: number;
  rulesUpdated: number;
  rulesRetired: number;
  timestamp: string;
}

export interface MalKnowledgeEntry {
  id?: string;
  type: 'pattern' | 'rule' | 'best-practice' | 'anti-pattern';
  title: string;
  content: string;
  source: string;
  usageCount: number;
  lastUsed?: string;
  tags?: string[];
}
