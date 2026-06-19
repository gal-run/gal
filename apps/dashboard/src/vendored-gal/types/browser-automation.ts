/**
 * Browser Automation Contract Types (#2124)
 *
 * Defines a standardized contract for browser automation across MCP backends
 * in background agent sessions. Supports:
 * - chrome-devtools-mcp
 * - playwright-mcp
 * - claude-chrome-mcp (Claude's built-in Chrome)
 *
 * Key concepts:
 * - BrowserBackend: An available browser automation MCP server
 * - ScreenshotArtifact: A captured screenshot with metadata
 * - BrowserAutomationEvent: Streamed to RTDB for dashboard display
 */

// =============================================================================
// Browser Backend Detection
// =============================================================================

/**
 * Supported browser automation MCP backends.
 * Ordered by deterministic fallback priority (first available wins).
 */
export type BrowserBackendId =
  | 'chrome-devtools'   // chrome-devtools-mcp (highest priority)
  | 'playwright'        // playwright-mcp
  | 'claude-chrome';    // Claude's built-in Chrome MCP

/**
 * Metadata about a detected browser backend.
 */
export interface BrowserBackend {
  /** Unique backend identifier */
  id: BrowserBackendId;
  /** Human-readable name */
  displayName: string;
  /** Whether this backend is currently available (MCP server detected + responsive) */
  available: boolean;
  /** Reason for unavailability (e.g., "MCP server not configured", "Connection refused") */
  unavailableReason?: string;
  /** MCP server name from approved config or user MCP config (e.g., "chrome-devtools") */
  mcpServerName?: string;
  /** Version of the MCP server if detectable */
  version?: string;
}

/**
 * Deterministic fallback order for browser backends.
 * The first available backend in this list is selected.
 */
export const BROWSER_BACKEND_FALLBACK_ORDER: BrowserBackendId[] = [
  'chrome-devtools',
  'playwright',
  'claude-chrome',
];

/**
 * Static metadata for each browser backend.
 */
export const BROWSER_BACKEND_CONFIGS: Record<BrowserBackendId, {
  displayName: string;
  mcpServerName: string;
  description: string;
}> = {
  'chrome-devtools': {
    displayName: 'Chrome DevTools MCP',
    mcpServerName: 'chrome-devtools',
    description: 'Direct Chrome DevTools Protocol via chrome-devtools-mcp',
  },
  'playwright': {
    displayName: 'Playwright MCP',
    mcpServerName: 'playwright',
    description: 'Playwright browser automation via @anthropic/playwright-mcp',
  },
  'claude-chrome': {
    displayName: 'Claude Chrome',
    mcpServerName: 'claude-in-chrome',
    description: 'Claude built-in Chrome automation via Claude-in-Chrome MCP',
  },
};

/**
 * Result of backend detection scan.
 */
export interface BrowserBackendDetectionResult {
  /** All detected backends with availability status */
  backends: BrowserBackend[];
  /** The selected backend (first available in fallback order), or null if none available */
  selectedBackend: BrowserBackend | null;
  /** ISO 8601 timestamp of detection */
  detectedAt: string;
  /** Reason for selection (e.g., "First available in fallback order") */
  selectionReason: string;
}

// =============================================================================
// Screenshot Capture API
// =============================================================================

/**
 * Screenshot capture modes supported by the contract.
 */
export type ScreenshotCaptureMode =
  | 'viewport'    // Current visible viewport
  | 'full_page'   // Full scrollable page
  | 'element';    // Specific DOM element

/**
 * Request to capture a screenshot through any MCP backend.
 */
export interface ScreenshotCaptureRequest {
  /** Capture mode */
  mode: ScreenshotCaptureMode;
  /** Element selector (required when mode is 'element') */
  selector?: string;
  /** Element UID from accessibility snapshot (alternative to selector) */
  elementUid?: string;
  /** Image format */
  format?: 'png' | 'jpeg' | 'webp';
  /** JPEG/WebP quality (0-100) */
  quality?: number;
  /** Optional file path to save to (otherwise returns base64) */
  filePath?: string;
}

/**
 * A captured screenshot artifact with metadata.
 */
export interface ScreenshotArtifact {
  /** Unique artifact identifier */
  id: string;
  /** Session that produced this artifact */
  sessionId: string;
  /** Capture mode used */
  mode: ScreenshotCaptureMode;
  /** Backend that captured the screenshot */
  backendId: BrowserBackendId;
  /** MCP tool name used (e.g., "mcp__chrome-devtools__take_screenshot") */
  toolName: string;
  /** Image format */
  format: 'png' | 'jpeg' | 'webp';
  /** Base64-encoded image data (may be null if saved to file) */
  base64Data?: string;
  /** File path if saved to disk */
  filePath?: string;
  /** Image dimensions */
  width?: number;
  height?: number;
  /** File size in bytes */
  sizeBytes?: number;
  /** Page URL at time of capture */
  pageUrl?: string;
  /** Page title at time of capture */
  pageTitle?: string;
  /** ISO 8601 timestamp of capture */
  capturedAt: string;
  /** Thumbnail base64 (resized for dashboard display, max 200px wide) */
  thumbnailBase64?: string;
}

// =============================================================================
// Browser Automation Events (streamed to RTDB)
// =============================================================================

/**
 * Browser automation event types streamed to Firebase RTDB.
 * These are rendered by the dashboard session UI.
 */
export type BrowserAutomationEventType =
  | 'browser_backend_detected'   // Backend detection completed
  | 'screenshot_captured'        // Screenshot successfully captured
  | 'screenshot_failed'          // Screenshot capture failed
  | 'browser_navigation'         // Page navigation occurred
  | 'browser_error';             // Browser-level error

/**
 * Base event streamed to RTDB for dashboard display.
 */
export interface BrowserAutomationEvent {
  /** Event type */
  type: BrowserAutomationEventType;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Backend that produced the event */
  backendId: BrowserBackendId;
  /** Session ID */
  sessionId: string;
}

/**
 * Backend detection event.
 */
export interface BackendDetectedEvent extends BrowserAutomationEvent {
  type: 'browser_backend_detected';
  /** Full detection result */
  detectionResult: BrowserBackendDetectionResult;
}

/**
 * Screenshot captured successfully.
 */
export interface ScreenshotCapturedEvent extends BrowserAutomationEvent {
  type: 'screenshot_captured';
  /** The screenshot artifact */
  artifact: ScreenshotArtifact;
}

/**
 * Screenshot capture failed.
 */
export interface ScreenshotFailedEvent extends BrowserAutomationEvent {
  type: 'screenshot_failed';
  /** Failure category */
  failureCode: BrowserAutomationFailureCode;
  /** Human-readable error message */
  errorMessage: string;
  /** Actionable remediation text for the user */
  remediation: string;
  /** Original request that failed */
  request?: ScreenshotCaptureRequest;
}

/**
 * Browser navigation event.
 */
export interface BrowserNavigationEvent extends BrowserAutomationEvent {
  type: 'browser_navigation';
  /** URL navigated to */
  url: string;
  /** Page title after navigation */
  title?: string;
}

/**
 * Browser-level error event.
 */
export interface BrowserErrorEvent extends BrowserAutomationEvent {
  type: 'browser_error';
  /** Failure category */
  failureCode: BrowserAutomationFailureCode;
  /** Human-readable error message */
  errorMessage: string;
  /** Actionable remediation text */
  remediation: string;
}

// =============================================================================
// Error Handling
// =============================================================================

/**
 * Explicit failure codes for browser automation errors.
 * Each code has a deterministic remediation message.
 */
export type BrowserAutomationFailureCode =
  | 'BACKEND_NOT_AVAILABLE'     // No browser backend detected
  | 'BACKEND_CONNECTION_FAILED' // Backend detected but connection failed
  | 'PERMISSION_DENIED'         // Insufficient permissions for browser action
  | 'AUTH_REQUIRED'             // Authentication needed (e.g., login page)
  | 'BROWSER_NOT_FOUND'        // Browser binary not installed
  | 'ELEMENT_NOT_FOUND'        // Target element not found in DOM
  | 'PAGE_TIMEOUT'             // Page load or operation timeout
  | 'SCREENSHOT_FAILED'        // Generic screenshot failure
  | 'INVALID_SELECTOR'         // CSS/XPath selector is malformed
  | 'MCP_SERVER_ERROR';        // MCP server returned an error

/**
 * Mapping of failure codes to actionable remediation messages.
 */
export const FAILURE_REMEDIATIONS: Record<BrowserAutomationFailureCode, string> = {
  BACKEND_NOT_AVAILABLE:
    'No browser automation backend is available. Ensure at least one MCP server (chrome-devtools, playwright, or claude-chrome) is configured in approved config or user MCP config.',
  BACKEND_CONNECTION_FAILED:
    'Browser backend was detected but connection failed. Check that the MCP server process is running and the browser is accessible.',
  PERMISSION_DENIED:
    'Insufficient permissions for this browser action. Check MCP server configuration and ensure the agent has browser automation permissions.',
  AUTH_REQUIRED:
    'The target page requires authentication. Navigate to the login page first or provide credentials via environment variables.',
  BROWSER_NOT_FOUND:
    'Browser binary not found. Install Chrome/Chromium or set the CHROME_PATH environment variable.',
  ELEMENT_NOT_FOUND:
    'Target element not found in the DOM. Verify the selector/UID and ensure the page has fully loaded.',
  PAGE_TIMEOUT:
    'Page operation timed out. Check network connectivity, increase timeout, or verify the target URL is reachable.',
  SCREENSHOT_FAILED:
    'Screenshot capture failed. Try a different capture mode (viewport instead of full_page) or check browser state.',
  INVALID_SELECTOR:
    'The provided CSS/XPath selector is malformed. Verify the selector syntax and try again.',
  MCP_SERVER_ERROR:
    'The MCP server returned an error. Check MCP server logs for details and ensure the server version is up to date.',
};

// =============================================================================
// Adapter Interface
// =============================================================================

/**
 * Interface that each browser backend adapter must implement.
 * This provides a unified API across different MCP backends.
 */
export interface BrowserBackendAdapter {
  /** Backend identifier */
  readonly id: BrowserBackendId;

  /** Check if the backend is available and responsive */
  detect(): Promise<BrowserBackend>;

  /** Capture a screenshot using this backend */
  captureScreenshot(request: ScreenshotCaptureRequest): Promise<ScreenshotArtifact>;

  /** Navigate to a URL */
  navigate(url: string, options?: { timeout?: number }): Promise<BrowserNavigationEvent>;

  /** Take a page snapshot (accessibility tree) */
  takeSnapshot(): Promise<string>;
}
