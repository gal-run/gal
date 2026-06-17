import type { ActiveDesignProjectSummary } from "@gal/types";

export function parseActiveDesignProject(
  raw: string | undefined | null,
): ActiveDesignProjectSummary | null {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as ActiveDesignProjectSummary | null;
  } catch {
    return null;
  }
}

export function getActiveDesignProjectProgress(
  project: ActiveDesignProjectSummary,
): number {
  if (project.totalScenes <= 0) {
    return 0;
  }

  return Math.round((project.completedScenes / project.totalScenes) * 100);
}
