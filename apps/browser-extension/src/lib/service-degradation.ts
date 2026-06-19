export interface ServiceDegradation {
  type: "rate_limited" | "server_error" | "service_unavailable";
  message: string;
  retryAfter?: number;
  requestId?: string;
  statusPageUrl: string;
  detectedAt: number;
}

const STATUS_PAGE_URL = "https://status.scheduler-systems.com";
const DEGRADATION_COOLDOWN_MS = 60_000;
const MAX_STORED_DEGRADATIONS = 5;

export function classifyHttpStatus(
  status: number,
  headers: Headers,
): ServiceDegradation | null {
  const now = Date.now();

  if (status === 429) {
    const retryAfter = headers.get("Retry-After");
    const requestId = headers.get("X-Request-Id") || undefined;
    return {
      type: "rate_limited",
      message: "Rate limited. Please wait before retrying.",
      retryAfter: retryAfter ? parseInt(retryAfter, 10) : undefined,
      requestId,
      statusPageUrl: STATUS_PAGE_URL,
      detectedAt: now,
    };
  }

  if (status >= 500 && status < 600) {
    const requestId = headers.get("X-Request-Id") || undefined;
    return {
      type: status === 503 ? "service_unavailable" : "server_error",
      message:
        status === 503
          ? "GAL service temporarily unavailable."
          : "GAL service error. Our team has been notified.",
      requestId,
      statusPageUrl: STATUS_PAGE_URL,
      detectedAt: now,
    };
  }

  return null;
}

export function formatDegradationMessage(degradation: ServiceDegradation): string {
  const parts = [degradation.message];

  if (degradation.retryAfter) {
    const mins = Math.ceil(degradation.retryAfter / 60);
    parts.push(`Retry in ${mins} min${mins !== 1 ? "s" : ""}.`);
  }

  return parts.join(" ");
}

export async function storeDegradation(degradation: ServiceDegradation): Promise<void> {
  try {
    const result = await chrome.storage.local.get("serviceDegradations");
    let degradations: ServiceDegradation[] = [];

    if (result.serviceDegradations) {
      try {
        degradations = JSON.parse(result.serviceDegradations as string) as ServiceDegradation[];
      } catch {
        degradations = [];
      }
    }

    degradations = degradations.filter(
      (d) => Date.now() - d.detectedAt < DEGRADATION_COOLDOWN_MS * 10,
    );

    const existing = degradations.findIndex(
      (d) => d.type === degradation.type && d.requestId === degradation.requestId,
    );

    if (existing >= 0) {
      degradations[existing] = degradation;
    } else {
      degradations.unshift(degradation);
    }

    degradations = degradations.slice(0, MAX_STORED_DEGRADATIONS);

    await chrome.storage.local.set({
      serviceDegradations: JSON.stringify(degradations),
    });
  } catch {
    // Storage errors are non-critical
  }
}

export async function getActiveDegradations(): Promise<ServiceDegradation[]> {
  try {
    const result = await chrome.storage.local.get("serviceDegradations");
    if (!result.serviceDegradations) return [];

    const degradations = JSON.parse(result.serviceDegradations as string) as ServiceDegradation[];
    const now = Date.now();

    return degradations.filter(
      (d) => now - d.detectedAt < DEGRADATION_COOLDOWN_MS,
    );
  } catch {
    return [];
  }
}

export async function clearDegradations(): Promise<void> {
  try {
    await chrome.storage.local.remove("serviceDegradations");
  } catch {
    // Storage errors are non-critical
  }
}
