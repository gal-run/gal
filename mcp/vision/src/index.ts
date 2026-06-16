#!/usr/bin/env node
/**
 * Vision MCP Server
 *
 * Provides vision capabilities using Gemini via Google AI Studio or Vertex AI.
 * Tools: image analysis, OCR, UI analysis, diagram understanding, video analysis.
 *
 * Transport: stdio (JSON-RPC over stdin/stdout)
 * Logging: stderr only (stdout is reserved for MCP transport)
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerVisionTools } from './tools/vision-tools.js';
import { createVisionClient, type VisionClientConfig } from './vision-client.js';

const SERVER_NAME = 'gal-vision';
const SERVER_VERSION = '0.1.0';

function getEnvConfig(): VisionClientConfig {
  const apiKey = process.env.GEMINI_API_KEY;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
  const model = process.env.VISION_MODEL || 'gemini-2.5-flash';

  if (!apiKey && !projectId) {
    process.stderr.write(
      '[gal-vision] ERROR: Set GEMINI_API_KEY (preferred) or GOOGLE_CLOUD_PROJECT\n',
    );
    process.exit(1);
  }

  return { apiKey, projectId, location, model };
}

async function main(): Promise<void> {
  const config = getEnvConfig();

  process.stderr.write(`[gal-vision] Starting MCP server v${SERVER_VERSION}\n`);
  if (config.apiKey) {
    process.stderr.write(`[gal-vision] Auth: Google AI Studio (API key)\n`);
  } else {
    process.stderr.write(`[gal-vision] Auth: Vertex AI (ADC)\n`);
    process.stderr.write(`[gal-vision] Project: ${config.projectId}\n`);
    process.stderr.write(`[gal-vision] Location: ${config.location}\n`);
  }
  process.stderr.write(`[gal-vision] Model: ${config.model}\n`);

  const visionClient = createVisionClient(config);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerVisionTools(server, visionClient);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write('[gal-vision] MCP server connected and ready\n');
}

main().catch((error) => {
  process.stderr.write(`[gal-vision] Fatal error: ${error}\n`);
  process.exit(1);
});
