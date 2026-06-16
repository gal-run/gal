import { api } from "./api";

export interface AgentCardDefinition {
  id: string;
  name: string;
  role: string;
  bridge: string;
  capabilities: string[];
  channel: string;
  approvalClass: "auto" | "draft" | "approve";
  tools: string[];
  systemPrompt: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentCardListResponse {
  agents: AgentCardDefinition[];
}

export interface ModelConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface CreateAgentCardRequest {
  name: string;
  role: string;
  bridge: string;
  capabilities: string[];
  channel: string;
  approvalClass: "auto" | "draft" | "approve";
  tools: string[];
  systemPrompt: string;
  modelProvider?: ModelConfig;
}

export interface UpdateAgentCardRequest {
  name?: string;
  role?: string;
  bridge?: string;
  capabilities?: string[];
  channel?: string;
  approvalClass?: "auto" | "draft" | "approve";
  tools?: string[];
  systemPrompt?: string;
}

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "";

function orgPath(path: string): string {
  // Go gateway extracts org from JWT, not URL path.
  // Mal-svc reads org from auth.OrgID(ctx).
  return `${API_BASE}${path}`;
}

export async function listAgentCards(
  _orgName: string,
): Promise<AgentCardDefinition[]> {
  const response = await api.fetchWithAuth(orgPath("/agent-cards"));
  if (!response.ok) throw new Error("Failed to fetch agent cards");
  const data: AgentCardListResponse = await response.json();
  return data.agents;
}

export async function getAgentCard(
  _orgName: string,
  agentId: string,
): Promise<AgentCardDefinition> {
  const response = await api.fetchWithAuth(orgPath(`/agent-cards/${encodeURIComponent(agentId)}`));
  if (!response.ok) throw new Error("Failed to fetch agent card");
  const data = await response.json();
  return data.agent;
}

export async function createAgentCard(
  _orgName: string,
  request: CreateAgentCardRequest,
): Promise<AgentCardDefinition> {
  const response = await api.fetchWithAuth(
    orgPath("/agent-cards"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to create agent" }));
    throw new Error(error.error || "Failed to create agent");
  }
  const data = await response.json();
  return data.agent;
}

export async function updateAgentCard(
  _orgName: string,
  agentId: string,
  request: UpdateAgentCardRequest,
): Promise<void> {
  const response = await api.fetchWithAuth(
    orgPath(`/agent-cards/${encodeURIComponent(agentId)}`),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to update agent" }));
    throw new Error(error.error || "Failed to update agent");
  }
}

export async function deleteAgentCard(
  _orgName: string,
  agentId: string,
): Promise<void> {
  const response = await api.fetchWithAuth(
    orgPath(`/agent-cards/${encodeURIComponent(agentId)}`),
    { method: "DELETE" },
  );
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ error: "Failed to delete agent" }));
    throw new Error(error.error || "Failed to delete agent");
  }
}
