/**
 * GAL API client for Chrome Extension
 * Integrates with existing GAL API (same auth, same data)
 */

import { captureExceptionWithTags } from "./sentry";
import { getSessionData, clearUserSession } from "./storage";
import {
 meetsAudience,
 resolveOrgTier,
 normalizeOrgName,
 normalizeOrgList,
} from "@gal/core";
import type { AudienceTier } from "@gal/core";
// parseAdminOrgs/isAdminOrg removed

// API base URL - defaults to production
const API_BASE_URL = import.meta.env.VITE_API_URL || "https://api.gal.run";

// ---- Typed fetch results for resilient sync layer ----

/**
 * Discriminated union representing the outcome of a fetch operation.
 * Callers can branch on `status` to determine how to handle the result
 * without conflating "no data" with "fetch failed."
 */
export type FetchResult<T> =
 | { status: "success"; data: T }
 | { status: "empty" }
 | { status: "error"; error: string; retryable: boolean };

/**
 * Determine current environment from API URL
 */
export type EnvironmentType = "dev" | "prod";

export function getEnvironment(): EnvironmentType {
 if (API_BASE_URL.includes("localhost")) {
 return "dev";
 }
 return "prod";
}

export function isProduction(): boolean {
 return getEnvironment() === "prod";
}

export function isDevelopment(): boolean {
 return getEnvironment() === "dev";
}

export interface User {
 id: string;
 login: string;
 name?: string;
 email?: string;
 avatarUrl?: string;
 githubId: number;
 isAdmin: boolean;
}

export interface AuthStatus {
 authenticated: boolean;
 user: User | null;
 configured: boolean;
}

export interface Command {
 id: string;
 name: string;
 description?: string;
 content: string;
 platform?: string;
 category?: string;
 tags?: string[];
 sourceRepo?: string;
 sourcePath?: string;
}

export interface Hook {
 id: string;
 name: string;
 content: string;
 event?: string;
 script?: string;
 sourceRepo?: string;
 sourcePath?: string;
}

export interface Subagent {
 id: string;
 name: string;
 description?: string;
 content: string;
 prompt?: string;
 sourceRepo?: string;
 sourcePath?: string;
}

export interface Organization {
 name: string;
 displayName?: string;
 avatarUrl?: string;
 isAdmin?: boolean;
 accountType?: "User" | "Organization";
 lastScanAt?: { _seconds: number };
}

// INTERNAL_ORG_NAMES removed — feature visibility uses page-level internalOrgs

export interface ApprovedConfig {
 platform: string;
 approved?: boolean;
 approvedAt?: string;
 approvedBy?: string;
 instructions?: {
 content: string;
 sourceRepo?: string;
 sourcePath?: string;
 } | null;
 settings?: {
 content: string;
 version?: number;
 sourceRepo?: string;
 sourcePath?: string;
 } | null;
 commands?: Command[];
 hooks?: Hook[];
 subagents?: Subagent[];
 rules?: Array<{ name: string; content: string }>;
 hash?: string;
 version?: string;
 updatedAt?: string;
 updatedBy?: string;
 policyName?: string;
}

export interface ConfigProposal {
 id: string;
 scope: "org" | "project";
 scopeId?: string;
 status: "pending" | "approved" | "rejected" | "withdrawn";
 proposedBy: string;
 proposedAt: string;
 basedOnVersion?: number;
 platform?: string;
 rationale?: string;
}

export interface ScanProgress {
 status: "idle" | "scanning" | "complete" | "error";
 totalRepos: number;
 scannedRepos: number;
 percentage: number;
 currentRepo: string;
 elapsedSeconds: number;
}

export interface FeatureFlagResponse {
 environment: {
 environment: "dev" | "prod";
 isProduction: boolean;
 };
 pages: Record<
 string,
 {
 enabled: boolean;
 effectivelyEnabled: boolean;
 audience?: "public" | "internal" | "partners";
 internalOrgs?: string[];
 environments?: Array<"dev" | "prod">;
 }
 >;
 adminOrgs?: string[];
}

export interface SyncStatus {
 synced: boolean;
 lastSyncAt: string | null;
 configVersion?: string;
 driftDetected: boolean;
 driftFiles: Array<{
 path: string;
 type: "modified" | "missing" | "extra";
 platform: string;
 }>;
}

export interface SyncCopilotHintResponse {
 orgName: string;
 platformFilter?: string;
 generatedAt: string;
 requestHash: string;
 source: "model" | "deterministic";
 rolloutMode: "disabled" | "shadow" | "enforce";
 hint: {
 expectedConflicts: string[];
 riskyOverrides: string[];
 recommendedSequence: string[];
 rationale: string;
 confidence?: number;
 };
 fallbackReason?: string;
}

export interface GenerateApprovedConfigProposalResult {
 proposal?: {
 id: string;
 platform: string;
 rationale: string;
 };
 generation?: {
 source: "manual" | "model" | "deterministic";
 fallbackReason?: string;
 modelAttempted?: boolean;
 modelValid?: boolean;
 latencyMs?: number;
 };
}

export interface DiscoveryInsightResponse {
 insightSource: "shadow-model" | "deterministic-fallback";
 durationMs: number;
 configWithInsight?: unknown;
}

export interface DiscoveredConfigItem {
 type: string;
 name: string;
 platform?: string;
 repo: string;
 path: string;
 content: string;
 lastModified: string;
 hash: string;
}

export interface DiscoveredConfigGroup {
 name: string;
 type: string;
 platform?: string;
 instances: {
 repo: string;
 path: string;
 content: string;
 lastModified: string;
 hash: string;
 }[];
 approvedStatus: "none" | "org" | "project";
}

export interface DiscoveredConfigsResponse {
 organization: string;
 configs?: DiscoveredConfigItem[];
 groups?: DiscoveredConfigGroup[];
 totalConfigs: number;
 totalGroups?: number;
 isStale?: boolean;
 cachedAt?: string;
}

export interface ScanResult {
 success: boolean;
 message?: string;
 error?: string;
 totalConfigs: number;
}

function reportAuthError(error: unknown, requestId?: string): void {
 const normalizedError =
 error instanceof Error ? error : new Error(String(error));

 captureExceptionWithTags(normalizedError, {
 extension_id: chrome.runtime.id,
 error_message: normalizedError.message,
 request_id: requestId,
 });
}

/**
 * Record terms acceptance server-side (writes termsAcceptedAt to Firestore)
 */
export async function acceptTerms(termsVersion = "1.0"): Promise<void> {
 try {
 await apiRequest<{ termsAcceptedAt: string; termsVersion: string }>("/user/accept-terms",
 { method: "POST", body: JSON.stringify({ termsVersion }) },);
 } catch (error) {
 console.error("Failed to record terms acceptance:", error);
 }
}

/**
 * Get auth headers for API requests
 */
async function getAuthHeaders(): Promise<HeadersInit> {
 const token = await getSessionData("authToken");
 const headers: HeadersInit = {
 "Content-Type": "application/json",
 };

 if (token) {
 headers["Authorization"] = `Bearer ${token}`;
 }

 return headers;
}

/**
 * Make API request with automatic 429 retry and exponential backoff.
 * Reads the Retry-After header when present; otherwise uses exponential
 * backoff with jitter (max 3 attempts).
 */
async function apiRequest<T>(path: string,
 options: RequestInit = {},): Promise<T> {
 const url = `${API_BASE_URL}${path}`;
 const headers = await getAuthHeaders();

 const MAX_RETRIES = 3;

 for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
 const response = await fetch(url, {
...options,
 headers: {
...headers,
...options.headers,
 },
 credentials: "include", // Include cookies for session
 });

 if (response.status === 429 && attempt < MAX_RETRIES - 1) {
 // Read Retry-After header (seconds) or fall back to exponential backoff
 const retryAfterHeader = response.headers.get("Retry-After");
 let delayMs: number;
 if (retryAfterHeader) {
 const retryAfterSec = parseInt(retryAfterHeader, 10);
 delayMs = (Number.isFinite(retryAfterSec) ? retryAfterSec : 2) * 1000;
 } else {
 // Exponential backoff: 1s, 2s, 4s + jitter
 delayMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
 }
 await new Promise((resolve) => setTimeout(resolve, delayMs));
 continue;
 }

 if (!response.ok) {
 const error = await response.text();
 throw new Error(error || `API request failed: ${response.status}`);
 }

 return response.json();
 }

 // Should not reach here, but satisfy TypeScript
 throw new Error(`API request failed after ${MAX_RETRIES} retries: ${url}`);
}

/**
 * Make API request returning a typed FetchResult instead of throwing.
 * Used by the resilient sync layer to distinguish network errors,
 * auth failures, and server errors without losing cached data.
 */
async function apiRequestResult<T>(path: string,
 options: RequestInit = {},): Promise<FetchResult<T>> {
 const url = `${API_BASE_URL}${path}`;
 let headers: HeadersInit;
 try {
 headers = await getAuthHeaders();
 } catch {
 return { status: "error", error: "auth_unavailable", retryable: false };
 }

 try {
 const response = await fetch(url, {
...options,
 headers: {
...headers,
...options.headers,
 },
 credentials: "include",
 });

 if (!response.ok) {
 const status = response.status;
 if (status === 401 || status === 403) {
 return { status: "error", error: "auth_expired", retryable: false };
 }
 if (status >= 500) {
 return { status: "error", error: `http_${status}`, retryable: true };
 }
 // 4xx (other than 401/403) — not retryable
 return { status: "error", error: `http_${status}`, retryable: false };
 }

 const data = (await response.json()) as T;
 return { status: "success", data };
 } catch (err) {
 // Network error (offline, DNS, timeout, etc.)
 const message = err instanceof Error ? err.message : "network";
 return { status: "error", error: message, retryable: true };
 }
}

/**
 * Check authentication status.
 *
 * The API response includes `configured` and `user`, but not an explicit
 * `authenticated` flag. Derive that here so popup callers get a stable shape.
 */
export async function checkAuthStatus(): Promise<AuthStatus> {
 try {
 const raw = await apiRequest<{
 configured: boolean;
 githubOAuthConfigured?: boolean;
 user: User | null;
 }>("/auth/status");
 return {
 configured: raw.configured,
 user: raw.user,
 authenticated: raw.user !== null,
 };
 } catch (error) {
 console.error("Auth check failed:", error);
 return { authenticated: false, user: null, configured: false };
 }
}

/**
 * Start GitHub OAuth flow via the service worker.
 *
 * The popup cannot reliably host `chrome.identity.launchWebAuthFlow` because
 * Chrome closes the popup as soon as the user clicks the OAuth window, killing
 * the in-flight callback. Instead we:
 * 1. Send START_GITHUB_AUTH to the service worker (which stays alive).
 * 2. Poll chrome.storage.local for `galAuthComplete` / `galAuthError`.
 * 3. Return the result once the service worker writes it to storage.
 */
export async function startGitHubAuth(): Promise<{
 success: boolean;
 user?: User;
 error?: string;
}> {
 try {
 // Clear any previous auth result before starting
 await chrome.storage.local.remove(["galAuthComplete", "galAuthError"]);

 await chrome.runtime.sendMessage({ type: "START_GITHUB_AUTH" });
 return await waitForAuthResult();
 } catch (error) {
 console.error("GitHub auth failed:", error);
 reportAuthError(error);
 return {
 success: false,
 error: error instanceof Error ? error.message : "Auth failed",
 };
 }
}

/**
 * Wait for the service worker to complete the OAuth flow and write
 * galAuthComplete/galAuthError to chrome.storage.local.
 * Returns a resolved auth result (success or error).
 */
function waitForAuthResult(): Promise<{
 success: boolean;
 user?: User;
 error?: string;
}> {
 return new Promise((resolve, reject) => {
 const onChanged = async (changes: { [key: string]: chrome.storage.StorageChange },
 area: string,) => {
 if (area !== "local") return;

 if ("galAuthError" in changes && changes.galAuthError.newValue) {
 chrome.storage.onChanged.removeListener(onChanged);
 clearTimeout(timeoutId);
 const errorMessage = changes.galAuthError.newValue as string;
 reportAuthError(new Error(errorMessage));
 resolve({
 success: false,
 error: errorMessage,
 });
 return;
 }

 if ("galAuthComplete" in changes &&
 changes.galAuthComplete.newValue === true) {
 chrome.storage.onChanged.removeListener(onChanged);
 clearTimeout(timeoutId);
 const status = await checkAuthStatus();
 resolve({
 success: true,
 user: status.user || undefined,
 });
 }
 };

 const timeoutId = setTimeout(() => {
 chrome.storage.onChanged.removeListener(onChanged);
 reject(new Error("Timed out waiting for GitHub auth to complete"));
 }, 60000);

 chrome.storage.local
.get(["galAuthComplete", "galAuthError"])
.then(async (existingState) => {
 if (existingState.galAuthError) {
 clearTimeout(timeoutId);
 const errorMessage = existingState.galAuthError as string;
 reportAuthError(new Error(errorMessage));
 resolve({
 success: false,
 error: errorMessage,
 });
 return;
 }

 if (existingState.galAuthComplete === true) {
 clearTimeout(timeoutId);
 const status = await checkAuthStatus();
 resolve({
 success: true,
 user: status.user || undefined,
 });
 return;
 }

 chrome.storage.onChanged.addListener(onChanged);
 })
.catch((error) => {
 clearTimeout(timeoutId);
 reject(error);
 });
 });
}

/**
 * Logout
 */
export async function logout(): Promise<void> {
 try {
 await apiRequest("/auth/logout", { method: "POST" });
 } catch (error) {
 console.error("Logout failed:", error);
 } finally {
 await clearUserSession();
 }
}

/**
 * Get user's organizations
 */
export async function getOrganizations(): Promise<Organization[]> {
 try {
 const response = await apiRequest<{ organizations: Organization[] }>("/organizations",);
 return response.organizations || [];
 } catch (error) {
 console.error("Failed to get organizations:", error);
 return [];
 }
}

/**
 * Raw shape returned by GET /organizations/:org/approved-config.
 *
 * This differs from the extension's ApprovedConfig interface:
 * - `approved` is always present (false when no config exists)
 * - Array items (commands, hooks, subagents, rules) have {name, content}
 * but no `id` field -- the extension generates IDs client-side.
 */
interface ApprovedConfigApiResponse {
 approved: boolean;
 hash?: string;
 version?: string;
 platform?: string;
 policyName?: string;
 approvedAt?: string;
 approvedBy?: string;
 message?: string;
 code?: string;
 instructions?: {
 content: string;
 sourceRepo?: string;
 sourcePath?: string;
 } | null;
 settings?: {
 content: string;
 version?: number;
 sourceRepo?: string;
 sourcePath?: string;
 } | null;
 commands?: Array<{
 name: string;
 content: string;
 sourceRepo?: string;
 sourcePath?: string;
 }>;
 hooks?: Array<{
 name: string;
 content: string;
 sourceRepo?: string;
 sourcePath?: string;
 }>;
 subagents?: Array<{
 name: string;
 content: string;
 sourceRepo?: string;
 sourcePath?: string;
 }>;
 rules?: Array<{
 name: string;
 content: string;
 sourceRepo?: string;
 sourcePath?: string;
 }>;
}

/**
 * Get approved config for an organization.
 *
 * The API returns `{ approved: false }` when no config exists. We convert
 * that to `null` so callers (ApprovedConfigView) can distinguish "no config"
 * from "config with empty sections."
 *
 * Array items from the API lack an `id` field, so we synthesise one from the
 * item name to satisfy React key requirements and the Command interface.
 */
export async function getApprovedConfig(orgName: string,
 platform: string = "claude",): Promise<ApprovedConfig | null> {
 try {
 const query = platform ? `?platform=${platform}` : "";
 const response = await apiRequest<ApprovedConfigApiResponse>(`/organizations/${orgName}/approved-config${query}`,);

 if (!response || response.approved === false) {
 return null;
 }

 return {
 platform: response.platform || platform || "",
 approved: response.approved,
 approvedAt: response.approvedAt,
 approvedBy: response.approvedBy,
 hash: response.hash,
 version: response.version,
 policyName: response.policyName,
 updatedAt: response.approvedAt,
 updatedBy: response.approvedBy,
 instructions: response.instructions || null,
 settings: response.settings || null,
 commands: (response.commands || []).map((item, idx) => ({
 id: `cmd-${idx}-${item.name}`,
 name: item.name,
 content: item.content,
 sourceRepo: item.sourceRepo,
 sourcePath: item.sourcePath,
 })),
 hooks: (response.hooks || []).map((item, idx) => ({
 id: `hook-${idx}-${item.name}`,
 name: item.name,
 content: item.content,
 sourceRepo: item.sourceRepo,
 sourcePath: item.sourcePath,
 })),
 subagents: (response.subagents || []).map((item, idx) => ({
 id: `agent-${idx}-${item.name}`,
 name: item.name,
 content: item.content,
 sourceRepo: item.sourceRepo,
 sourcePath: item.sourcePath,
 })),
 rules: (response.rules || []).map((item) => ({
 name: item.name,
 content: item.content,
 })),
 };
 } catch (error) {
 console.error("Failed to get approved config:", error);
 return null;
 }
}

/**
 * Resilient version of getApprovedConfig that returns FetchResult<Command[]>.
 * Used by the service-worker sync layer to decide cache behaviour:
 * - "success" → write new commands to cache
 * - "empty" → write empty array (no workflows configured)
 * - "error" → keep existing cache, never overwrite with nothing
 */
export async function getApprovedConfigResult(orgName: string,
 platform?: string,): Promise<FetchResult<Command[]>> {
 const query = platform ? `?platform=${platform}` : "";
 const result = await apiRequestResult<ApprovedConfigApiResponse>(`/organizations/${orgName}/approved-config${query}`,);

 if (result.status === "error") {
 return result; // propagate error as-is
 }

 if (result.status === "success") {
 const response = result.data;
 if (!response || !response.approved) {
 return { status: "empty" };
 }
 const commands: Command[] = (response.commands || []).map((item, idx) => ({
 id: `cmd-${idx}-${item.name}`,
 name: item.name,
 content: item.content,
 sourceRepo: item.sourceRepo,
 sourcePath: item.sourcePath,
 }));
 if (commands.length === 0) {
 return { status: "empty" };
 }
 return { status: "success", data: commands };
 }

 return { status: "empty" };
}

/**
 * Save a new command to the organization's approved config
 */
export async function saveCommand(orgName: string,
 command: Omit<Command, "id">,): Promise<{ success: boolean; error?: string }> {
 try {
 await apiRequest(`/organizations/${orgName}/commands`, {
 method: "POST",
 body: JSON.stringify(command),
 });
 return { success: true };
 } catch (error) {
 console.error("Failed to save command:", error);
 return {
 success: false,
 error: error instanceof Error ? error.message : "Save failed",
 };
 }
}

/**
 * Get model-assisted sync preflight hint for an org/platform.
 */
export async function getSyncPreflightHint(orgName: string,
 platform: string = "claude",): Promise<SyncCopilotHintResponse | null> {
 try {
 return await apiRequest<SyncCopilotHintResponse>(`/organizations/${orgName}/sync-preflight-hint`,
 {
 method: "POST",
 body: JSON.stringify({
 platform,
 clientSurface: "chrome_extension",
 }),
 },);
 } catch (error) {
 console.error("Failed to get sync preflight hint:", error);
 return null;
 }
}

/**
 * Generate model-assisted approved config proposal draft.
 */
export async function generateApprovedConfigProposal(orgName: string,
 request: {
 platform: string;
 rationale: string;
 policyName?: string;
 autoGenerate?: boolean;
 },): Promise<GenerateApprovedConfigProposalResult | null> {
 try {
 return await apiRequest<GenerateApprovedConfigProposalResult>(`/organizations/${orgName}/approved-config/proposals/generate`,
 {
 method: "POST",
 body: JSON.stringify({
...request,
 clientSurface: "chrome_extension",
 }),
 },);
 } catch (error) {
 console.error("Failed to generate approved config proposal:", error);
 return null;
 }
}

/**
 * Request discovery intelligence insight (shadow mode).
 */
export async function getDiscoveryInsight(orgName: string,
 request: {
 repo: string;
 filePath: string;
 platform: string;
 content: string;
 configId?: string;
 },): Promise<DiscoveryInsightResponse | null> {
 try {
 return await apiRequest<DiscoveryInsightResponse>(`/organizations/${orgName}/discovery-intelligence/insights`,
 {
 method: "POST",
 body: JSON.stringify({
...request,
 clientSurface: "chrome_extension",
 }),
 },);
 } catch (error) {
 console.error("Failed to get discovery insight:", error);
 return null;
 }
}

/**
 * Record a human correction to a governance AI decision (override pipeline).
 * Corrections become training data for the next LoRA fine-tuning cycle.
 */
export async function recordGovernanceOverride(params: {
 processType: string;
 organizationId: string;
 userId: string;
 originalInput: Record<string, unknown>;
 originalOutput: Record<string, unknown>;
 correctedOutput: Record<string, unknown>;
 overrideReason?: string;
}): Promise<{ id: string; timestamp: string } | null> {
 try {
 return await apiRequest<{ id: string; timestamp: string }>("/api/governance/overrides",
 {
 method: "POST",
 body: JSON.stringify(params),
 },);
 } catch (error) {
 console.error("Failed to record governance override:", error);
 return null;
 }
}

/**
 * Get sync status for an organization.
 * Derives sync state from approved config presence (no dedicated endpoint exists).
 */
export async function getSyncStatus(orgName: string,
 platform: string = "claude",): Promise<SyncStatus> {
 try {
 const config = await getApprovedConfig(orgName, platform);
 return {
 synced: config?.approved ?? false,
 lastSyncAt: config?.approvedAt ?? null,
 configVersion: config?.version,
 driftDetected: false,
 driftFiles: [],
 };
 } catch (error) {
 console.error("Failed to get sync status:", error);
 return {
 synced: false,
 lastSyncAt: null,
 driftDetected: false,
 driftFiles: [],
 };
 }
}

/**
 * Get proposals for an organization
 */
export async function getProposals(orgName: string,
 status?: string,): Promise<ConfigProposal[]> {
 try {
 const params = new URLSearchParams();
 if (status && status !== "all") {
 params.append("status", status);
 }
 const response = await apiRequest<{ proposals: ConfigProposal[] }>(`/api/orgs/${encodeURIComponent(orgName)}/proposals?${params.toString()}`,);
 return response.proposals || [];
 } catch (error) {
 console.error("Failed to get proposals:", error);
 return [];
 }
}

/**
 * Get discovered configs from Firestore cache (via API).
 * This loads existing scan results without triggering a new GitHub scan.
 */
export async function getDiscoveredConfigs(orgName: string,
 options?: { type?: string },): Promise<DiscoveredConfigsResponse> {
 try {
 const params = new URLSearchParams();
 params.set("groupBy", "name");
 if (options?.type) {
 params.set("type", options.type);
 }
 return await apiRequest<DiscoveredConfigsResponse>(`/organizations/${encodeURIComponent(orgName)}/discovered-configs?${params}`,);
 } catch (error) {
 console.error("Failed to get discovered configs:", error);
 return { organization: orgName, totalConfigs: 0 };
 }
}

/**
 * Trigger a fresh GitHub scan for an organization.
 * Only called when user explicitly clicks "Scan Now".
 */
export async function triggerScan(orgName: string): Promise<ScanResult> {
 try {
 return await apiRequest<ScanResult>(`/scan/${encodeURIComponent(orgName)}`,
 { method: "POST" },);
 } catch (error) {
 console.error("Failed to trigger scan:", error);
 return {
 success: false,
 message: error instanceof Error ? error.message : "Scan failed",
 error: error instanceof Error ? error.message : "Scan failed",
 totalConfigs: 0,
 };
 }
}

/**
 * Get scan progress for an organization.
 */
export async function getScanProgress(orgName: string): Promise<ScanProgress> {
 try {
 return await apiRequest<ScanProgress>(`/scan/${encodeURIComponent(orgName)}/progress`,);
 } catch {
 return {
 status: "idle",
 totalRepos: 0,
 scannedRepos: 0,
 percentage: 0,
 currentRepo: "",
 elapsedSeconds: 0,
 };
 }
}

/**
 * Fetch feature flags from API
 */
export async function getFeatureFlags(): Promise<FeatureFlagResponse | null> {
 try {
 return await apiRequest<FeatureFlagResponse>("/feature-flags");
 } catch (error) {
 console.error("Failed to fetch feature flags:", error);
 return null;
 }
}

/**
 * Check if a page should be visible based on feature flags and org context.
 * Uses @gal/core audience evaluation for hierarchical tier checks.
 */
export function isPageVisibleForOrg(flags: FeatureFlagResponse | null,
 pageId: string,
 selectedOrg: string | null,): boolean {
 if (!flags) return true; // Default to visible if flags not loaded

 const page = flags.pages[pageId];
 if (!page) {
 // Unknown page: allow in dev, restrict in prod
 return flags.environment.environment === "dev";
 }

 if (!page.effectivelyEnabled) return false;

 // Use @gal/core hierarchical audience tier evaluation.
 const requiredAudience: AudienceTier =
 (page.audience as AudienceTier) ?? "public";
 if (requiredAudience === "public") return true;

 if (!selectedOrg) return false;

 const normalizedSelectedOrg = normalizeOrgName(selectedOrg);
 const allowedInternalOrgs =
 page.internalOrgs && page.internalOrgs.length > 0
 ? normalizeOrgList(page.internalOrgs)
 : [];

 // The extension does not receive org audience/plan maps yet, so it can
 // only distinguish explicitly internal orgs from the default public tier.
 const orgAudienceTier = allowedInternalOrgs.includes(normalizedSelectedOrg)
 ? "internal"
 : null;
 const orgTier = resolveOrgTier(orgAudienceTier, "free");

 return meetsAudience(orgTier, requiredAudience);
}

// ---- Enforcement API types and functions ----

export type ComplianceLevel = "compliant" | "warning" | "violation";

export interface ComplianceStatus {
 level: ComplianceLevel;
 summary: string;
 totalPolicies: number;
 compliantCount: number;
 violationCount: number;
 warningCount: number;
 lastCheckedAt: string | null;
}

export interface PolicyViolation {
 id: string;
 policyName: string;
 severity: "critical" | "high" | "medium" | "low";
 type: "tool" | "domain" | "config" | "permission";
 message: string;
 detectedAt: string;
 resolved: boolean;
}

export interface EnforcementPolicy {
 id: string;
 name: string;
 description?: string;
 enabled: boolean;
 severity: "critical" | "high" | "medium" | "low";
 type: "tool" | "domain" | "config" | "permission";
}

/**
 * Get compliance status for an organization.
 * Maps the real API response (repos/summary shape) to the UI model.
 */
export async function getComplianceStatus(orgName: string,): Promise<ComplianceStatus | null> {
 try {
 const data = await apiRequest<{
 repos: Array<{
 repo: string;
 hasConfig: boolean;
 isCompliant: boolean;
 violations: string[];
 lastChecked: string;
 }>;
 summary: {
 total: number;
 compliant: number;
 nonCompliant: number;
 missingFile: number;
 };
 }>(`/organizations/${encodeURIComponent(orgName)}/compliance/status`);

 return {
 level:
 data.summary.nonCompliant > 0
 ? "violation"
 : data.summary.missingFile > 0
 ? "warning"
 : "compliant",
 summary: `${data.summary.compliant}/${data.summary.total} repos compliant`,
 totalPolicies: data.summary.total,
 compliantCount: data.summary.compliant,
 violationCount: data.summary.nonCompliant,
 warningCount: data.summary.missingFile,
 lastCheckedAt: new Date().toISOString(),
 };
 } catch (error) {
 console.error("Failed to get compliance status:", error);
 return null;
 }
}

/**
 * Get policy violations for an organization.
 * Derives violations from the compliance status endpoint (no separate violations endpoint exists).
 */
export async function getPolicyViolations(orgName: string,): Promise<PolicyViolation[]> {
 try {
 const data = await apiRequest<{
 repos: Array<{
 repo: string;
 hasConfig: boolean;
 isCompliant: boolean;
 violations: string[];
 lastChecked: string;
 }>;
 summary: {
 total: number;
 compliant: number;
 nonCompliant: number;
 missingFile: number;
 };
 }>(`/organizations/${encodeURIComponent(orgName)}/compliance/status`);

 return data.repos
.filter((r) => !r.isCompliant)
.map((r) => ({
 id: r.repo,
 policyName: "tool-allowlist",
 severity: (r.hasConfig ? "medium" : "high") as "medium" | "high",
 type: "config" as const,
 message: r.violations?.[0] || "Non-compliant configuration",
 detectedAt: r.lastChecked || new Date().toISOString(),
 resolved: false,
 }));
 } catch (error) {
 console.error("Failed to get policy violations:", error);
 return [];
 }
}

/**
 * Get enforcement policies for an organization.
 * Uses the tool-policies endpoint which exists in the API.
 */
export async function getEnforcementPolicies(orgName: string,): Promise<EnforcementPolicy[]> {
 try {
 const data = await apiRequest<
 | { policies: Array<Record<string, unknown>> }
 | Array<Record<string, unknown>>
 >(`/organizations/${encodeURIComponent(orgName)}/tool-policies`);

 const policies = Array.isArray(data)
 ? data
 : (data as { policies: Array<Record<string, unknown>> }).policies || [];

 return policies.map((p: Record<string, unknown>) =>
 ({
 id: (p.id as string) || (p.name as string) || "",
 name: (p.name as string) || (p.id as string) || "",
 description: (p.description as string) || "",
 enabled: p.enabled !== false,
 severity: (p.severity as EnforcementPolicy["severity"]) || "medium",
 type: (p.type as EnforcementPolicy["type"]) || "tool",
 }) satisfies EnforcementPolicy,);
 } catch (error) {
 console.error("Failed to get enforcement policies:", error);
 return [];
 }
}

/**
 * Detect platform from current URL
 */
export function detectPlatform(url: string): string | null {
 if (url.includes("claude.ai")) return "claude";
 if (url.includes("chatgpt.com/codex")) return "codex-cloud";
 if (url.includes("chatgpt.com")) return "chatgpt";
 if (url.includes("gemini.google.com")) return "gemini";
 if (url.includes("github.com")) return "copilot";
 if (url.includes("midjourney.com")) return "midjourney";
 if (url.includes("ideogram.ai")) return "ideogram";
 if (url.includes("leonardo.ai")) return "leonardo";
 if (url.includes("runwayml.com")) return "runway";
 if (url.includes("pika.art")) return "pika";
 if (url.includes("aistudio.google.com")) return "ai-studio";
 if (url.includes("klingai.com")) return "kling";
 if (url.includes("higgsfield.ai")) return "higgsfield";
 if (url.includes("jules.google.com")) return "jules";
 return null;
}

/**
 * Create a browser profile by uploading cookie/storage state to the GAL API.
 * Used by the CookieExportCard to save browser auth for background agent sessions.
 */
export async function createBrowserProfile(data: {
 name: string;
 domains?: string[];
 storageState: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
 try {
 const result = await apiRequest<{ id: string }>("/api/browser-profiles", {
 method: "POST",
 body: JSON.stringify(data),
 });
 return { success: true, id: result.id };
 } catch (error) {
 console.error("Failed to create browser profile:", error);
 return {
 success: false,
 error: error instanceof Error ? error.message : "Upload failed",
 };
 }
}
