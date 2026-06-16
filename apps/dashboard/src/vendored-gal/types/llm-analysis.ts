// LLM Analysis Types for GAL-53 - AI-powered configuration analysis

import { AgentPlatform, IssueSeverity } from './index.js';

/**
 * Completeness metrics for configuration quality
 */
export interface CompletenessMetrics {
  hasDocumentation: boolean;
  hasErrorHandling: boolean;
  hasTestCoverage: boolean;
  hasSecurityChecks: boolean;
  completenessPercentage: number; // 0-100
}

/**
 * Configuration quality score with detailed breakdown
 */
export interface ConfigurationQualityScore {
  score: number; // 0-100
  category: 'functionality' | 'security' | 'performance' | 'maintainability' | 'documentation';
  reasons: string[];
  suggestions: string[];
  completeness: CompletenessMetrics;
}

/**
 * Best practice recommendation with impact assessment
 */
export interface BestPracticeRecommendation {
  title: string;
  description: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  complexity: 'simple' | 'moderate' | 'complex';
  estimatedBenefit: string;
  examples: string[];
}

/**
 * Security insight with detailed risk analysis
 */
export interface SecurityInsight {
  category: 'authentication' | 'authorization' | 'data_exposure' | 'injection' | 'command_execution' | 'network_security' | 'secret_management';
  finding: string;
  severity: IssueSeverity;
  riskDescription: string;
  mitigation: string;
  evidenceLocations: string[];
}

/**
 * Comprehensive LLM analysis report for repository configurations
 */
export interface LLMAnalysisReport {
  repositoryName: string;
  platform: AgentPlatform;
  analysisDate: Date;
  overallScore: number; // 0-100
  qualityScores: ConfigurationQualityScore[];
  bestPractices: BestPracticeRecommendation[];
  securityInsights: SecurityInsight[];
}

/**
 * LLM analysis request payload
 */
export interface LLMAnalysisRequest {
  repositoryName: string;
  platform: AgentPlatform;
  orgName: string;
  configurations: {
    type: 'settings' | 'rule' | 'command' | 'hook';
    fileName: string;
    content: string;
  }[];
}

/**
 * LLM analysis batch result for multiple repositories
 */
export interface LLMAnalysisBatchResult {
  orgName: string;
  analyzedAt: Date;
  reports: LLMAnalysisReport[];
  totalRepositories: number;
  averageScore: number; // 0-100
  criticalFindings: number;
  highPriorityRecommendations: BestPracticeRecommendation[];
}

/**
 * LLM-powered configuration comparison result
 */
export interface ConfigurationComparisonResult {
  fileName: string;
  platform: AgentPlatform;
  comparedAt: Date;
  versions: {
    repoName: string;
    version: number;
    score: number;
    strengths: string[];
    weaknesses: string[];
  }[];
  recommendation: {
    bestVersion: number;
    bestRepo: string;
    reason: string;
    confidence: number; // 0-100
  };
  synthesizedBestPractices: string[];
}

// GAL-54: Workflow Testing Types

/**
 * Request to test a workflow (command or hook) in sandbox
 */
export interface WorkflowTestRequest {
  fileName: string;
  type: 'command' | 'hook';
  platform: AgentPlatform;
  content: string;
  testCases?: string[];
  repoName?: string;
  maxIterations?: number;
}

/**
 * Single iteration of workflow testing
 */
export interface WorkflowIteration {
  iteration: number;
  content: string;
  executionResult: {
    success: boolean;
    output: string;
    error?: string;
    executionTimeMs: number;
    logs: string[];
  };
  evaluation: {
    score: number;
    recommendation: 'approve' | 'revise' | 'reject';
    reasoning: string;
    issues: Array<{ type: string; message: string; severity: string }>;
    suggestedImprovements: string[];
  };
  timestamp: Date;
}

/**
 * Result of workflow testing with iteration history
 */
export interface WorkflowTestResult {
  success: boolean;
  fileName: string;
  type: 'command' | 'hook';
  platform: AgentPlatform;
  iterations: WorkflowIteration[];
  finalScore: number;
  recommendation: 'approve' | 'revise' | 'reject';
  executionTimeMs: number;
  testedAt: Date;
  error?: string;
}

/**
 * Comprehensive workflow test report for organization
 */
export interface WorkflowTestReport {
  orgName: string;
  generatedAt: Date;
  totalTests: number;
  passedTests: number;
  averageScore: number;
  results: WorkflowTestResult[];
  summary: {
    byRecommendation: {
      approve: number;
      revise: number;
      reject: number;
    };
    totalIterations: number;
    averageIterationsPerTest: number;
  };
}
