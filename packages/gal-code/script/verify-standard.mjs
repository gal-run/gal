#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frameworkRoot =
  process.env.PROMPT_TO_BINARY_FRAMEWORK_ROOT ??
  path.resolve(repoRoot, '../../../GravitonChips/prompt-to-binary');
const verifyScript = path.join(frameworkRoot, 'framework', 'verify.py');

if (!existsSync(verifyScript)) {
  console.error(`Missing framework verifier at ${verifyScript}`);
  process.exit(1);
}

const result = spawnSync(
  'python3',
  [verifyScript, '--root', repoRoot, '--manifest', 'docs/standard.manifest.json'],
  { stdio: 'inherit' },
);

process.exit(result.status ?? 1);
