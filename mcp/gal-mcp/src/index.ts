#!/usr/bin/env node
import { startGalMcpServer } from './server.js';

startGalMcpServer().catch((error) => {
  process.stderr.write(`[gal-session] Fatal error: ${error}\n`);
  process.exit(1);
});
