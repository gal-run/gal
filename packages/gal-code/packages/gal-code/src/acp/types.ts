import type { McpServer } from "@agentclientprotocol/sdk"
import type { GalCodeClient } from "@scheduler-systems/gal-code-sdk/v2"
import type { ProviderID, ModelID } from "../provider/schema"

export interface ACPSessionState {
  id: string
  cwd: string
  mcpServers: McpServer[]
  createdAt: Date
  model?: {
    providerID: ProviderID
    modelID: ModelID
  }
  variant?: string
  modeId?: string
}

export interface ACPConfig {
  sdk: GalCodeClient
  defaultModel?: {
    providerID: ProviderID
    modelID: ModelID
  }
}
