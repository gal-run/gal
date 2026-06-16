export interface MalEvaluateRequest {
  repoFullName: string;
  branch?: string;
  period?: 'day' | 'week' | 'month';
}

export interface MalScoreReport {
  id: string;
  orgName: string;
  repoFullName: string;
  overall: number;
  dimensions: {
    prevention: { score: number; metric: string; details: string };
    delegation: { score: number; metric: string; details: string };
    automation: { score: number; metric: string; details: string };
    efficiency: { score: number; metric: string; details: string };
    accuracy: { score: number; metric: string; details: string };
  };
  trend: 'improving' | 'stable' | 'degrading';
  comparison: {
    vsLastWeek: number;
    vsUniversalAvg: number;
    vsSimilarProjects: number;
  };
  createdAt: string;
}

export interface MalBenchmarkResult {
  id: string;
  orgName: string;
  repoFullName: string;
  score: number;
  rank: number;
  percentile: number;
  comparedTo: number;
  topDimension: string;
  weakestDimension: string;
  createdAt: string;
}

export interface MalImprovementPlan {
  id: string;
  orgName: string;
  repoFullName: string;
  currentScore: number;
  targetScore: number;
  steps: MalImprovementStep[];
  estimatedImpact: number;
  createdAt: string;
}

export interface MalImprovementStep {
  order: number;
  action: string;
  dimension: string;
  expectedImpact: number;
  effort: 'low' | 'medium' | 'high';
  autoApplicable: boolean;
}
