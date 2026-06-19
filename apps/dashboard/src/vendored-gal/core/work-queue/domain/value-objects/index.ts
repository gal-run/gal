/**
 * SAL Domain Value Objects
 *
 * Immutable objects that represent domain concepts with behavior and validation.
 */

export { Priority, PriorityLevel } from './Priority';
export { WorkItemStatus, StatusValue } from './WorkItemStatus';
export { SdlcPhase, PhaseNumber } from './SdlcPhase';
export { SdlcLifecycleState, SdlcLifecycleStateValue } from './SdlcLifecycleState';
export { BlockerReason, BlockerReasonType, BlockerReasonData } from './BlockerReason';
export {
  SdlcTelemetry,
  SdlcStageTransition,
  SdlcStageMetrics,
  SdlcProgressSnapshot,
} from './SdlcTelemetry';
export { WorkItemSource, SourceType, SourceData } from './WorkItemSource';
export { WorkItemType, TypeValue } from './WorkItemType';
