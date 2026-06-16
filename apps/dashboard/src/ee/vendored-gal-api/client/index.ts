/**
 * HTTP Client SDK for GAL API
 *
 * Barrel export file for all HTTP client components.
 * Used by CLI, VS Code extension, and Dashboard to access API functionality.
 */

// Legacy/Simple client (used by Dashboard)
export { createHttpFetch } from './http-client'

// Modern Class-based client (used by CLI/VSCode)
export { HttpClient, type HttpClientConfig, type ITokenProvider } from './HttpClient'

// Repositories
export {
  HttpConfigRepository,
  type ApprovedConfigEnforcementRuleSetResponse,
} from './repositories/HttpConfigRepository'
export { HttpFleetRepository } from './repositories/HttpFleetRepository'
export { HttpInviteRepository } from './repositories/HttpInviteRepository'
export { HttpProposalRepository } from './repositories/HttpProposalRepository'
export { HttpAuthRepository } from './repositories/HttpAuthRepository'
export { HttpTelemetryRepository } from './repositories/HttpTelemetryRepository'
export { HttpOrganizationRepository } from './repositories/HttpOrganizationRepository'
export { HttpUserRepository } from './repositories/HttpUserRepository'
export { HttpScanResultRepository } from './repositories/HttpScanResultRepository'
export { HttpSubscriptionRepository } from './repositories/HttpSubscriptionRepository'
export { HttpWorkItemRepository, type WorkItem, type GitHubIssue, type CreateWorkItemRequest, type AddToQueueRequest, type AddToQueueResponse, type QueueStats, type QueueControlResponse } from './repositories/HttpWorkItemRepository'
export { HttpWorkflowTestRepository, type WorkflowTestRequest } from './repositories/HttpWorkflowTestRepository'
export { HttpAdminRepository, type GrantPlanResponse, type OrgSummary } from './repositories/HttpAdminRepository'
export { HttpRunnerRepository, type RunnerCredentials } from './repositories/HttpRunnerRepository'
export { HttpSessionRepository, type ListSessionsParams, type ResumeSessionResponse, type DirectiveType, type SendDirectiveRequest, type SendDirectiveResponse } from './repositories/HttpSessionRepository'
