/**
 * Enterprise Agent Card Profile Types
 *
 * A2A v0.3.0 compatible Agent Card types with enterprise extensions
 * for the GAL Agent Fabric. Based on ADR-001.
 *
 * @see https://a2a-protocol.org/v0.3.0/specification/#5-agent-discovery-the-agent-card
 */

export const A2A_SCHEMA_VERSION = '0.3.0' as const
export const ENTERPRISE_PROFILE_VERSION = '0.1.0' as const

export type A2ATransport = 'grpc' | 'jsonrpc' | 'rest'
export type AuditLevel = 'full' | 'minimal' | 'none'
export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted'
export type AuthScheme = 'bearer' | 'basic' | 'apikey' | 'mtls'

export interface AgentProvider {
  organization: string
  url: string
}

export interface AgentCapabilities {
  streaming?: boolean
  pushNotifications?: boolean
  stateTransitionHistory?: boolean
}

export interface SecurityScheme {
  schemes: AuthScheme[]
}

export interface AgentSkill {
  id: string
  name: string
  description: string
  tags?: string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
}

export interface AgentInterface {
  protocolId: string
  transportProtocol: A2ATransport
  uri: string
  metadata?: Record<string, string>
}

export interface EnterpriseOwner {
  team: string
  contact: string
}

export interface EnterpriseSlo {
  responseTime?: string
  availability?: number
}

export interface EnterpriseMetadata {
  tenantId: string
  serviceId: string
  auditLevel?: AuditLevel
  dataClassification?: DataClassification
  owner: EnterpriseOwner
  slo?: EnterpriseSlo
  allowedCallers?: string[]
}

export interface AgentExtension {
  uri: string
  description?: string
  required?: boolean
  params?: Record<string, unknown>
}

export interface EnterpriseAgentCard {
  schemaVersion: typeof A2A_SCHEMA_VERSION
  name: string
  description: string
  url: string
  preferredTransport: A2ATransport
  version: string
  provider: AgentProvider
  capabilities: AgentCapabilities
  authentication: SecurityScheme
  skills: AgentSkill[]
  additionalInterfaces?: AgentInterface[]
  documentationUrl?: string
  defaultInputModes?: string[]
  defaultOutputModes?: string[]
  extensions?: AgentExtension[]
  'x-enterprise': EnterpriseMetadata
}

export interface EnterpriseAgentCardValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export const ALLOWED_TRANSPORTS: readonly A2ATransport[] = ['grpc', 'jsonrpc', 'rest'] as const
export const ALLOWED_AUTH_SCHEMES: readonly AuthScheme[] = ['bearer', 'basic', 'apikey', 'mtls'] as const
export const ALLOWED_AUDIT_LEVELS: readonly AuditLevel[] = ['full', 'minimal', 'none'] as const
export const ALLOWED_DATA_CLASSIFICATIONS: readonly DataClassification[] = [
  'public',
  'internal',
  'confidential',
  'restricted',
] as const

export function isA2ATransport(value: unknown): value is A2ATransport {
  return typeof value === 'string' && ALLOWED_TRANSPORTS.includes(value as A2ATransport)
}

export function isAuthScheme(value: unknown): value is AuthScheme {
  return typeof value === 'string' && ALLOWED_AUTH_SCHEMES.includes(value as AuthScheme)
}

export function isAuditLevel(value: unknown): value is AuditLevel {
  return typeof value === 'string' && ALLOWED_AUDIT_LEVELS.includes(value as AuditLevel)
}

export function isDataClassification(value: unknown): value is DataClassification {
  return typeof value === 'string' && ALLOWED_DATA_CLASSIFICATIONS.includes(value as DataClassification)
}
