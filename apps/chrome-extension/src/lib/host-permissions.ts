/**
 * Build a Chrome origin-pattern string from a URL.
 * Example: https://claude.ai/chat -> https://claude.ai/*
 */
export function originPatternFromUrl(url: string): string | null {
 try {
 const parsed = new URL(url);
 if (!parsed.protocol || !parsed.hostname) return null;
 return `${parsed.protocol}//${parsed.hostname}/*`;
 } catch {
 return null;
 }
}

function readHostOriginList(manifest: unknown,
 key: "host_permissions" | "optional_host_permissions",): string[] {
 if (!manifest || typeof manifest !== "object") return [];
 const value = (manifest as Record<string, unknown>)[key];
 if (!Array.isArray(value)) return [];
 return value.filter((entry): entry is string => typeof entry === "string");
}

export function getRequiredHostOrigins(manifest: unknown): string[] {
 return readHostOriginList(manifest, "host_permissions");
}

export function getOptionalHostOrigins(manifest: unknown): string[] {
 return readHostOriginList(manifest, "optional_host_permissions");
}

export function isOptionalHostOrigin(manifest: unknown,
 originPattern: string,): boolean {
 return getOptionalHostOrigins(manifest).includes(originPattern);
}

export function isRequestableHostOrigin(manifest: unknown,
 originPattern: string,): boolean {
 const required = getRequiredHostOrigins(manifest);
 const optional = getOptionalHostOrigins(manifest);
 return required.includes(originPattern) || optional.includes(originPattern);
}
