import { api } from "./api";

export interface EvalSuiteSummary {
  id: string;
  name: string;
  description: string;
  subject: {
    kind: string;
    agentId?: string;
    taskType?: string;
    repo?: string;
  };
  evaluatorId: string;
  caseCount: number;
  latestReport?: EvalReportSummary;
}

export interface EvalReportSummary {
  suiteId: string;
  score: number;
  passed: boolean;
  generatedAt: string;
  metrics: { metric: string; score: number; correct: number; total: number; passed: boolean }[];
}

export interface EvalMetricResult {
  metric: string;
  score: number;
  correct: number;
  total: number;
  passed: boolean;
  gate?: { metric: string; minScore: number };
}

export interface EvalCaseResult {
  caseId: string;
  title?: string;
  tags?: string[];
  score: number;
  passed: boolean;
  output: Record<string, unknown>;
  fields: {
    path: string;
    metric: string;
    expected: unknown;
    actual: unknown;
    score: number;
    passed: boolean;
    suggestion?: string;
  }[];
}

export interface EvalReport {
  schemaVersion: string;
  suiteId: string;
  suiteName: string;
  evaluatorId: string;
  adapterId: string;
  subject: {
    kind: string;
    agentId?: string;
    taskType?: string;
    repo?: string;
  };
  generatedAt: string;
  score: number;
  passed: boolean;
  metrics: EvalMetricResult[];
  cases: EvalCaseResult[];
  suggestions: string[];
}

export interface EvalSuiteListResponse {
  suites: EvalSuiteSummary[];
}

export interface RunEvalRequest {
  suiteId: string;
  agentId?: string;
  adapterId?: string;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "";

export async function listEvalSuites(
  orgName: string,
): Promise<EvalSuiteSummary[]> {
  const response = await api.fetchWithAuth(
    `${API_BASE}/organizations/${encodeURIComponent(orgName)}/evals/suites`,
  );
  if (!response.ok) throw new Error("Failed to fetch eval suites");
  const data: EvalSuiteListResponse = await response.json();
  return data.suites;
}

export async function getEvalReport(
  orgName: string,
  suiteId: string,
): Promise<EvalReport> {
  const response = await api.fetchWithAuth(
    `${API_BASE}/organizations/${encodeURIComponent(orgName)}/evals/suites/${encodeURIComponent(suiteId)}/report`,
  );
  if (!response.ok) throw new Error("Failed to fetch eval report");
  return response.json();
}

export async function runEval(
  orgName: string,
  request: RunEvalRequest,
): Promise<EvalReport> {
  const response = await api.fetchWithAuth(
    `${API_BASE}/organizations/${encodeURIComponent(orgName)}/evals/run`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Eval run failed" }));
    throw new Error(error.error || "Eval run failed");
  }
  return response.json();
}
