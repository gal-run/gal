import { api } from "./api";

export interface Policy {
  id: string;
  name: string;
  description?: string;
  isActive: boolean;
  isBuiltin?: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  config: PolicyConfig;
}

export interface PolicyConfig {
  platform?: string;
  hash?: string;
  version?: string;
  approvedAt?: string;
  approvedBy?: string;
  instructions?: string | null;
  commands?: unknown[];
  hooks?: unknown[];
  settings?: unknown;
  subagents?: unknown[];
  skills?: unknown[];
}

export interface PolicyListResponse {
  policies: Policy[];
}

export interface CreatePolicyRequest {
  name: string;
  description?: string;
  isActive?: boolean;
  config?: Partial<PolicyConfig>;
  duplicateFromId?: string;
}

export interface UpdatePolicyRequest {
  name?: string;
  description?: string;
  config?: Partial<PolicyConfig>;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "";

export async function listPolicies(orgName: string): Promise<Policy[]> {
  const response = await api.fetchWithAuth(
    `${API_BASE}/organizations/${encodeURIComponent(orgName)}/policies`,
  );
  if (!response.ok) throw new Error("Failed to fetch policies");
  const data: PolicyListResponse = await response.json();
  return data.policies;
}

export async function getPolicy(
  orgName: string,
  policyId: string,
): Promise<Policy> {
  const response = await api.fetchWithAuth(
    `${API_BASE}/organizations/${encodeURIComponent(orgName)}/policies/${encodeURIComponent(policyId)}`,
  );
  if (!response.ok) throw new Error("Failed to fetch policy");
  const data = await response.json();
  return data.policy;
}

export async function createPolicy(
  orgName: string,
  request: CreatePolicyRequest,
): Promise<Policy> {
  const response = await api.fetchWithAuth(
    `${API_BASE}/organizations/${encodeURIComponent(orgName)}/policies`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to create policy" }));
    throw new Error(error.error || "Failed to create policy");
  }
  const data = await response.json();
  return data.policy;
}

export async function updatePolicy(
  orgName: string,
  policyId: string,
  request: UpdatePolicyRequest,
): Promise<void> {
  const response = await api.fetchWithAuth(
    `${API_BASE}/organizations/${encodeURIComponent(orgName)}/policies/${encodeURIComponent(policyId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to update policy" }));
    throw new Error(error.error || "Failed to update policy");
  }
}

export async function deletePolicy(
  orgName: string,
  policyId: string,
): Promise<void> {
  const response = await api.fetchWithAuth(
    `${API_BASE}/organizations/${encodeURIComponent(orgName)}/policies/${encodeURIComponent(policyId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to delete policy" }));
    throw new Error(error.error || "Failed to delete policy");
  }
}

export async function activatePolicy(
  orgName: string,
  policyId: string,
): Promise<void> {
  const response = await api.fetchWithAuth(
    `${API_BASE}/organizations/${encodeURIComponent(orgName)}/policies/${encodeURIComponent(policyId)}/activate`,
    { method: "POST" },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to activate policy" }));
    throw new Error(error.error || "Failed to activate policy");
  }
}

export interface PolicyCheckRequest {
  tool: string;
  input: Record<string, unknown>;
  context?: {
    repo?: string;
    branch?: string;
    userId?: string;
  };
}

export interface PolicyCheckResult {
  allowed: boolean;
  action: "allowed" | "denied" | "audited";
  matchedPolicyId?: string;
  matchedPolicyName?: string;
  reason?: string;
  evaluationTime?: number;
}

export async function checkPolicy(
  orgName: string,
  request: PolicyCheckRequest,
): Promise<PolicyCheckResult> {
  const response = await api.fetchWithAuth(
    `${API_BASE}/organizations/${encodeURIComponent(orgName)}/policies/check`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Policy check failed" }));
    throw new Error(error.error || "Policy check failed");
  }
  return response.json();
}
