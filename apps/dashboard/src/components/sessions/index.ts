/**
 * Sessions Components (GAL-571)
 *
 * Barrel export for background agent session components.
 * Migrated from apps/dashboard to Next.js App Router.
 */

export { SessionList } from './SessionList'
export { NewSessionModal } from './NewSessionModal'
export { TerminalSession } from './TerminalSession'
export { TerminalErrorBoundary } from './TerminalErrorBoundary'
export { SessionListSkeleton, TerminalSkeleton, SessionLoadingSpinner } from './SessionSkeleton'
export { FirebaseChatSession } from './FirebaseChatSession'
export { FirebaseTerminalSession } from './FirebaseTerminalSession'
export { StructuredLogsView } from './StructuredLogsView'
export { SessionView } from './SessionView'
export { GalCodePanel, buildCreateSessionPayload } from './GalCodePanel'
export type { GalCodePanelProps } from './GalCodePanel'
export { AgentSelector } from './AgentSelector'
export { CommandSelectionModal } from './CommandSelectionModal'
export { ProviderCapacityBar, countActiveSessionsForProvider } from './ProviderCapacityBar'
export { AuthenticationStatus } from './AuthenticationStatus'
export { AgentSessionHeader } from './AgentSessionHeader'
export { SessionActivityTimeline } from './SessionActivityTimeline'
export { SupervisorWorkerPanel } from './SupervisorWorkerPanel'
export { ReviewPrompt } from './ReviewPrompt'
export { SwarmSessionsPage } from './SwarmSessionsPage'
export type { ProviderCapacity, CapacitySnapshot } from './ProviderCapacityBar'
export type { SupervisorMetricsResponse } from './SupervisorWorkerPanel'
