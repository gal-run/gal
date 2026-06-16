import type {
  Session,
  SessionStatus,
  SessionListResponse,
} from '@gal/types'

/**
 * Session Repository Interface (GAL-571)
 *
 * Repository for managing background agent sessions.
 * Implementations: FirestoreSessionRepository (API), InMemorySessionRepository (dev)
 */
export interface ISessionRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Find session by ID
   */
  findById(sessionId: string): Promise<Session | null>

  /**
   * Find session by workflow run ID (for runner callbacks)
   */
  findByWorkflowRunId(workflowRunId: number): Promise<Session | null>

  /**
   * List sessions for a user with pagination
   */
  listUserSessions(
    organizationId: string,
    userId: string,
    options?: {
      status?: SessionStatus
      limit?: number
      cursor?: string
    }
  ): Promise<SessionListResponse>

  /**
   * List all sessions in an organization (admin only)
   */
  listOrgSessions(
    organizationId: string,
    options?: {
      status?: SessionStatus
      userId?: string
      limit?: number
      cursor?: string
      includeTotalCount?: boolean
    }
  ): Promise<SessionListResponse>

  /**
   * Find stale active sessions (no heartbeat within timeout) (#643)
   */
  findStaleActiveSessions(timeoutMs: number): Promise<Session[]>

  /**
   * Find stale sessions for cleanup (terminated more than N hours ago)
   */
  findStaleSessions(hoursOld: number): Promise<Session[]>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a new session
   */
  create(session: Session): Promise<void>

  /**
   * Update session status with optimistic locking (#641)
   * @param expectedVersion - If provided, will only update if current version matches
   * @throws OptimisticLockError if version mismatch
   */
  updateStatus(
    sessionId: string,
    status: SessionStatus,
    additionalFields?: Partial<Session>,
    expectedVersion?: number
  ): Promise<Session | null>

  /**
   * Update session fields
   */
  update(sessionId: string, updates: Partial<Session>): Promise<void>

  /**
   * Delete session (for cleanup jobs)
   */
  delete(sessionId: string): Promise<void>

  // ─────────────────────────────────────────────────────────────────
  // Specialized Updates
  // ─────────────────────────────────────────────────────────────────

  /**
   * Set workflow run ID after GitHub Actions workflow is triggered
   */
  setWorkflowRunId(sessionId: string, workflowRunId: number): Promise<void>

  /**
   * Set runner ID when session starts on a specific runner
   */
  setRunnerId(sessionId: string, runnerId: string): Promise<void>

  /**
   * Update last activity timestamp
   */
  touchSession(sessionId: string): Promise<void>

  /**
   * Send heartbeat to indicate session is still alive (#643)
   */
  heartbeat(sessionId: string): Promise<void>

  // ─────────────────────────────────────────────────────────────────
  // Cleanup Operations
  // ─────────────────────────────────────────────────────────────────

  /**
   * Cleanup stale pending sessions that have been waiting too long (#638)
   */
  cleanupStalePendingSessions(
    organizationId: string,
    timeoutMs: number
  ): Promise<{ cleaned: number }>

  /**
   * Comprehensive cleanup of ALL stale sessions across ALL organizations (#1173, #1866)
   *
   * Also fast-fails non-GHA sessions (negative workflowRunId) that have no
   * heartbeat and exceed invalidRunTimeoutMs (default: 5 min).
   */
  cleanupAllStaleSessions(options?: {
    pendingTimeoutMs?: number
    heartbeatTimeoutMs?: number
    /** Timeout for non-GHA (Hive/WarmPool) pending sessions with no heartbeat (#1866) */
    invalidRunTimeoutMs?: number
  }): Promise<{
    pendingCleaned: number
    activeCleaned: number
    totalCleaned: number
    errors: string[]
  }>
}

/**
 * Error thrown when optimistic locking fails (#641)
 */
export class OptimisticLockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OptimisticLockError'
  }
}
