/**
 * MAL Cross-Project Learning Types (#1324)
 *
 * Types for knowledge sharing across projects within an organization.
 */

export interface MalCrossProjectConfig {
  enabled: boolean;
  sharePatterns: boolean;
  shareRules: boolean;
}

export interface MalCrossProjectInsight {
  sourceProject: string;
  targetProject: string;
  type: string;
  content: string;
  confidence: number;
}

export interface MalCrossProjectLearning {
  id: string;
  sourceProject: string;
  targetProject?: string;
  type: 'pattern' | 'rule' | 'anti-pattern' | 'best-practice';
  title: string;
  content: string;
  confidence: number;
  propagatedAt?: string;
  createdAt: string;
}

export interface MalCrossProjectNetwork {
  orgName: string;
  projects: {
    name: string;
    learningCount: number;
    score: number;
  }[];
  connections: {
    source: string;
    target: string;
    sharedLearnings: number;
  }[];
}

export interface MalCrossProjectPropagateRequest {
  learningId: string;
  targetProjects: string[];
}
