/**
 * Discovery → Approved Config staging handoff via sessionStorage.
 *
 * After BulkApproveDialog completes conflict/security review, Discovery stores
 * the resolved selections here and navigates to /approved-config?stageApproval=<key>.
 * Approved Config reads the payload, stages items into the local bundle, then
 * clears the entry so refresh/back navigation lands in a clean state.
 *
 * NOTE: The current Approved Config page is Claude-only (selectedPlatform = 'claude').
 * The payload carries a `platform` field for forward-compatibility, but only
 * 'claude' platform selections will be staged until multi-platform support is added.
 * Non-claude selections in the payload are silently skipped with a count reported
 * in the staging toast.
 */

const STORAGE_PREFIX = 'gal-stage-approval:'

export const STAGEABLE_CONFIG_TYPES = ['command', 'subagent', 'hook', 'instructions', 'settings'] as const
export type StageableConfigType = (typeof STAGEABLE_CONFIG_TYPES)[number]
const STAGEABLE_CONFIG_TYPE_SET = new Set<string>(STAGEABLE_CONFIG_TYPES)

export interface StageSelection {
  /**
   * Agent platform (e.g. 'claude', 'cursor').
   * Approved Config currently only stages 'claude' items; others are skipped.
   */
  platform: string
  type: string
  name: string
  repo: string
  path: string
}

export function isStageableSelection(selection: StageSelection): selection is StageSelection & { type: StageableConfigType } {
  return STAGEABLE_CONFIG_TYPE_SET.has(selection.type)
}

export interface ApprovedConfigStagePayload {
  orgName: string
  source: 'discovery-bulk-approve'
  createdAt: string
  selections: StageSelection[]
}

/**
 * Persist a staging payload in sessionStorage and return the lookup key.
 * The key is passed as the `stageApproval` query param when navigating to Approved Config.
 */
export function saveApprovalHandoff(payload: ApprovedConfigStagePayload): string {
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  try {
    sessionStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(payload))
  } catch {
    // sessionStorage may be unavailable (private-mode restrictions, etc.)
    // Caller should treat missing payload gracefully.
  }
  return key
}

/**
 * Load a staging payload by key.
 * Returns null if the key is missing, expired, or sessionStorage is unavailable.
 */
export function loadApprovalHandoff(key: string): ApprovedConfigStagePayload | null {
  try {
    const raw = sessionStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (!raw) return null
    return JSON.parse(raw) as ApprovedConfigStagePayload
  } catch {
    return null
  }
}

/** Remove a staging payload entry after it has been consumed. */
export function clearApprovalHandoff(key: string): void {
  try {
    sessionStorage.removeItem(`${STORAGE_PREFIX}${key}`)
  } catch {
    // ignore
  }
}
