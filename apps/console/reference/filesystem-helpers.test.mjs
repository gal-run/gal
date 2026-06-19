import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  findProjectRoot,
  getProjectConfigPath,
  getWorkspaceConfigPath,
  getWorkspaceSyncStatePath,
} from './filesystem-helpers.mjs';

test('workspace helper paths use ~/.gal/config.yaml and ~/.gal/sync-state.json', () => {
  const homeDir = '/tmp/gal-home';
  assert.equal(
    getWorkspaceConfigPath({ homeDir }),
    '/tmp/gal-home/.gal/config.yaml'
  );
  assert.equal(
    getWorkspaceSyncStatePath({ homeDir }),
    '/tmp/gal-home/.gal/sync-state.json'
  );
});

test('findProjectRoot prefers .git markers when scanning upward', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'gal-project-'));
  const nested = join(projectRoot, 'src', 'utils');

  mkdirSync(join(projectRoot, '.git'));
  mkdirSync(nested, { recursive: true });

  assert.equal(findProjectRoot(nested), projectRoot);
  assert.equal(
    getProjectConfigPath(projectRoot),
    join(projectRoot, '.gal', 'config.yaml')
  );
});

test('findProjectRoot falls back to local markers for non-git projects', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'gal-local-project-'));
  const nested = join(projectRoot, 'docs', 'notes');

  mkdirSync(join(projectRoot, '.claude'));
  mkdirSync(nested, { recursive: true });

  assert.equal(findProjectRoot(nested), projectRoot);
});
