#!/usr/bin/env node
import { startChromeExtensionGalServer } from './server.js';

startChromeExtensionGalServer().catch((err) => {
  console.error('Fatal error starting chrome-extension-gal server:', err);
  process.exit(1);
});
