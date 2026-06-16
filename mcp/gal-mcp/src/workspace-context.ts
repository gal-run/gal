import { z } from "zod";

const ACTIVE_WORKSPACE_DESCRIPTION =
  'Workspace name (GitHub organization or personal account). If omitted, the active workspace set by gal_set_active_workspace is used.';

let activeWorkspace: string | null = null;

export function createWorkspaceParamSchema() {
  return z.string().optional().describe(ACTIVE_WORKSPACE_DESCRIPTION);
}

export function getActiveWorkspace(): string | null {
  return activeWorkspace;
}

export function setActiveWorkspace(workspaceName: string | null): void {
  activeWorkspace = workspaceName?.trim() ? workspaceName.trim() : null;
}

export function resetWorkspaceContext(): void {
  activeWorkspace = null;
}

export function resolveWorkspace(orgName?: string): string {
  const explicitWorkspace = orgName?.trim();
  if (explicitWorkspace) {
    return explicitWorkspace;
  }

  if (activeWorkspace) {
    return activeWorkspace;
  }

  throw new Error(
    'No workspace specified. Either pass "orgName" explicitly or call gal_set_active_workspace first.',
  );
}
