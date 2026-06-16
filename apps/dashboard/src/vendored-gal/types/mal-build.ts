/**
 * MAL BUILD Types
 *
 * Types for project analysis and agentic layer generation.
 * Issue #1315: Bootstrap Agentic Layers
 */

export interface MalBuildRequest {
  repoFullName: string;
  branch?: string;
}

export interface MalBuildResult {
  profile: MalBuildProjectProfile;
  generatedLayer: MalGeneratedLayer;
  score: number;
}

export interface MalBuildProjectProfile {
  languages: string[];
  frameworks: string[];
  patterns: string[];
  needs: {
    testing: 'unit' | 'integration' | 'e2e' | 'all';
    deployment: 'manual' | 'ci' | 'cd';
    collaboration: 'solo' | 'team' | 'enterprise';
  };
  existing: {
    hasTests: boolean;
    hasCi: boolean;
    hasDocker: boolean;
    configFiles: string[];
  };
}

export interface MalGeneratedLayer {
  rules: { path: string; content: string; source: 'universal' | 'framework' | 'project' }[];
  agents: { path: string; content: string; source: string }[];
  commands: { path: string; content: string; source: string }[];
  hooks: { path: string; content: string; source: string }[];
  settings: Record<string, unknown>;
}

export interface MalBuildAnalysis {
  id: string;
  orgName: string;
  repoFullName: string;
  profile: MalBuildProjectProfile;
  createdAt: string;
  status: 'pending' | 'analyzing' | 'complete' | 'failed';
}
