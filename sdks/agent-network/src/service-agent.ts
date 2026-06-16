/**
 * Agent Network compatibility exports.
 *
 * `./gal-agent-contracts.js` holds the canonical definition contracts for
 * GAL-compatible agents. This package owns network behavior between agents and
 * re-exports the agent definition contracts under the historical service-agent
 * names for the v0.x migration window.
 */

export {
  GAL_AGENT_CARD_SCHEMA_VERSION as GAL_SERVICE_AGENT_CARD_SCHEMA_VERSION,
  GAL_AGENT_COMPONENT_STATES as GAL_SERVICE_COMPONENT_STATES,
  GAL_AGENT_HEALTH_SCHEMA_VERSION as GAL_SERVICE_HEALTH_SCHEMA_VERSION,
  GAL_AGENT_HEALTH_STATES as GAL_SERVICE_HEALTH_STATES,
  GAL_AGENT_STATUS_SCHEMA_VERSION as GAL_SERVICE_STATUS_SCHEMA_VERSION,
  GAL_AGENT_TASK_SCHEMA_VERSION as GAL_SERVICE_TASK_SCHEMA_VERSION,
  GAL_AGENT_TASK_STATES as GAL_SERVICE_TASK_STATES,
  GAL_AGENT_TERMINAL_TASK_STATES as GAL_SERVICE_TERMINAL_TASK_STATES,
  isGalAgentComponentState as isGalServiceComponentState,
  isGalAgentHealthState as isGalServiceHealthState,
  isGalAgentTaskState as isGalServiceTaskState,
  isGalAgentTerminalTaskState as isGalServiceTerminalTaskState,
} from './gal-agent-contracts.js'

export type {
  GalAgentActorIdentity as GalServiceActorIdentity,
  GalAgentActorType as GalServiceActorType,
  GalAgentArtifact as GalServiceArtifact,
  GalAgentAuditContext as GalServiceAuditContext,
  GalAgentAuditProfile as GalServiceAuditProfile,
  GalAgentAuthMethod as GalServiceAuthMethod,
  GalAgentAuthProfile as GalServiceAuthProfile,
  GalAgentCapability as GalServiceCapability,
  GalAgentCard as GalServiceAgentCard,
  GalAgentComponentState as GalServiceComponentState,
  GalAgentDelegatedAuthorization as GalServiceDelegatedAuthorization,
  GalAgentDependencyKind as GalServiceDependencyKind,
  GalAgentDependencyStatus as GalServiceDependencyStatus,
  GalAgentEndpoint as GalServiceEndpoint,
  GalAgentEnvironment as GalServiceEnvironment,
  GalAgentHealthResponse as GalServiceHealthResponse,
  GalAgentHealthState as GalServiceHealthState,
  GalAgentRuntimeKind as GalServiceRuntimeKind,
  GalAgentRuntimeProfile as GalServiceRuntimeProfile,
  GalAgentSloProfile as GalServiceSloProfile,
  GalAgentStatusResponse as GalServiceStatusResponse,
  GalAgentSyntheticProbe as GalServiceSyntheticProbe,
  GalAgentTask as GalServiceTask,
  GalAgentTaskCreateRequest as GalServiceTaskCreateRequest,
  GalAgentTaskError as GalServiceTaskError,
  GalAgentTaskInput as GalServiceTaskInput,
  GalAgentTaskOutput as GalServiceTaskOutput,
  GalAgentTaskPriority as GalServiceTaskPriority,
  GalAgentTaskSchemaRef as GalServiceTaskSchemaRef,
  GalAgentTaskState as GalServiceTaskState,
  GalAgentTaskStatusResponse as GalServiceTaskStatusResponse,
  GalAgentTaskTransition as GalServiceTaskTransition,
  GalAgentTerminalTaskState as GalServiceTerminalTaskState,
  GalAgentTransport as GalServiceTransport,
  GalJsonSchema,
} from './gal-agent-contracts.js'
