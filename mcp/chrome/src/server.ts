import { existsSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { lookup } from "dns";
import { promisify } from "util";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { BrowserContext, Page } from "playwright";

interface ChromeExtensionGalServerConfig {
  projectPath?: string;
}

interface ChromeExtensionSession {
  context: BrowserContext;
  extensionId: string;
  extensionPath: string;
  popupPage: Page | null;
  currentPage: Page | null;
  userDataDir: string;
}

const CHROME_EXTENSION_GAL_TOOLS = [
  {
    name: "chrome_extension_launch",
    description: "Launch Chromium with the GAL Chrome extension loaded.",
    inputSchema: {
      type: "object" as const,
      properties: {
        extension_path: {
          type: "string",
          description: "Path to the unpacked extension dist directory",
        },
        user_data_dir: {
          type: "string",
          description: "Persistent Chromium profile directory",
        },
        start_url: {
          type: "string",
          description: "Optional page to open after launch",
        },
        browser_channel: {
          type: "string",
          description: "Playwright browser channel (default: chrome)",
        },
        headless: {
          type: "boolean",
          description: "Use Chrome headless new mode (default: true)",
        },
        gal_session_token: {
          type: "string",
          description:
            "Optional session token to inject as a host-scoped cookie before opening pages. Requires both cookie_domain AND start_url to be set, and cookie_domain must equal the start_url host.",
        },
        cookie_domain: {
          type: "string",
          description:
            "Concrete registrable host for session token injection (required when gal_session_token is provided, e.g. app.example.com). Must match the start_url host. Bare TLDs, public suffixes, and leading-dot wildcards are rejected/over-broad and are not used as a context-level domain cookie.",
        },
        allow_private_hosts: {
          type: "boolean",
          description:
            "Opt in to navigating start_url to private/loopback hosts (127.0.0.0/8, RFC1918, link-local, etc.). Default false to mitigate SSRF.",
        },
      },
    },
  },
  {
    name: "chrome_extension_open_popup",
    description:
      "Open the extension popup page in the current browser context.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "chrome_extension_open_url",
    description:
      "Open a normal browser tab to exercise the content script or auth bridge.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "URL to open (http/https only)" },
        allow_private_hosts: {
          type: "boolean",
          description:
            "Opt in to navigating to private/loopback hosts (127.0.0.0/8, RFC1918, link-local, etc.). Default false to mitigate SSRF.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "chrome_extension_get_popup_text",
    description: "Read visible text from the extension popup.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "chrome_extension_click_popup_text",
    description: "Click visible text inside the extension popup.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "Visible text to click" },
        exact: { type: "boolean", description: "Require an exact text match" },
      },
      required: ["text"],
    },
  },
  {
    name: "chrome_extension_get_page_text",
    description: "Read visible text from the active non-popup browser page.",
    inputSchema: {
      type: "object" as const,
      properties: {
        selector: { type: "string", description: "Optional CSS selector" },
      },
    },
  },
  {
    name: "chrome_extension_screenshot",
    description: "Capture the popup or active page as a PNG screenshot.",
    inputSchema: {
      type: "object" as const,
      properties: {
        target: {
          type: "string",
          description:
            "Either popup or page (default: popup when open, otherwise page)",
        },
      },
    },
  },
  {
    name: "chrome_extension_state",
    description: "Return the current extension id and tracked page URLs.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "chrome_extension_highlight_tab",
    description:
      "Add an orange border overlay and label pill to the active browser tab to indicate automation.",
    inputSchema: {
      type: "object" as const,
      properties: {
        color: {
          type: "string",
          description: "Border and label color (default: orange)",
        },
        label: {
          type: "string",
          description: "Label text (default: 'Automated')",
        },
      },
    },
  },
  {
    name: "chrome_extension_clear_highlight",
    description: "Remove the automation overlay indicator from the active tab.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "chrome_extension_close",
    description:
      "Close the current browser context and release the extension session.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "chrome_extension_tabGroups_create",
    description: "Create a tab group from the specified tab IDs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tabIds: {
          type: "array",
          items: { type: "number" },
          description: "Array of tab IDs to group",
        },
        title: {
          type: "string",
          description: "Optional title for the tab group",
        },
        color: {
          type: "string",
          description:
            "Optional color for the tab group (e.g., grey, blue, red, yellow, green, pink, purple, cyan)",
        },
      },
      required: ["tabIds"],
    },
  },
  {
    name: "chrome_extension_tabGroups_list",
    description: "List all tab groups in the current window.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "chrome_extension_tabs_query",
    description: "Query tabs matching the given criteria.",
    inputSchema: {
      type: "object" as const,
      properties: {
        active: {
          type: "boolean",
          description: "Whether the tab is active",
        },
        currentWindow: {
          type: "boolean",
          description: "Whether the tab is in the current window",
        },
        url: {
          type: "string",
          description: "Match tabs with this URL or URL pattern",
        },
      },
    },
  },
  {
    name: "chrome_extension_tabs_create",
    description: "Create a new browser tab.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to open in the new tab",
        },
        active: {
          type: "boolean",
          description:
            "Whether the new tab should become active (default: true)",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "chrome_extension_tabs_remove",
    description: "Close one or more tabs by their IDs.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tabIds: {
          type: "array",
          items: { type: "number" },
          description: "Array of tab IDs to close",
        },
      },
      required: ["tabIds"],
    },
  },
  {
    name: "chrome_extension_bookmarks_search",
    description: "Search bookmarks by query string.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Text to search for in bookmarks",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "chrome_extension_history_search",
    description: "Search browser history by text.",
    inputSchema: {
      type: "object" as const,
      properties: {
        text: {
          type: "string",
          description: "Text to search for in history",
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results to return (default: 100)",
        },
      },
      required: ["text"],
    },
  },
  {
    name: "chrome_extension_windows_create",
    description: "Create a new browser window.",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "Optional URL to open in the new window",
        },
        type: {
          type: "string",
          description: "Window type: normal, popup, panel, or app",
        },
      },
    },
  },
  {
    name: "chrome_extension_agent_run",
    description:
      "Run a browser-use agent task via the Python service (default: http://127.0.0.1:8123).",
    inputSchema: {
      type: "object" as const,
      properties: {
        task: {
          type: "string",
          description: "Natural language task description for the agent",
        },
        start_url: {
          type: "string",
          description: "Optional starting URL for the agent",
        },
        max_steps: {
          type: "number",
          description:
            "Maximum number of steps the agent may take (default: 50)",
        },
      },
      required: ["task"],
    },
  },
  {
    name: "chrome_extension_enhanced_parse",
    description:
      "Get enhanced DOM + accessibility tree via the Python service (default: http://127.0.0.1:8123).",
    inputSchema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to parse",
        },
      },
      required: ["url"],
    },
  },
] as const;

function toJsonContent(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload),
      },
    ],
  };
}

/**
 * Base URL of the companion browser-use Python service that backs the
 * agent_run and enhanced_parse tools (see mcp/gal-browser-use-service).
 * Defaults to the loopback service the README documents; overridable via
 * GAL_BROWSER_USE_SERVICE_URL so deployments can point at a co-located host.
 */
function browserUseServiceUrl(): string {
  const raw = process.env.GAL_BROWSER_USE_SERVICE_URL;
  const url = raw && raw.length > 0 ? raw : "http://127.0.0.1:8123";
  return url.replace(/\/+$/, "");
}

/**
 * Allow opting in to private/loopback navigation either per-call
 * (allow_private_hosts) or process-wide via env. Default is OFF.
 */
function privateHostsAllowed(args: Record<string, unknown>): boolean {
  if (args.allow_private_hosts === true) {
    return true;
  }
  const env = process.env.GAL_CHROME_MCP_ALLOW_PRIVATE_HOSTS;
  return env === "1" || env === "true";
}

function ipv4ToParts(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const value = Number(part);
    if (value < 0 || value > 255) {
      return null;
    }
    nums.push(value);
  }
  return nums;
}

/**
 * Decide whether a dotted-quad IPv4 (already parsed into octets) falls in a
 * private, loopback, link-local, unspecified, or otherwise non-public range.
 */
function isPrivateOrLoopbackIpv4(parts: number[]): boolean {
  const [a, b] = parts;
  // 0.0.0.0/8 (incl. unspecified 0.0.0.0)
  if (a === 0) return true;
  // 127.0.0.0/8 loopback
  if (a === 127) return true;
  // 10.0.0.0/8
  if (a === 10) return true;
  // 100.64.0.0/10 carrier-grade NAT
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 link-local (incl. 169.254.169.254 cloud metadata)
  if (a === 169 && b === 254) return true;
  return false;
}

/**
 * Result of attempting to extract an IPv4 address embedded inside an IPv6
 * literal (IPv4-mapped, IPv4-compatible, NAT64). `undecodable` means an
 * embedded-IPv4 form was recognised by prefix but its trailing bits could
 * not be confidently parsed — callers MUST block by default in that case.
 */
type EmbeddedIpv4 =
  | { kind: "none" }
  | { kind: "ipv4"; parts: number[] }
  | { kind: "undecodable" };

/**
 * Detect and decode an IPv4 address embedded in an IPv6 literal so that
 * `::ffff:127.0.0.1`, the hex-compressed `::ffff:7f00:1`, the
 * IPv4-compatible `::a.b.c.d`, and NAT64 `64:ff9b::a.b.c.d` /
 * `64:ff9b::xxxx:yyyy` all run through the IPv4 private-range checks.
 */
function hextetsToIpv4(hi: number, lo: number): EmbeddedIpv4 {
  if (Number.isNaN(hi) || Number.isNaN(lo) || hi > 0xffff || lo > 0xffff) {
    return { kind: "undecodable" };
  }
  return {
    kind: "ipv4",
    parts: [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff],
  };
}

function extractEmbeddedIpv4(host: string): EmbeddedIpv4 {
  // NOTE: the WHATWG URL parser normalizes IPv6 hosts before they reach
  // here — dotted embedded IPv4 like `::ffff:127.0.0.1` becomes the
  // hex-compressed `::ffff:7f00:1`, and `::127.0.0.1` becomes `::7f00:1`.
  // We therefore handle BOTH the raw dotted forms (defensive, in case a
  // host string is checked pre-parse, e.g. a DNS-resolved address) and the
  // normalized hex-compressed forms.

  // --- Dotted-quad embedded IPv4 (defensive / pre-normalization) ---
  // ::ffff:a.b.c.d (IPv4-mapped), ::a.b.c.d (IPv4-compatible),
  // 64:ff9b::a.b.c.d (NAT64 well-known prefix).
  const dottedPrefixes = [
    /^::ffff:(\d+\.\d+\.\d+\.\d+)$/,
    /^::(\d+\.\d+\.\d+\.\d+)$/,
    /^64:ff9b::(\d+\.\d+\.\d+\.\d+)$/,
  ];
  for (const re of dottedPrefixes) {
    const m = host.match(re);
    if (m) {
      const parts = ipv4ToParts(m[1]);
      return parts ? { kind: "ipv4", parts } : { kind: "undecodable" };
    }
  }

  // --- Hex-compressed IPv4-mapped / NAT64: two trailing hextets ---
  // ::ffff:wwww:xxxx (IPv4-mapped), 64:ff9b::wwww:xxxx (NAT64).
  let m = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (m) return hextetsToIpv4(parseInt(m[1], 16), parseInt(m[2], 16));
  m = host.match(/^64:ff9b::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (m) return hextetsToIpv4(parseInt(m[1], 16), parseInt(m[2], 16));

  // --- Hex-compressed IPv4-compatible: `::wwww:xxxx` or `::xxxx` ---
  // After normalization `::127.0.0.1` => `::7f00:1`, `::8.8.8.8` => `::808:808`.
  // The high 96 bits are all zero, so the last 32 bits ARE the embedded IPv4.
  // `::` and `::1` are handled by the caller before reaching this function.
  m = host.match(/^::([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (m) return hextetsToIpv4(parseInt(m[1], 16), parseInt(m[2], 16));
  m = host.match(/^::([0-9a-f]{1,4})$/);
  if (m) {
    const lo = parseInt(m[1], 16);
    // Single trailing hextet: embedded IPv4 = 0.0.(hi).(lo) of the low word,
    // which always lands in 0.0.0.0/8 (non-public) and is blocked.
    return hextetsToIpv4(0, lo);
  }

  // Recognised an IPv4-mapped/NAT64 prefix but could not match a known
  // trailing form — block by default rather than treat as a public host.
  if (host.startsWith("::ffff:") || host.startsWith("64:ff9b:")) {
    return { kind: "undecodable" };
  }

  return { kind: "none" };
}

/**
 * Identify hostnames that resolve to (or literally are) private,
 * loopback, link-local, or unspecified addresses. Used to block SSRF
 * to internal services unless explicitly opted in. IPv6 literals that
 * embed an IPv4 address (IPv4-mapped, IPv4-compatible, NAT64) are decoded
 * and the embedded IPv4 is range-checked; ambiguous embedded forms are
 * blocked by default.
 */
function isPrivateOrLoopbackHost(rawHost: string): boolean {
  let host = rawHost.trim().toLowerCase();
  if (host.length === 0) {
    return true;
  }

  // Strip IPv6 brackets, e.g. [::1] -> ::1
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  // Drop any IPv6 zone index, e.g. fe80::1%eth0 -> fe80::1
  const zoneIdx = host.indexOf("%");
  if (zoneIdx !== -1) {
    host = host.slice(0, zoneIdx);
  }

  if (host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }

  const ipv4 = ipv4ToParts(host);
  if (ipv4) {
    return isPrivateOrLoopbackIpv4(ipv4);
  }

  // IPv6 handling
  if (host.includes(":")) {
    if (host === "::" || host === "::1") return true;
    if (host === "0:0:0:0:0:0:0:0" || host === "0:0:0:0:0:0:0:1") return true;

    // IPv4-mapped / IPv4-compatible / NAT64 embedded IPv4. Decode and run
    // the embedded address through the IPv4 range checks; block by default
    // if the embedded form is recognised but not confidently decodable.
    const embedded = extractEmbeddedIpv4(host);
    if (embedded.kind === "undecodable") return true;
    if (embedded.kind === "ipv4") return isPrivateOrLoopbackIpv4(embedded.parts);

    // fe80::/10 link-local
    if (/^fe[89ab][0-9a-f]?:/.test(host)) return true;
    // fc00::/7 unique-local (covers fd00::/8)
    if (/^f[cd][0-9a-f]{0,2}:/.test(host)) return true;
    return false;
  }

  return false;
}

const dnsLookup = promisify(lookup);

/**
 * Normalize a URL hostname for DNS resolution: strip IPv6 brackets and any
 * zone index. (URL.hostname returns IPv6 hosts in bracketed form, which
 * dns.lookup does not accept.)
 */
function hostForResolution(rawHost: string): string {
  let host = rawHost.trim();
  if (host.startsWith("[") && host.endsWith("]")) {
    host = host.slice(1, -1);
  }
  const zoneIdx = host.indexOf("%");
  if (zoneIdx !== -1) {
    host = host.slice(0, zoneIdx);
  }
  return host;
}

/**
 * True if the host is a literal IPv4 or IPv6 address (so DNS resolution is
 * unnecessary — it was already range-checked synchronously).
 */
function isIpLiteral(host: string): boolean {
  if (ipv4ToParts(host)) return true;
  return host.includes(":");
}

/**
 * Resolve a hostname and report whether ANY resolved address is
 * private/loopback/link-local. This defeats DNS names that point at
 * internal addresses and resolve-time rebinding. Resolution failure is
 * treated as private (reject) so we never fail open. Literal IP hosts skip
 * resolution: they were already range-checked by the caller, and dns.lookup
 * would either echo them back (public) or, for bracketed IPv6, fail and
 * cause a false reject.
 */
async function resolvesToPrivateOrLoopback(rawHost: string): Promise<boolean> {
  const host = hostForResolution(rawHost);
  if (isIpLiteral(host)) {
    // Already validated synchronously by isPrivateOrLoopbackHost.
    return false;
  }
  try {
    const records = await dnsLookup(host, { all: true });
    if (!records || records.length === 0) {
      return true;
    }
    for (const rec of records) {
      if (isPrivateOrLoopbackHost(rec.address)) {
        return true;
      }
    }
    return false;
  } catch {
    // Treat resolution failure as reject — fail closed.
    return true;
  }
}

/**
 * Outcome of resolving a navigation target ONCE and binding the request to the
 * exact address that was just validated. This closes the DNS-rebinding
 * (time-of-check / time-of-use) race: instead of validating a hostname and then
 * letting Playwright's route.fetch perform its OWN independent connect-time
 * resolution (which an attacker with a low-TTL record can answer differently),
 * we resolve a single concrete IP, prove it is public, and issue the fetch
 * against that literal IP while preserving the original Host header.
 *
 * - `allowed: false` — reject (private/unresolvable/ambiguous/non-http(s)).
 * - `allowed: true` — `fetchUrl` is the URL to hand to route.fetch and
 *   `hostHeader` is the Host header to preserve. For http the fetchUrl host is
 *   the pinned literal IP. For https the host is kept as the original name
 *   (rewriting to an IP would break TLS certificate/SNI verification), but the
 *   single-record/no-rebind validation below still hardens it materially and
 *   browser TLS verification independently rejects a rebound private IP that
 *   cannot present a valid certificate for the name.
 */
type PinnedTarget =
  | { allowed: false }
  | { allowed: true; fetchUrl: string; hostHeader: string };

/**
 * Wrap a literal IP for use in a URL: IPv6 needs brackets, IPv4 does not.
 */
function ipToUrlHost(ip: string): string {
  return ip.includes(":") ? `[${ip}]` : ip;
}

/**
 * Resolve a navigation target ONCE and pin the request to the validated
 * address. Rejects: non-http(s) schemes; literal private/loopback/link-local
 * hosts; names that fail to resolve; and names whose records include ANY
 * private/loopback/link-local address. For names with multiple PUBLIC answers
 * (dual-stack A+AAAA, round-robin) it pins the FIRST address — still a literal,
 * validated IP, so the TOCTOU race is closed — rather than rejecting normal
 * public hosts. Literal-IP hosts that already passed the range check are used
 * as-is. Fails closed on any error.
 */
async function resolveAndPinTarget(rawUrl: string): Promise<PinnedTarget> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { allowed: false };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { allowed: false };
  }
  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    return { allowed: false };
  }

  const host = hostForResolution(parsed.hostname);

  // Literal IP host: already range-checked above; no resolution to pin/race.
  if (isIpLiteral(host)) {
    return {
      allowed: true,
      fetchUrl: parsed.toString(),
      hostHeader: parsed.host,
    };
  }

  let records: Array<{ address: string }>;
  try {
    records = await dnsLookup(host, { all: true });
  } catch {
    return { allowed: false };
  }
  if (!records || records.length === 0) {
    return { allowed: false };
  }

  // Reject if ANY answer is private/loopback/link-local. This is what makes a
  // multi-answer (rebinding-shaped) record safe to pin: a mixed public+private
  // answer is rejected outright here, so any record that survives is all-public.
  for (const rec of records) {
    if (isPrivateOrLoopbackHost(rec.address)) {
      return { allowed: false };
    }
  }

  // All answers are public. Pin the first concrete address: the fetch targets a
  // literal, validated IP (no separate connect-time resolution to rebind),
  // while still supporting normal dual-stack / round-robin public hosts.
  const pinnedIp = records[0].address;

  // For http, pin to the literal IP and preserve the Host header — the request
  // actually issued targets the exact address we just validated, so there is no
  // separate connect-time resolution to rebind. For https, keep the hostname so
  // TLS SNI / certificate verification stays correct; the single-record + no-
  // private validation plus browser TLS verification cover that path.
  if (parsed.protocol === "http:") {
    const pinned = new URL(parsed.toString());
    pinned.host = parsed.port
      ? `${ipToUrlHost(pinnedIp)}:${parsed.port}`
      : ipToUrlHost(pinnedIp);
    return {
      allowed: true,
      fetchUrl: pinned.toString(),
      hostHeader: parsed.host,
    };
  }

  return {
    allowed: true,
    fetchUrl: parsed.toString(),
    hostHeader: parsed.host,
  };
}

/**
 * Validate a navigation target before opening it. Allows only http/https,
 * rejecting file:, chrome:, chrome-extension:, data:, and other schemes,
 * and blocks private/loopback hosts unless explicitly opted in. When private
 * hosts are not allowed it also performs a DNS resolution check so that a
 * public-looking hostname that resolves to an internal address (or rebinds
 * at resolve time) is rejected. Returns the normalized URL string to
 * navigate to.
 */
async function assertNavigableUrl(
  rawUrl: string,
  args: Record<string, unknown>,
): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Refusing to open non-http(s) URL scheme "${parsed.protocol}". Only http and https are allowed.`,
    );
  }

  if (!privateHostsAllowed(args)) {
    // 1. Literal-host check (covers IP literals incl. IPv6-embedded IPv4).
    if (isPrivateOrLoopbackHost(parsed.hostname)) {
      throw new Error(
        `Refusing to open private/loopback host "${parsed.hostname}". ` +
          "Set allow_private_hosts=true (or GAL_CHROME_MCP_ALLOW_PRIVATE_HOSTS=1) to override.",
      );
    }
    // 2. DNS check — reject names that resolve to internal addresses, and
    //    reject on resolution failure (fail closed). Skipped only for IP
    //    literals, which were already range-checked above.
    if (await resolvesToPrivateOrLoopback(parsed.hostname)) {
      throw new Error(
        `Refusing to open "${parsed.hostname}" — it resolves to a ` +
          "private/loopback/link-local address (or could not be resolved). " +
          "Set allow_private_hosts=true (or GAL_CHROME_MCP_ALLOW_PRIVATE_HOSTS=1) to override.",
      );
    }
  }

  return parsed.toString();
}

/**
 * Install a network-layer guard on the context. This closes the redirect-hop
 * (finding f) and DNS-rebinding (finding e) bypasses.
 *
 * The naive approach — abort on a private host inside context.route and
 * route.continue() otherwise — is BYPASSABLE: when a request is continued,
 * Chromium follows any 3xx redirect NATIVELY, and the redirected request does
 * NOT re-enter the context.route interceptor. So a public URL that 302s to
 * http://169.254.169.254/ reaches the metadata service before the guard ever
 * sees the redirect target. Likewise the guard only ever saw the literal URL
 * hostname, never the connected IP, so DNS rebinding (public A record at
 * check-time, private at fetch-time) walked straight through.
 *
 * Hardened design: when enforcing, the guard does NOT call route.continue().
 * Instead it walks the redirect chain itself with route.fetch({ maxRedirects:
 * 0 }) — fetching ONE hop at a time, reading the Location header, and
 * re-validating every hop's host BEFORE issuing the next fetch. Any
 * private/loopback/link-local hop is aborted at the network layer before the
 * internal service is contacted. Because redirects are never auto-followed
 * there is no native-redirect escape.
 *
 * DNS-rebinding pin: each hop is run through resolveAndPinTarget, which
 * resolves the hostname ONCE, rejects private/unresolvable/ambiguous answers,
 * and — for http — issues the fetch against the resolved LITERAL IP while
 * preserving the original Host header. This removes the time-of-check /
 * time-of-use gap: previously the guard validated a hostname and then handed
 * the SAME hostname to route.fetch, which performed its OWN independent
 * connect-time DNS resolution, so an attacker with a low-TTL record could
 * answer the validation lookup with a public IP and the connect lookup with a
 * private one (e.g. 169.254.169.254). By fetching the pinned IP the request
 * actually issued IS the address that was validated. For https the hostname is
 * kept (rewriting to an IP would break TLS SNI / certificate verification);
 * that path is covered by single-record + no-private validation and by the
 * browser's own TLS verification, which a rebound internal IP cannot satisfy
 * for the public name.
 *
 * The guard is installed once per context and always intercepts. Whether it
 * enforces is governed by a per-context mutable `enforce` flag set by each
 * navigation call to reflect that call's allow_private_hosts policy, so a
 * later call cannot be silently exempted by an earlier launch's policy. The
 * flag DEFAULTS to enforcing (on:true) and is only relaxed when a call
 * explicitly opts in — i.e. it fails closed if no policy has been applied.
 */
const ssrfGuardEnforce = new WeakMap<BrowserContext, { on: boolean }>();

// Bound the manually-followed redirect chain to avoid loops / resource abuse.
const MAX_REDIRECT_HOPS = 20;

async function ensureSsrfRouteGuard(
  context: BrowserContext,
): Promise<{ on: boolean }> {
  const existing = ssrfGuardEnforce.get(context);
  if (existing) {
    return existing;
  }
  // Fail closed: enforce until a call explicitly opts out.
  const flag = { on: true };
  ssrfGuardEnforce.set(context, flag);

  await context.route("**/*", async (route) => {
    if (!flag.on) {
      await route.continue();
      return;
    }

    const request = route.request();

    try {
      // 1. Resolve-and-pin the request's own host first (covers literal private
      //    hosts and subresources). resolveAndPinTarget fails closed on
      //    unparseable / non-http(s) / private / unresolvable / ambiguous, and
      //    returns the pinned IP (http) + Host header to issue.
      let pin = await resolveAndPinTarget(request.url());
      if (!pin.allowed) {
        await route.abort("blockedbyclient");
        return;
      }

      // 2. Walk the redirect chain manually so 3xx targets are RE-validated and
      //    RE-pinned instead of being followed natively by Chromium (the
      //    redirect-hop bypass). maxRedirects:0 means route.fetch returns the
      //    3xx response itself; we read Location, pin it, then fetch the next.
      let response = await route.fetch({
        url: pin.fetchUrl,
        headers: { ...request.headers(), host: pin.hostHeader },
        maxRedirects: 0,
      });

      for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop += 1) {
        const status = response.status();
        if (status < 300 || status > 399) {
          break;
        }
        const location = response.headers()["location"];
        if (!location) {
          // 3xx with no Location — nothing to follow; serve as-is.
          break;
        }
        // Resolve relative redirects against the previous hop's Host (the real
        // hostname, not the pinned IP) so relative Location values are correct.
        let nextUrl: string;
        try {
          nextUrl = new URL(
            location,
            `${new URL(pin.fetchUrl).protocol}//${pin.hostHeader}`,
          ).toString();
        } catch {
          await route.abort("blockedbyclient");
          return;
        }
        // Re-resolve-and-pin the redirect target (scheme + literal host + DNS
        // + IP pin). Rebinding cannot slip through a redirect hop either.
        pin = await resolveAndPinTarget(nextUrl);
        if (!pin.allowed) {
          await route.abort("blockedbyclient");
          return;
        }
        response = await route.fetch({
          url: pin.fetchUrl,
          headers: { ...request.headers(), host: pin.hostHeader },
          maxRedirects: 0,
        });
      }

      await route.fulfill({ response });
    } catch {
      // Any network/fetch error — fail closed.
      await route.abort("blockedbyclient");
    }
  });

  return flag;
}

/**
 * Apply the SSRF route guard for a single navigation, setting its enforce
 * flag from the call's `allow_private_hosts` policy.
 */
async function applySsrfPolicy(
  context: BrowserContext,
  args: Record<string, unknown>,
): Promise<void> {
  const flag = await ensureSsrfRouteGuard(context);
  flag.on = !privateHostsAllowed(args);
}

/**
 * Validate a cookie domain is a concrete registrable host, not a bare
 * eTLD or a leading-dot wildcard like ".com". Returns the host (without
 * a leading dot) suitable for scoping the cookie to a specific origin.
 */
function assertConcreteCookieDomain(rawDomain: string): string {
  const domain = rawDomain.trim().toLowerCase().replace(/^\./, "");

  if (domain.length === 0) {
    throw new Error("cookie_domain must be a concrete host, not empty.");
  }

  // Reject I's that look like raw eTLDs / wildcards.
  if (domain.includes("*")) {
    throw new Error(`cookie_domain must not contain wildcards: "${rawDomain}"`);
  }

  const labels = domain.split(".");
  if (labels.length < 2) {
    throw new Error(
      `cookie_domain "${rawDomain}" is not a concrete registrable host ` +
        '(e.g. use "app.example.com", not a bare TLD like ".com").',
    );
  }

  for (const label of labels) {
    if (!/^[a-z0-9-]+$/.test(label) || label.length === 0) {
      throw new Error(
        `cookie_domain "${rawDomain}" contains an invalid label.`,
      );
    }
  }

  return domain;
}

async function loadPlaywright() {
  return await import("playwright");
}

function buildBrowserChannelAttempts(
  explicitChannel?: string,
): Array<string | undefined> {
  if (explicitChannel) {
    return [explicitChannel];
  }

  return [undefined, "chrome"];
}

async function resolveExtensionId(
  context: BrowserContext,
  timeoutMs = 30_000,
): Promise<string> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const workers = context.serviceWorkers();
    if (workers.length > 0) {
      const match = workers[0]
        .url()
        .match(/chrome-extension:\/\/([a-z]{32})\//);
      if (match) {
        return match[1];
      }
    }

    const remainingMs = timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      break;
    }

    try {
      const worker = await context.waitForEvent("serviceworker", {
        timeout: Math.min(1_000, remainingMs),
      });
      const match = worker.url().match(/chrome-extension:\/\/([a-z]{32})\//);
      if (match) {
        return match[1];
      }
    } catch {
      // Best-effort wait; loop will retry and then fall back to chrome://extensions.
    }

    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }

  const page = await context.newPage();
  try {
    await page.goto("chrome://extensions");
    await page.waitForLoadState("domcontentloaded");

    const extensionId = await page.evaluate(() => {
      const manager = document.querySelector("extensions-manager");
      if (!manager) return null;

      const root = (manager as HTMLElement & { shadowRoot?: ShadowRoot })
        .shadowRoot;
      if (!root) return null;

      const items = root.querySelectorAll("extensions-item");
      for (const item of items) {
        const itemRoot = (item as HTMLElement & { shadowRoot?: ShadowRoot })
          .shadowRoot;
        const idNode = itemRoot?.querySelector("#extension-id");
        const idText = idNode?.textContent?.trim() ?? "";
        const match = idText.match(/[a-z]{32}/);
        if (match) {
          return match[0];
        }
      }

      return null;
    });

    if (extensionId) {
      return extensionId;
    }
  } finally {
    await page.close();
  }

  throw new Error("Timed out while resolving the Chrome extension id.");
}

export function createChromeExtensionGalServer(
  config: ChromeExtensionGalServerConfig = {},
): Server {
  const projectPath = config.projectPath ?? process.cwd();
  let session: ChromeExtensionSession | null = null;

  async function getSession(): Promise<ChromeExtensionSession> {
    if (!session) {
      throw new Error(
        "No active Chrome extension session. Call chrome_extension_launch first.",
      );
    }
    return session;
  }

  async function closeSession(): Promise<void> {
    if (!session) {
      return;
    }

    try {
      await session.context.close();
    } finally {
      session = null;
    }
  }

  async function getTargetPage(
    target: "popup" | "page" | undefined,
  ): Promise<Page> {
    const activeSession = await getSession();
    if (target === "popup" || (!target && activeSession.popupPage)) {
      if (!activeSession.popupPage) {
        throw new Error(
          "No popup page is open. Call chrome_extension_open_popup first.",
        );
      }
      return activeSession.popupPage;
    }

    if (!activeSession.currentPage) {
      throw new Error(
        "No active browser page is open. Call chrome_extension_open_url first.",
      );
    }

    return activeSession.currentPage;
  }

  const server = new Server(
    {
      name: "chrome-extension-gal",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [...CHROME_EXTENSION_GAL_TOOLS],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const safeArgs = (request.params.arguments ?? {}) as Record<
      string,
      unknown
    >;

    try {
      switch (request.params.name) {
        case "chrome_extension_launch": {
          await closeSession();

          const extensionPath =
            typeof safeArgs.extension_path === "string" &&
            safeArgs.extension_path.length > 0
              ? resolve(safeArgs.extension_path)
              : resolve(projectPath, "packages/extensions/chrome/dist");

          if (!existsSync(extensionPath)) {
            throw new Error(
              `Chrome extension build not found at ${extensionPath}. Build the extension first (packages/extensions/chrome).`,
            );
          }

          const userDataDir =
            typeof safeArgs.user_data_dir === "string" &&
            safeArgs.user_data_dir.length > 0
              ? resolve(safeArgs.user_data_dir)
              : join(tmpdir(), `gal-chrome-extension-gal-${Date.now()}`);
          const browserChannel =
            typeof safeArgs.browser_channel === "string" &&
            safeArgs.browser_channel.length > 0
              ? safeArgs.browser_channel
              : undefined;
          const headless = safeArgs.headless !== false;
          const { chromium } = await loadPlaywright();

          const launchArgs = [
            `--disable-extensions-except=${extensionPath}`,
            `--load-extension=${extensionPath}`,
            ...(headless ? ["--headless=new"] : []),
          ];
          const errors: string[] = [];

          for (const channel of buildBrowserChannelAttempts(browserChannel)) {
            let context: BrowserContext | null = null;

            try {
              context = await chromium.launchPersistentContext(userDataDir, {
                // Keep Playwright in headed mode and let Chrome's own headless=new
                // flag handle headless execution so extensions and service workers
                // initialize like they do in the extension E2E harness.
                headless: false,
                ...(channel ? { channel } : {}),
                args: launchArgs,
              });
              // Network-layer SSRF guard: aborts any request (incl. 30x
              // redirect hops) to a private/loopback/link-local host unless
              // private hosts are explicitly allowed for this call.
              await applySsrfPolicy(context, safeArgs);
              let currentPage: Page | null = null;
              const startUrl =
                typeof safeArgs.start_url === "string" &&
                safeArgs.start_url.length > 0
                  ? await assertNavigableUrl(safeArgs.start_url, safeArgs)
                  : null;

              if (startUrl) {
                currentPage = await context.newPage();
                await currentPage.goto(startUrl, {
                  waitUntil: "domcontentloaded",
                });
              }

              if (
                typeof safeArgs.gal_session_token === "string" &&
                safeArgs.gal_session_token.length > 0
              ) {
                if (
                  typeof safeArgs.cookie_domain !== "string" ||
                  safeArgs.cookie_domain.length === 0
                ) {
                  throw new Error(
                    "cookie_domain is required when gal_session_token is provided (e.g. app.example.com)",
                  );
                }

                const cookieHost = assertConcreteCookieDomain(
                  safeArgs.cookie_domain,
                );

                // Require start_url so the cookie is ALWAYS scoped to a concrete
                // origin (host-only) rather than a context-level `domain` cookie.
                // A bare public suffix like "co.uk" would otherwise pass the
                // label check and broadcast the credential to every subdomain
                // under that suffix; host-only url-scoping closes that path.
                if (!startUrl) {
                  throw new Error(
                    "start_url is required when gal_session_token is provided so the " +
                      "session cookie can be host-scoped to a concrete origin (it must " +
                      `match cookie_domain "${cookieHost}").`,
                  );
                }

                // Bind the credential to the start_url origin and reject a
                // cookie_domain that does not match that host, so a token can
                // never be planted on an unrelated host.
                const startHost = new URL(startUrl).hostname.toLowerCase();
                if (startHost !== cookieHost) {
                  throw new Error(
                    `cookie_domain "${cookieHost}" does not match the start_url host ` +
                      `"${startHost}". They must be the same concrete host.`,
                  );
                }

                await context.addCookies([
                  {
                    name: "gal_session",
                    value: safeArgs.gal_session_token,
                    url: startUrl,
                    httpOnly: true,
                    secure: true,
                    sameSite: "Lax",
                  },
                ]);

                if (currentPage) {
                  await currentPage.goto(startUrl, {
                    waitUntil: "domcontentloaded",
                  });
                }
              }
              const extensionId = await resolveExtensionId(context);

              session = {
                context,
                extensionId,
                extensionPath,
                popupPage: null,
                currentPage,
                userDataDir,
              };

              return toJsonContent({
                success: true,
                extension_id: extensionId,
                extension_path: extensionPath,
                user_data_dir: userDataDir,
                channel: channel ?? "default",
              });
            } catch (error: unknown) {
              errors.push(
                `${channel ?? "default"}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
              if (context) {
                await context.close().catch(() => undefined);
              }
            }
          }

          throw new Error(
            `Failed to launch chrome-extension-gal. Attempts: ${errors.join(" | ")}`,
          );
        }

        case "chrome_extension_open_popup": {
          const activeSession = await getSession();
          const popupPage = await activeSession.context.newPage();
          await popupPage.goto(
            `chrome-extension://${activeSession.extensionId}/popup.html`,
            {
              waitUntil: "domcontentloaded",
            },
          );
          await popupPage.waitForTimeout(1_000);
          activeSession.popupPage = popupPage;

          return toJsonContent({
            success: true,
            extension_id: activeSession.extensionId,
            url: popupPage.url(),
          });
        }

        case "chrome_extension_open_url": {
          const activeSession = await getSession();
          const url = typeof safeArgs.url === "string" ? safeArgs.url : "";
          if (!url) {
            throw new Error("url is required");
          }

          const navigableUrl = await assertNavigableUrl(url, safeArgs);
          // Ensure the redirect-hop network guard is active and reflects this
          // call's allow_private_hosts policy (idempotent install).
          await applySsrfPolicy(activeSession.context, safeArgs);
          const page = await activeSession.context.newPage();
          await page.goto(navigableUrl, { waitUntil: "domcontentloaded" });
          activeSession.currentPage = page;

          return toJsonContent({
            success: true,
            url: page.url(),
          });
        }

        case "chrome_extension_get_popup_text": {
          const page = await getTargetPage("popup");
          for (let attempt = 0; attempt < 5; attempt++) {
            const text = await page.locator("body").innerText();
            if (text.trim().length > 0) {
              return {
                content: [
                  {
                    type: "text",
                    text,
                  },
                ],
              };
            }

            await page.waitForTimeout(500);
          }

          return {
            content: [
              {
                type: "text",
                text: await page.locator("body").innerText(),
              },
            ],
          };
        }

        case "chrome_extension_click_popup_text": {
          const page = await getTargetPage("popup");
          const text = typeof safeArgs.text === "string" ? safeArgs.text : "";
          if (!text) {
            throw new Error("text is required");
          }

          await page
            .getByText(text, { exact: safeArgs.exact === true })
            .first()
            .click();

          return toJsonContent({ success: true, text });
        }

        case "chrome_extension_get_page_text": {
          const page = await getTargetPage("page");
          const text =
            typeof safeArgs.selector === "string" &&
            safeArgs.selector.length > 0
              ? await page.locator(safeArgs.selector).first().innerText()
              : await (async () => {
                  for (let attempt = 0; attempt < 5; attempt += 1) {
                    const bodyText = await page.locator("body").innerText();
                    if (bodyText.trim().length > 0) {
                      return bodyText;
                    }
                    await page.waitForTimeout(500);
                  }

                  return await page.locator("body").innerText();
                })();

          return {
            content: [
              {
                type: "text",
                text,
              },
            ],
          };
        }

        case "chrome_extension_screenshot": {
          const target =
            typeof safeArgs.target === "string" &&
            (safeArgs.target === "popup" || safeArgs.target === "page")
              ? (safeArgs.target as "popup" | "page")
              : undefined;
          const page = await getTargetPage(target);
          const buffer = await page.screenshot({ type: "png" });

          return {
            content: [
              {
                type: "image",
                data: buffer.toString("base64"),
                mimeType: "image/png",
              },
            ],
          };
        }

        case "chrome_extension_state": {
          const activeSession = await getSession();
          return toJsonContent({
            extension_id: activeSession.extensionId,
            extension_path: activeSession.extensionPath,
            popup_url: activeSession.popupPage?.url() ?? null,
            page_url: activeSession.currentPage?.url() ?? null,
            user_data_dir: activeSession.userDataDir,
          });
        }

        case "chrome_extension_highlight_tab": {
          const activeSession = await getSession();
          const page = activeSession.currentPage;
          if (!page)
            return toJsonContent({ error: "No active page to highlight" });
          const color = (request.params.arguments?.color as string) || "orange";
          const label =
            (request.params.arguments?.label as string) || "Automated";
          // Try extension background for chrome.tabGroups API
          const bgPages = activeSession.context.backgroundPages();
          if (bgPages.length > 0) {
            for (const bp of bgPages) {
              try {
                await bp.evaluate(
                  ([c, l]) => {
                    const api = (window as any).chrome;
                    if (api?.runtime?.sendMessage) {
                      api.runtime.sendMessage({
                        action: "highlight_tab",
                        color: c,
                        label: l,
                      });
                    }
                  },
                  [color, label],
                );
                return toJsonContent({
                  highlighted: true,
                  method: "tabGroups",
                  color,
                  label,
                });
              } catch {
                /* try next bg page */
              }
            }
          }
          // Fallback: CSS overlay injection
          await page.evaluate(
            ([c, l]) => {
              const remove = () => {
                const e = document.getElementById("gal-chrome-overlay");
                if (e) e.remove();
              };
              remove();
              const overlay = document.createElement("div");
              overlay.id = "gal-chrome-overlay";
              overlay.style.cssText = `position:fixed;top:0;left:0;right:0;bottom:0;border:3px solid ${c};pointer-events:none;z-index:2147483647;box-sizing:border-box;`;
              const pill = document.createElement("div");
              pill.textContent = l;
              pill.style.cssText = `position:fixed;top:8px;right:8px;background:${c};color:#fff;padding:4px 12px;border-radius:12px;font:12px system-ui;pointer-events:none;z-index:2147483647;`;
              overlay.appendChild(pill);
              document.body.appendChild(overlay);
            },
            [color, label],
          );
          return toJsonContent({
            highlighted: true,
            method: "css",
            color,
            label,
          });
        }

        case "chrome_extension_clear_highlight": {
          const activeSession = await getSession();
          const bgPages = activeSession.context.backgroundPages?.() ?? [];
          for (const bp of bgPages) {
            try {
              await bp.evaluate(() => {
                const api = (window as any).chrome;
                if (api?.runtime?.sendMessage) {
                  api.runtime.sendMessage({ action: "clear_highlight" });
                }
              });
            } catch {}
          }
          const page = activeSession.currentPage;
          if (page) {
            await page.evaluate(() => {
              const e = document.getElementById("gal-chrome-overlay");
              if (e) e.remove();
            });
          }
          return toJsonContent({ cleared: true });
        }

        case "chrome_extension_close": {
          await closeSession();
          return toJsonContent({ success: true });
        }

        case "chrome_extension_tabGroups_create": {
          const activeSession = await getSession();
          const tabIds = Array.isArray(safeArgs.tabIds)
            ? (safeArgs.tabIds as number[])
            : [];
          if (tabIds.length === 0) {
            throw new Error("tabIds is required and must be a non-empty array");
          }
          const title =
            typeof safeArgs.title === "string" ? safeArgs.title : undefined;
          const color =
            typeof safeArgs.color === "string" ? safeArgs.color : undefined;

          const bgPages = activeSession.context.serviceWorkers();
          let result: { groupId?: number } = {};
          let success = false;

          for (const bp of bgPages) {
            try {
              const groupResult = await bp.evaluate(
                async ([ids, t, c]) => {
                  const api = (globalThis as any).chrome || (self as any).chrome;
                  if (!api?.tabs?.group) return null;
                  const groupId = await api.tabs.group({ tabIds: ids });
                  if (t || c) {
                    await api.tabGroups.update(groupId, {
                      ...(t ? { title: t } : {}),
                      ...(c ? { color: c } : {}),
                      collapsed: false,
                    });
                  }
                  return { groupId };
                },
                [tabIds, title, color] as const,
              );
              if (groupResult) {
                result = groupResult;
                success = true;
                break;
              }
            } catch {
              /* try next bg page */
            }
          }

          if (!success) {
            throw new Error(
              "tabGroups_create failed: Chrome extension APIs unavailable.",
            );
          }

          return toJsonContent({
            success: true,
            groupId: result.groupId,
            title,
            color,
          });
        }

        case "chrome_extension_tabGroups_list": {
          const activeSession = await getSession();
          const bgPages = activeSession.context.serviceWorkers();
          let groups: unknown[] = [];
          let success = false;

          for (const bp of bgPages) {
            try {
              const listResult = await bp.evaluate(async () => {
                const api = (globalThis as any).chrome || (self as any).chrome;
                if (!api?.tabGroups?.query) return null;
                return await api.tabGroups.query({});
              });
              if (listResult) {
                groups = listResult as unknown[];
                success = true;
                break;
              }
            } catch {
              /* try next bg page */
            }
          }

          if (!success) {
            throw new Error(
              "tabGroups_list failed: Chrome extension APIs unavailable.",
            );
          }

          return toJsonContent({ success: true, groups });
        }

        case "chrome_extension_tabs_query": {
          const activeSession = await getSession();
          const query: Record<string, unknown> = {};
          if (typeof safeArgs.active === "boolean")
            query.active = safeArgs.active;
          if (typeof safeArgs.currentWindow === "boolean")
            query.currentWindow = safeArgs.currentWindow;
          if (typeof safeArgs.url === "string") query.url = safeArgs.url;

          const bgPages = activeSession.context.serviceWorkers();
          let tabs: unknown[] = [];
          let success = false;

          for (const bp of bgPages) {
            try {
              const queryResult = await bp.evaluate(async (q) => {
                const api = (globalThis as any).chrome || (self as any).chrome;
                if (!api?.tabs?.query) return null;
                return await api.tabs.query(q);
              }, query);
              if (queryResult) {
                tabs = queryResult as unknown[];
                success = true;
                break;
              }
            } catch {
              /* try next bg page */
            }
          }

          if (!success) {
            throw new Error(
              "tabs_query failed: Chrome extension APIs unavailable.",
            );
          }

          return toJsonContent({ success: true, tabs });
        }

        case "chrome_extension_tabs_create": {
          const activeSession = await getSession();
          const url = typeof safeArgs.url === "string" ? safeArgs.url : "";
          if (!url) throw new Error("url is required");
          const active = safeArgs.active !== false;

          const bgPages = activeSession.context.serviceWorkers();
          let tab: unknown = null;
          let success = false;

          for (const bp of bgPages) {
            try {
              const createResult = await bp.evaluate(
                async ([u, a]) => {
                  const api = (globalThis as any).chrome || (self as any).chrome;
                  if (!api?.tabs?.create) return null;
                  return await api.tabs.create({ url: u, active: a });
                },
                [url, active] as const,
              );
              if (createResult) {
                tab = createResult;
                success = true;
                break;
              }
            } catch {
              /* try next bg page */
            }
          }

          if (!success) {
            // Fallback: open via Playwright page. Route through the same SSRF
            // validation + network guard the rest of the server enforces.
            const navigableUrl = await assertNavigableUrl(url, safeArgs);
            await applySsrfPolicy(activeSession.context, safeArgs);
            const newPage = await activeSession.context.newPage();
            await newPage.goto(navigableUrl, { waitUntil: "domcontentloaded" });
            activeSession.currentPage = newPage;
            tab = { id: null, url: newPage.url(), active: true };
          }

          return toJsonContent({ success: true, tab });
        }

        case "chrome_extension_tabs_remove": {
          const activeSession = await getSession();
          const tabIds = Array.isArray(safeArgs.tabIds)
            ? (safeArgs.tabIds as number[])
            : [];
          if (tabIds.length === 0) {
            throw new Error("tabIds is required and must be a non-empty array");
          }

          const bgPages = activeSession.context.serviceWorkers();
          let success = false;

          for (const bp of bgPages) {
            try {
              await bp.evaluate(async (ids) => {
                const api = (globalThis as any).chrome || (self as any).chrome;
                if (!api?.tabs?.remove) return false;
                await api.tabs.remove(ids);
                return true;
              }, tabIds);
              success = true;
              break;
            } catch {
              /* try next bg page */
            }
          }

          if (!success) {
            throw new Error(
              "tabs_remove failed: Chrome extension APIs unavailable.",
            );
          }

          return toJsonContent({ success: true, removed: tabIds });
        }

        case "chrome_extension_bookmarks_search": {
          const activeSession = await getSession();
          const query =
            typeof safeArgs.query === "string" ? safeArgs.query : "";
          if (!query) throw new Error("query is required");

          const bgPages = activeSession.context.serviceWorkers();
          let results: unknown[] = [];
          let success = false;

          for (const bp of bgPages) {
            try {
              const searchResult = await bp.evaluate(async (q) => {
                const api = (globalThis as any).chrome || (self as any).chrome;
                if (!api?.bookmarks?.search) return null;
                return await api.bookmarks.search(q);
              }, query);
              if (searchResult) {
                results = searchResult as unknown[];
                success = true;
                break;
              }
            } catch {
              /* try next bg page */
            }
          }

          if (!success) {
            throw new Error(
              "bookmarks_search failed: Chrome extension APIs unavailable.",
            );
          }

          return toJsonContent({ success: true, results });
        }

        case "chrome_extension_history_search": {
          const activeSession = await getSession();
          const text = typeof safeArgs.text === "string" ? safeArgs.text : "";
          if (!text) throw new Error("text is required");
          const maxResults =
            typeof safeArgs.maxResults === "number" ? safeArgs.maxResults : 100;

          const bgPages = activeSession.context.serviceWorkers();
          let results: unknown[] = [];
          let success = false;

          for (const bp of bgPages) {
            try {
              const searchResult = await bp.evaluate(
                async ([t, m]) => {
                  const api = (globalThis as any).chrome || (self as any).chrome;
                  if (!api?.history?.search) return null;
                  return await api.history.search({
                    text: t,
                    maxResults: m,
                  });
                },
                [text, maxResults] as const,
              );
              if (searchResult) {
                results = searchResult as unknown[];
                success = true;
                break;
              }
            } catch {
              /* try next bg page */
            }
          }

          if (!success) {
            throw new Error(
              "history_search failed: Chrome extension APIs unavailable.",
            );
          }

          return toJsonContent({ success: true, results });
        }

        case "chrome_extension_windows_create": {
          const activeSession = await getSession();
          const url =
            typeof safeArgs.url === "string" ? safeArgs.url : undefined;
          const type =
            typeof safeArgs.type === "string" ? safeArgs.type : undefined;

          const bgPages = activeSession.context.serviceWorkers();
          let win: unknown = null;
          let success = false;

          for (const bp of bgPages) {
            try {
              const createResult = await bp.evaluate(
                async ([u, t]) => {
                  const api = (globalThis as any).chrome || (self as any).chrome;
                  if (!api?.windows?.create) return null;
                  const opts: Record<string, unknown> = {};
                  if (u) opts.url = u;
                  if (t) opts.type = t;
                  return await api.windows.create(opts);
                },
                [url, type] as const,
              );
              if (createResult) {
                win = createResult;
                success = true;
                break;
              }
            } catch {
              /* try next bg page */
            }
          }

          if (!success) {
            // Fallback: open via Playwright context new page. Route any URL
            // through the same SSRF validation + network guard.
            const newPage = await activeSession.context.newPage();
            if (url) {
              const navigableUrl = await assertNavigableUrl(url, safeArgs);
              await applySsrfPolicy(activeSession.context, safeArgs);
              await newPage.goto(navigableUrl, {
                waitUntil: "domcontentloaded",
              });
            }
            activeSession.currentPage = newPage;
            win = { id: null, tabs: [{ url: newPage.url() }] };
          }

          return toJsonContent({ success: true, window: win });
        }

        case "chrome_extension_agent_run": {
          const task = typeof safeArgs.task === "string" ? safeArgs.task : "";
          if (!task) throw new Error("task is required");
          const startUrl =
            typeof safeArgs.start_url === "string"
              ? safeArgs.start_url
              : undefined;
          const maxSteps =
            typeof safeArgs.max_steps === "number" ? safeArgs.max_steps : 50;

          const payload: Record<string, unknown> = {
            task,
            max_steps: maxSteps,
          };
          if (startUrl) payload.start_url = startUrl;

          const serviceUrl = browserUseServiceUrl();
          let response: Response;
          try {
            response = await fetch(`${serviceUrl}/agent/run`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          } catch (fetchErr: unknown) {
            throw new Error(
              `agent_run failed to connect to ${serviceUrl}: ${
                fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
              }`,
            );
          }

          if (!response.ok) {
            throw new Error(
              `agent_run service returned ${response.status}: ${await response.text()}`,
            );
          }

          const data = await response.json();
          return toJsonContent({ success: true, ...data });
        }

        case "chrome_extension_enhanced_parse": {
          const url = typeof safeArgs.url === "string" ? safeArgs.url : "";
          if (!url) throw new Error("url is required");

          const serviceUrl = browserUseServiceUrl();
          let response: Response;
          try {
            response = await fetch(`${serviceUrl}/dom/enhanced-parse`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ url }),
            });
          } catch (fetchErr: unknown) {
            throw new Error(
              `enhanced_parse failed to connect to ${serviceUrl}: ${
                fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
              }`,
            );
          }

          if (!response.ok) {
            throw new Error(
              `enhanced_parse service returned ${response.status}: ${await response.text()}`,
            );
          }

          const data = await response.json();
          return toJsonContent({ success: true, ...data });
        }

        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    } catch (error: unknown) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          },
        ],
        isError: true,
      };
    }
  });

  process.once("exit", () => {
    if (session) {
      void session.context.close().catch(() => undefined);
      session = null;
    }
  });

  return server;
}

export async function startChromeExtensionGalServer(
  config: ChromeExtensionGalServerConfig = {},
): Promise<void> {
  process.stderr.write("[gal-chrome-mcp] Starting MCP server v0.1.0\n");
  const server = createChromeExtensionGalServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("[gal-chrome-mcp] MCP server connected and ready\n");
}
