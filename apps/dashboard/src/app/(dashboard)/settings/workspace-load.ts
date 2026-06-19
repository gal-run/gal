import type { Organization } from '@/lib/api'

export type WorkspaceLoadSource = 'initial-load' | 'sync-refresh'

export interface ResolvedOrganizationsResponse {
  organizations: Organization[]
  errorMessage: string | null
}

export function resolveOrganizationsResponse(
  orgsRaw: Organization[] | undefined,
  fallback: Organization[],
  source: WorkspaceLoadSource,
): ResolvedOrganizationsResponse {
  if (orgsRaw !== undefined) {
    return {
      organizations: orgsRaw,
      errorMessage: null,
    }
  }

  return {
    organizations: fallback,
    errorMessage:
      source === 'sync-refresh'
        ? 'Workspace sync completed, but GAL could not refresh the workspace list. Retry sync or reload the page.'
        : 'GAL could not load your workspace list. Reload the page or retry sync.',
  }
}
