/**
 * Canonical GAL-compatible agent definition contracts.
 *
 * This package defines what an agent is. It intentionally does not define how
 * agents are discovered, routed, governed, queued, or executed.
 */

export const GAL_AGENT_CARD_SCHEMA_VERSION = 'gal.agent-card.v1' as const
export const GAL_AGENT_TASK_SCHEMA_VERSION = 'gal.agent-task.v1' as const
export const GAL_AGENT_HEALTH_SCHEMA_VERSION = 'gal.agent-health.v1' as const
export const GAL_AGENT_STATUS_SCHEMA_VERSION = 'gal.agent-status.v1' as const

export const GAL_AGENT_TASK_STATES = [
  'submitted',
  'accepted',
  'working',
  'blocked',
  'completed',
  'failed',
  'canceled',
] as const

export type GalAgentTaskState = (typeof GAL_AGENT_TASK_STATES)[number]

export const GAL_AGENT_TERMINAL_TASK_STATES = ['completed', 'failed', 'canceled'] as const

export type GalAgentTerminalTaskState = (typeof GAL_AGENT_TERMINAL_TASK_STATES)[number]

export const GAL_AGENT_HEALTH_STATES = ['ok', 'degraded', 'unavailable'] as const

export type GalAgentHealthState = (typeof GAL_AGENT_HEALTH_STATES)[number]

export const GAL_AGENT_COMPONENT_STATES = [
  'operational',
  'degraded',
  'unavailable',
  'maintenance',
  'monitor_pending',
] as const

export type GalAgentComponentState = (typeof GAL_AGENT_COMPONENT_STATES)[number]

export type GalAgentEnvironment = 'local' | 'development' | 'staging' | 'production'

export type GalAgentTransport = 'a2a' | 'grpc' | 'http_json' | 'graphql' | 'mcp' | 'cli'

export type GalAgentRuntimeKind =
  | 'direct_api'
  | 'queue_worker'
  | 'gal_code_background_session'
  | 'kata_background_session'
  | 'external_service'
  | 'manual_handoff'

export type GalAgentAuthMethod =
  | 'github_app'
  | 'oidc_jwt'
  | 'mtls'
  | 'user_oauth'
  | 'service_token'
  | 'api_key'

export type GalAgentActorType = 'user' | 'service' | 'agent' | 'system'

export type GalAgentTaskPriority = 'low' | 'normal' | 'high' | 'critical'

export type GalAgentDependencyKind =
  | 'api'
  | 'database'
  | 'identity'
  | 'model_provider'
  | 'network'
  | 'queue'
  | 'storage'
  | 'worker'
  | 'other'

export type GalJsonSchema = Record<string, unknown>

export interface GalAgentEndpoint {
  transport: GalAgentTransport
  url?: string
  command?: string
  packageName?: string
  authMethods: GalAgentAuthMethod[]
  description?: string
}

export interface GalAgentTaskSchemaRef {
  id: string
  version: string
  taskType: string
  inputSchema?: GalJsonSchema
  outputSchema?: GalJsonSchema
  artifactSchema?: GalJsonSchema
}

export interface GalAgentModelConfig {
  provider: string
  model: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
  stopSequences?: string[]
}

export interface GalAgentCapability {
  id: string
  name: string
  description: string
  taskTypes: string[]
  inputModes: string[]
  outputModes: string[]
  requiredScopes?: string[]
  schemaRefs?: string[]
  modelProvider?: GalAgentModelConfig
}

export interface GalAgentAuthProfile {
  methods: GalAgentAuthMethod[]
  requiredScopes: string[]
  supportsDelegatedUserIdentity: boolean
  supportsServiceIdentity: boolean
}

export interface GalAgentSloProfile {
  startupTargetMs?: number
  firstStatusTargetMs?: number
  completionTargetMs?: number
  availabilityTarget?: string
  healthEndpointPath?: string
  readinessEndpointPath?: string
  statusEndpointPath?: string
}

export interface GalAgentAuditProfile {
  logName: string
  correlationIdHeader?: string
  artifactRetentionDays?: number
  evidenceRequired: boolean
}

export type GalAgentArtifactKind =
  | 'json'
  | 'markdown'
  | 'text'
  | 'diff'
  | 'log'
  | 'url'
  | 'file'
  | 'other'

export interface GalAgentEvidenceRequirement {
  required: boolean
  acceptedArtifactKinds: readonly GalAgentArtifactKind[]
  requiredArtifactNames: readonly string[]
  minimumReviewers?: number
  notes?: string[]
}

export interface GalAgentOwnershipBoundary {
  allowedRepos: readonly string[]
  allowedPathGlobs: readonly string[]
  deniedPathGlobs?: readonly string[]
  requiresCleanWorktree: boolean
  mayCreateBranches: boolean
  mayCommit: boolean
  mayPush?: boolean
  destructiveActionsAllowed: boolean
  notes?: string[]
}

export interface GalAgentCorrelationPolicy {
  requiresParentWaveId: boolean
  requiresParentTaskId: boolean
  waveIdField: string
  taskIdField: string
  ledgerIdField?: string
  statusEventFields: readonly string[]
}

export interface GalAgentRuntimeProfile {
  defaultRuntime: GalAgentRuntimeKind
  supportedRuntimes: GalAgentRuntimeKind[]
  backgroundSessionRequired: boolean
  backgroundSessionSuitable?: boolean
  maxSessionDurationMs?: number
  resumable?: boolean
}

export interface GalAgentGovernanceProfile {
  evidence: GalAgentEvidenceRequirement
  ownership: GalAgentOwnershipBoundary
  correlation: GalAgentCorrelationPolicy
}

export interface GalAgentCard {
  schemaVersion: typeof GAL_AGENT_CARD_SCHEMA_VERSION
  agentId: string
  displayName: string
  description: string
  ownerOrg: string
  repo: string
  sourceUrl?: string
  serviceUrl?: string
  environments: GalAgentEnvironment[]
  endpoints: GalAgentEndpoint[]
  capabilities: GalAgentCapability[]
  auth: GalAgentAuthProfile
  taskSchemas: GalAgentTaskSchemaRef[]
  slo?: GalAgentSloProfile
  audit: GalAgentAuditProfile
  runtime: GalAgentRuntimeProfile
  governance?: GalAgentGovernanceProfile
  metadata?: Record<string, unknown>
}

export interface GalAgentActorIdentity {
  type: GalAgentActorType
  id: string
  displayName?: string
  email?: string
  serviceId?: string
  agentId?: string
  agentSessionId?: string
  githubActor?: string
}

export interface GalAgentDelegatedAuthorization {
  methods: GalAgentAuthMethod[]
  scopes: string[]
  policyDecisionId?: string
  approvedConfigId?: string
  installationId?: number
  expiresAt?: string
  reason?: string
}

export interface GalAgentAuditContext {
  correlationId: string
  requestedBy: GalAgentActorIdentity
  callerService: GalAgentActorIdentity
  calleeAgent: GalAgentActorIdentity
  source?: {
    repo?: string
    issueNumber?: number
    prNumber?: number
    url?: string
  }
  evidenceUrls?: string[]
}

export interface GalAgentArtifact {
  id: string
  name: string
  kind: GalAgentArtifactKind
  url?: string
  mediaType?: string
  sizeBytes?: number
  metadata?: Record<string, unknown>
}

export interface GalAgentTaskInput {
  taskType: string
  payload: Record<string, unknown>
  schemaRef?: string
  priority?: GalAgentTaskPriority
  timeoutMs?: number
}

export interface GalAgentTaskOutput {
  payload: Record<string, unknown>
  schemaRef?: string
  summary?: string
}

export interface GalAgentTaskError {
  code: string
  message: string
  retryable: boolean
  details?: Record<string, unknown>
}

export interface GalAgentTaskTransition {
  state: GalAgentTaskState
  at: string
  actor: GalAgentActorIdentity
  reason: string
  message?: string
  metadata?: Record<string, unknown>
}

export interface GalAgentTask {
  schemaVersion: typeof GAL_AGENT_TASK_SCHEMA_VERSION
  id: string
  correlationId: string
  parentTaskId?: string
  agentId: string
  state: GalAgentTaskState
  caller: GalAgentActorIdentity
  callee: GalAgentActorIdentity
  authorization: GalAgentDelegatedAuthorization
  audit: GalAgentAuditContext
  input: GalAgentTaskInput
  output?: GalAgentTaskOutput
  error?: GalAgentTaskError
  artifacts: GalAgentArtifact[]
  history: GalAgentTaskTransition[]
  createdAt: string
  updatedAt: string
  expiresAt?: string
}

export interface GalAgentTaskCreateRequest {
  correlationId?: string
  parentTaskId?: string
  caller: GalAgentActorIdentity
  calleeAgentId: string
  authorization: GalAgentDelegatedAuthorization
  input: GalAgentTaskInput
  audit?: Partial<GalAgentAuditContext>
}

export interface GalAgentTaskStatusResponse {
  task: GalAgentTask
  agentCard?: GalAgentCard
}

export interface GalAgentHealthResponse {
  schemaVersion: typeof GAL_AGENT_HEALTH_SCHEMA_VERSION
  agentId: string
  status: GalAgentHealthState
  checkedAt: string
  requestId?: string
  version?: string
  uptimeSeconds?: number
}

export interface GalAgentDependencyStatus {
  id: string
  name: string
  kind: GalAgentDependencyKind
  status: GalAgentComponentState
  public: boolean
  observedAt?: string
  latencyMs?: number
  statusCode?: number
  retryAfter?: string
  requestId?: string
  message?: string
}

export interface GalAgentSyntheticProbe {
  id: string
  name: string
  componentId: string
  method: 'GET' | 'HEAD' | 'POST'
  path?: string
  url?: string
  expectedStatuses: number[]
  timeoutMs: number
  safeForPublicStatus: boolean
}

export interface GalAgentStatusResponse {
  schemaVersion: typeof GAL_AGENT_STATUS_SCHEMA_VERSION
  agentId: string
  displayName?: string
  status: GalAgentComponentState
  statusPageUrl: string
  generatedAt: string
  requestId?: string
  correlationId?: string
  dependencies: GalAgentDependencyStatus[]
  syntheticProbes?: GalAgentSyntheticProbe[]
  message?: string
}

const GAL_AGENT_TASK_STATE_VALUES = new Set<string>(GAL_AGENT_TASK_STATES)
const GAL_AGENT_TERMINAL_TASK_STATE_VALUES = new Set<string>(GAL_AGENT_TERMINAL_TASK_STATES)
const GAL_AGENT_HEALTH_STATE_VALUES = new Set<string>(GAL_AGENT_HEALTH_STATES)
const GAL_AGENT_COMPONENT_STATE_VALUES = new Set<string>(GAL_AGENT_COMPONENT_STATES)

export function isGalAgentTaskState(value: unknown): value is GalAgentTaskState {
  return typeof value === 'string' && GAL_AGENT_TASK_STATE_VALUES.has(value)
}

export function isGalAgentTerminalTaskState(value: unknown): value is GalAgentTerminalTaskState {
  return typeof value === 'string' && GAL_AGENT_TERMINAL_TASK_STATE_VALUES.has(value)
}

export function isGalAgentHealthState(value: unknown): value is GalAgentHealthState {
  return typeof value === 'string' && GAL_AGENT_HEALTH_STATE_VALUES.has(value)
}

export function isGalAgentComponentState(value: unknown): value is GalAgentComponentState {
  return typeof value === 'string' && GAL_AGENT_COMPONENT_STATE_VALUES.has(value)
}

export function validateGalAgentCard(card: GalAgentCard): void {
  if (card.schemaVersion !== GAL_AGENT_CARD_SCHEMA_VERSION) {
    throw new Error(`Agent Card schemaVersion must be ${GAL_AGENT_CARD_SCHEMA_VERSION}`)
  }

  if (card.agentId.trim() === '') {
    throw new Error('Agent Card agentId is required')
  }

  if (card.capabilities.length === 0) {
    throw new Error('Agent Card must declare at least one capability')
  }

  for (const capability of card.capabilities) {
    if (capability.taskTypes.length === 0) {
      throw new Error(`Capability ${capability.id} must declare at least one task type`)
    }
  }

  if (!card.runtime.supportedRuntimes.includes(card.runtime.defaultRuntime)) {
    throw new Error(`Default runtime ${card.runtime.defaultRuntime} must be in supportedRuntimes`)
  }

  if (card.governance) {
    if (card.governance.evidence.required && card.governance.evidence.acceptedArtifactKinds.length === 0) {
      throw new Error('Governed Agent Card evidence must declare acceptedArtifactKinds')
    }

    if (card.governance.ownership.allowedRepos.length === 0) {
      throw new Error('Governed Agent Card ownership must declare allowedRepos')
    }

    if (
      card.governance.correlation.requiresParentWaveId &&
      card.governance.correlation.waveIdField.trim() === ''
    ) {
      throw new Error('Governed Agent Card correlation must declare waveIdField')
    }

    if (
      card.governance.correlation.requiresParentTaskId &&
      card.governance.correlation.taskIdField.trim() === ''
    ) {
      throw new Error('Governed Agent Card correlation must declare taskIdField')
    }
  }
}
