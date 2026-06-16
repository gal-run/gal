import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GalApiClient } from "./api-client.js";
import { registerTools } from "./tools.js";
import { setActiveWorkspace } from "./workspace-context.js";

const SERVER_NAME = "gal-session";
const SERVER_VERSION = "0.1.0";
const DEFAULT_GAL_API_URL = "https://api.gal.run";

function readGalConfig(): Record<string, unknown> | null {
  try {
    const configPath = join(
      process.env.GAL_HOME || join(homedir(), ".gal"),
      "config.json",
    );
    const raw = readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function resolveAuthToken(): string | null {
  const envToken = process.env.GAL_AUTH_TOKEN;
  if (envToken) {
    return envToken;
  }

  const config = readGalConfig();
  if (config) {
    if (typeof config.authToken === "string" && config.authToken.length > 0) {
      return config.authToken;
    }
    if (typeof config.token === "string" && config.token.length > 0) {
      return config.token;
    }
  }

  return null;
}

function resolveApiUrl(): string {
  const envUrl = process.env.GAL_API_URL;
  if (envUrl) {
    return envUrl;
  }

  const config = readGalConfig();
  if (config && typeof config.apiUrl === "string" && config.apiUrl.length > 0) {
    return config.apiUrl;
  }

  return DEFAULT_GAL_API_URL;
}

export async function startGalMcpServer(): Promise<void> {
  const config = readGalConfig();
  const authToken = resolveAuthToken();
  if (!authToken) {
    process.stderr.write(
      "[gal-session] ERROR: No auth token found. Set GAL_AUTH_TOKEN env var or configure ~/.gal/config.json\n",
    );
    process.exit(1);
  }

  const apiUrl = resolveApiUrl();
  const apiClient = new GalApiClient(apiUrl, authToken);
  if (typeof config?.defaultOrg === "string" && config.defaultOrg.length > 0) {
    setActiveWorkspace(config.defaultOrg);
    process.stderr.write(
      `[gal-session] Default workspace: ${config.defaultOrg}\n`,
    );
  }

  process.stderr.write(
    `[gal-session] Starting MCP server v${SERVER_VERSION}\n`,
  );
  process.stderr.write(`[gal-session] API: ${apiUrl}\n`);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  let isInternal = false;

  try {
    const meResponse = (await apiClient.getMe()) as {
      user?: {
        capabilities?: { backgroundAgents?: boolean };
        isInternal?: boolean;
      };
    };
    if (meResponse?.user?.capabilities?.backgroundAgents) {
      isInternal = true;
      process.stderr.write(
        "[gal-session] Background agent tools enabled via API capabilities (org audienceTier).\n",
      );
    } else if (meResponse?.user?.isInternal) {
      isInternal = true;
      process.stderr.write(
        "[gal-session] Background agent tools enabled via API isInternal flag.\n",
      );
    }
  } catch {
    // API call failed (offline, token expired, etc.) — fall back to cached config.
  }

  if (!isInternal) {
    try {
      if (config) {
        const capabilities = config.capabilities as
          | { backgroundAgents?: boolean }
          | undefined;
        const capCacheAge =
          Date.now() - ((config.capabilitiesCachedAt as number) || 0);
        const cacheMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
        if (capabilities?.backgroundAgents && capCacheAge < cacheMaxAgeMs) {
          isInternal = true;
          process.stderr.write(
            "[gal-session] Background agent tools enabled via cached API capabilities.\n",
          );
        }
      }
    } catch {
      // Silently ignore.
    }
  }

  if (!isInternal) {
    try {
      const cacheMaxAgeMs = 7 * 24 * 60 * 60 * 1000;
      if (config) {
        const cacheAge =
          Date.now() -
          ((config.flagsCachedAt as number) ||
            (config.internalOrgsCheckedAt as number) ||
            0);
        if (cacheAge < cacheMaxAgeMs) {
          const userOrgs = (config.orgMemberships as string[]) || [];
          const orgAudienceTierMap =
            (config.orgAudienceTierMap as Record<string, string | null>) || {};
          if (
            userOrgs.length > 0 &&
            Object.keys(orgAudienceTierMap).length > 0
          ) {
            isInternal = userOrgs.some(
              (org: string) =>
                orgAudienceTierMap[org] === "internal" ||
                orgAudienceTierMap[org.toLowerCase()] === "internal",
            );
            if (isInternal) {
              process.stderr.write(
                "[gal-session] Background agent tools enabled via cached org audienceTier.\n",
              );
            }
          }

          if (!isInternal && userOrgs.length > 0) {
            const internalOrgs = (config.internalOrgs as string[]) || [];
            if (internalOrgs.length > 0) {
              const normalizedInternal = new Set(
                internalOrgs.map((org: string) => org.toLowerCase()),
              );
              isInternal = userOrgs.some((org: string) =>
                normalizedInternal.has(org.toLowerCase()),
              );
              if (isInternal) {
                process.stderr.write(
                  "[gal-session] Background agent tools enabled via cached internalOrgs (legacy).\n",
                );
              }
            }
          }
        }
      }
    } catch {
      // Silently ignore — offline or no config.
    }
  }

  if (!isInternal) {
    process.stderr.write(
      "[gal-session] Background agent tools are disabled.\n" +
        "[gal-session] Your org does not have internal audienceTier.\n" +
        "[gal-session] Run: gal auth login (to refresh org membership cache).\n",
    );
  }

  registerTools(server, apiClient, {
    internalOnly: isInternal,
    swarmOnly: isInternal,
  });

  // Keep alive after transport disconnect so the server survives
  // transient pipe breaks from the parent GAL Code process.
  const keepAlive = setInterval(() => {}, 60_000);
  process.on("SIGTERM", () => clearInterval(keepAlive));
  process.on("SIGINT", () => clearInterval(keepAlive));

  for (;;) {
    const transport = new StdioServerTransport();

    let closed = false;
    transport.onclose = () => {
      closed = true;
      process.stderr.write(
        "[gal-session] MCP transport closed, restarting...\n",
      );
    };
    transport.onerror = (err) => {
      closed = true;
      process.stderr.write(
        `[gal-session] MCP transport error: ${String(err)}, restarting...\n`,
      );
    };

    try {
      await server.connect(transport);
      process.stderr.write("[gal-session] MCP server connected and ready\n");
    } catch (err) {
      process.stderr.write(
        `[gal-session] MCP connect failed: ${String(err)}, retrying in 1s...\n`,
      );
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }

    // Wait until the transport closes
    await new Promise<void>((resolve) => {
      if (closed) return resolve();
      transport.onclose = () => resolve();
    });
  }
}
