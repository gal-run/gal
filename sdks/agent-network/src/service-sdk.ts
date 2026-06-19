import {
  GAL_SERVICE_HEALTH_SCHEMA_VERSION,
  GAL_SERVICE_STATUS_SCHEMA_VERSION,
  GAL_SERVICE_TASK_SCHEMA_VERSION,
  type GalServiceActorIdentity,
  type GalServiceAgentCard,
  type GalServiceArtifact,
  type GalServiceAuditContext,
  type GalServiceComponentState,
  type GalServiceDelegatedAuthorization,
  type GalServiceDependencyStatus,
  type GalServiceHealthResponse,
  type GalServiceRuntimeKind,
  type GalServiceStatusResponse,
  type GalServiceTask,
  type GalServiceTaskCreateRequest,
  type GalServiceTaskError,
  type GalServiceTaskInput,
  type GalServiceTaskOutput,
  type GalServiceTaskState,
  type GalServiceTaskTransition,
  type GalServiceTerminalTaskState,
  type GalServiceSyntheticProbe,
  isGalServiceTerminalTaskState,
} from './service-agent.js'

export interface GalServiceIdGenerator {
  taskId(): string
  correlationId(): string
}

export interface GalServiceSdkRuntimeBridge {
  directApi?: GalServiceDirectApiBridge
  queue?: GalServiceQueueBridge
  galCodeBackgroundSession?: GalServiceBackgroundSessionBridge
}

export interface GalServiceDirectApiBridge {
  execute(input: GalServiceTaskInput, task: GalServiceTask): Promise<GalServiceTaskOutput>
}

export interface GalServiceQueueBridge {
  enqueue(task: GalServiceTask): Promise<GalServiceQueueReceipt>
}

export interface GalServiceBackgroundSessionBridge {
  start(task: GalServiceTask): Promise<GalServiceBackgroundSessionReceipt>
}

export interface GalServiceQueueReceipt {
  queueName: string
  messageId: string
  enqueuedAt: string
  auditUrl?: string
}

export interface GalServiceBackgroundSessionReceipt {
  sessionId: string
  statusUrl?: string
  auditUrl?: string
  startedAt: string
  firstHeartbeatTargetMs?: number
}

export interface GalServiceMcpToolDescriptor {
  name: string
  description: string
  taskType: string
  requiredScopes: string[]
  inputSchema?: Record<string, unknown>
}

export interface GalServiceA2aAdapterDescriptor {
  agentId: string
  agentCard: GalServiceAgentCard
  taskTypes: string[]
}

export interface GalServiceSdkOptions {
  agentCard: GalServiceAgentCard
  now?: () => string
  ids?: GalServiceIdGenerator
  runtime?: GalServiceSdkRuntimeBridge
}

export interface GalServiceTaskTransitionOptions {
  state: GalServiceTaskState
  actor: GalServiceActorIdentity
  reason: string
  message?: string
  output?: GalServiceTaskOutput
  error?: GalServiceTaskError
  artifacts?: GalServiceArtifact[]
  metadata?: Record<string, unknown>
}

export interface GalServiceStatusOptions {
  status: GalServiceComponentState
  statusPageUrl: string
  dependencies?: GalServiceDependencyStatus[]
  syntheticProbes?: GalServiceSyntheticProbe[]
  requestId?: string
  correlationId?: string
  message?: string
}

export interface GalServiceSdk {
  readonly agentCard: GalServiceAgentCard
  readonly runtime: GalServiceSdkRuntimeBridge
  createTask(request: GalServiceTaskCreateRequest): GalServiceTask
  transitionTask(task: GalServiceTask, transition: GalServiceTaskTransitionOptions): GalServiceTask
  completeTask(
    task: GalServiceTask,
    actor: GalServiceActorIdentity,
    output: GalServiceTaskOutput,
    reason?: string,
    artifacts?: GalServiceArtifact[],
  ): GalServiceTask
  failTask(
    task: GalServiceTask,
    actor: GalServiceActorIdentity,
    error: GalServiceTaskError,
    reason?: string,
  ): GalServiceTask
  requiredScopesForTask(taskType: string): string[]
  assertAuthorized(taskType: string, authorization: GalServiceDelegatedAuthorization): void
  selectRuntime(task: GalServiceTask): GalServiceRuntimeKind
  mcpTools(): GalServiceMcpToolDescriptor[]
  a2aAdapter(): GalServiceA2aAdapterDescriptor
  health(status: GalServiceHealthResponse['status'], requestId?: string): GalServiceHealthResponse
  status(options: GalServiceStatusOptions): GalServiceStatusResponse
}

class SequentialGalServiceIdGenerator implements GalServiceIdGenerator {
  private nextValue = 1

  taskId(): string {
    return `task_${this.nextValue++}`
  }

  correlationId(): string {
    return `corr_${this.nextValue++}`
  }
}

export function createGalServiceSdk(options: GalServiceSdkOptions): GalServiceSdk {
  validateGalServiceAgentCard(options.agentCard)

  const now = options.now ?? (() => new Date().toISOString())
  const ids = options.ids ?? new SequentialGalServiceIdGenerator()
  const runtime = options.runtime ?? {}
  const serviceActor = serviceActorFromCard(options.agentCard)

  return {
    agentCard: options.agentCard,
    runtime,

    createTask(request) {
      if (request.calleeAgentId !== options.agentCard.agentId) {
        throw new Error(
          `Task callee ${request.calleeAgentId} does not match Agent Card agent ${options.agentCard.agentId}`,
        )
      }

      this.assertAuthorized(request.input.taskType, request.authorization)

      const timestamp = now()
      const correlationId = request.correlationId ?? ids.correlationId()
      const callee = serviceActor
      const audit = buildAuditContext({
        correlationId,
        requestedBy: request.audit?.requestedBy ?? request.caller,
        callerService: request.audit?.callerService ?? request.caller,
        calleeAgent: request.audit?.calleeAgent ?? callee,
        source: request.audit?.source,
        evidenceUrls: request.audit?.evidenceUrls,
      })

      return {
        schemaVersion: GAL_SERVICE_TASK_SCHEMA_VERSION,
        id: ids.taskId(),
        correlationId,
        parentTaskId: request.parentTaskId,
        agentId: options.agentCard.agentId,
        state: 'submitted',
        caller: request.caller,
        callee,
        authorization: request.authorization,
        audit,
        input: request.input,
        artifacts: [],
        history: [
          {
            state: 'submitted',
            at: timestamp,
            actor: request.caller,
            reason: 'task_created',
          },
        ],
        createdAt: timestamp,
        updatedAt: timestamp,
      }
    },

    transitionTask(task, transition) {
      if (isGalServiceTerminalTaskState(task.state)) {
        throw new Error(`Cannot transition terminal task ${task.id} from ${task.state}`)
      }

      const timestamp = now()
      const historyEntry: GalServiceTaskTransition = {
        state: transition.state,
        at: timestamp,
        actor: transition.actor,
        reason: transition.reason,
        message: transition.message,
        metadata: transition.metadata,
      }

      return {
        ...task,
        state: transition.state,
        output: transition.output ?? task.output,
        error: transition.error ?? task.error,
        artifacts: [...task.artifacts, ...(transition.artifacts ?? [])],
        history: [...task.history, historyEntry],
        updatedAt: timestamp,
      }
    },

    completeTask(task, actor, output, reason = 'task_completed', artifacts = []) {
      return this.transitionTask(task, {
        state: 'completed',
        actor,
        reason,
        output,
        artifacts,
      })
    },

    failTask(task, actor, error, reason = 'task_failed') {
      return this.transitionTask(task, {
        state: 'failed',
        actor,
        reason,
        error,
      })
    },

    requiredScopesForTask(taskType) {
      const scopes = options.agentCard.capabilities
        .filter((capability) => capability.taskTypes.includes(taskType))
        .flatMap((capability) => capability.requiredScopes ?? [])

      return Array.from(new Set(scopes))
    },

    assertAuthorized(taskType, authorization) {
      const requiredScopes = this.requiredScopesForTask(taskType)
      const missingScopes = requiredScopes.filter((scope) => !authorization.scopes.includes(scope))

      if (missingScopes.length > 0) {
        throw new Error(`Missing service task scopes: ${missingScopes.join(', ')}`)
      }
    },

    selectRuntime(task) {
      if (options.agentCard.runtime.backgroundSessionRequired) {
        return selectSupportedRuntime(options.agentCard, [
          'gal_code_background_session',
          'kata_background_session',
          'queue_worker',
        ])
      }

      if (task.input.timeoutMs && task.input.timeoutMs > 30_000) {
        return selectSupportedRuntime(options.agentCard, [
          'queue_worker',
          'gal_code_background_session',
          'kata_background_session',
          'direct_api',
        ])
      }

      return selectSupportedRuntime(options.agentCard, ['direct_api', options.agentCard.runtime.defaultRuntime])
    },

    mcpTools() {
      return options.agentCard.capabilities.flatMap((capability) =>
        capability.taskTypes.map((taskType) => {
          const schemaRef = capability.schemaRefs?.[0]
          const taskSchema = schemaRef
            ? options.agentCard.taskSchemas.find((schema) => schema.id === schemaRef)
            : options.agentCard.taskSchemas.find((schema) => schema.taskType === taskType)

          return {
            name: `${options.agentCard.agentId}.${taskType}`,
            description: capability.description,
            taskType,
            requiredScopes: capability.requiredScopes ?? [],
            inputSchema: taskSchema?.inputSchema,
          }
        }),
      )
    },

    a2aAdapter() {
      return {
        agentId: options.agentCard.agentId,
        agentCard: options.agentCard,
        taskTypes: options.agentCard.capabilities.flatMap((capability) => capability.taskTypes),
      }
    },

    health(status, requestId) {
      return {
        schemaVersion: GAL_SERVICE_HEALTH_SCHEMA_VERSION,
        agentId: options.agentCard.agentId,
        status,
        checkedAt: now(),
        requestId,
      }
    },

    status(statusOptions) {
      return {
        schemaVersion: GAL_SERVICE_STATUS_SCHEMA_VERSION,
        agentId: options.agentCard.agentId,
        displayName: options.agentCard.displayName,
        status: statusOptions.status,
        statusPageUrl: statusOptions.statusPageUrl,
        generatedAt: now(),
        requestId: statusOptions.requestId,
        correlationId: statusOptions.correlationId,
        dependencies: statusOptions.dependencies ?? [],
        syntheticProbes: statusOptions.syntheticProbes,
        message: statusOptions.message,
      }
    },
  }
}

export function validateGalServiceAgentCard(card: GalServiceAgentCard): void {
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
}

export function isGalServiceTerminalTask(task: GalServiceTask): task is GalServiceTask & {
  state: GalServiceTerminalTaskState
} {
  return isGalServiceTerminalTaskState(task.state)
}

function buildAuditContext(audit: GalServiceAuditContext): GalServiceAuditContext {
  return {
    correlationId: audit.correlationId,
    requestedBy: audit.requestedBy,
    callerService: audit.callerService,
    calleeAgent: audit.calleeAgent,
    source: audit.source,
    evidenceUrls: audit.evidenceUrls,
  }
}

function serviceActorFromCard(card: GalServiceAgentCard): GalServiceActorIdentity {
  return {
    type: 'agent',
    id: card.agentId,
    displayName: card.displayName,
    agentId: card.agentId,
  }
}

function selectSupportedRuntime(
  card: GalServiceAgentCard,
  preferenceOrder: GalServiceRuntimeKind[],
): GalServiceRuntimeKind {
  for (const runtime of preferenceOrder) {
    if (card.runtime.supportedRuntimes.includes(runtime)) {
      return runtime
    }
  }

  return card.runtime.defaultRuntime
}
