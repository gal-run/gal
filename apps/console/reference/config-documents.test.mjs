import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  readProjectConfigDocument,
  readProjectSyncState,
  readWorkspaceConfigDocument,
  readWorkspaceSyncState,
  writeProjectConfigDocument,
  writeProjectSyncState,
  writeWorkspaceConfigDocument,
  writeWorkspaceSyncState,
} from './config-documents.mjs';

test('workspace config documents round-trip as raw YAML text', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'gal-home-'));
  const content = [
    'apiVersion: gal/v1',
    'kind: WorkspaceConfig',
    'metadata:',
    '  id: personal',
    '',
  ].join('\n');

  const written = writeWorkspaceConfigDocument(content, { homeDir });
  assert.equal(written.exists, true);
  assert.equal(written.content, content);

  const readBack = readWorkspaceConfigDocument({ homeDir });
  assert.deepEqual(readBack, written);
});

test('project config documents are stored under <repo>/.gal/config.yaml', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'gal-project-'));
  const content = [
    'apiVersion: gal/v1',
    'kind: ProjectConfig',
    'metadata:',
    '  workspaceRef: scheduler-systems',
    '',
  ].join('\n');

  const written = writeProjectConfigDocument(projectRoot, content);
  assert.equal(written.exists, true);
  assert.equal(written.content, content);
  assert.match(written.path, /\/\.gal\/config\.yaml$/);

  const readBack = readProjectConfigDocument(projectRoot);
  assert.deepEqual(readBack, written);
});

test('workspace sync state round-trips as JSON sidecar data', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'gal-home-'));
  const state = {
    updatedAt: '2026-03-16T10:00:00Z',
    source: 'local',
  };

  const written = writeWorkspaceSyncState(state, { homeDir });
  assert.equal(written.exists, true);
  assert.deepEqual(written.value, state);

  const readBack = readWorkspaceSyncState({ homeDir });
  assert.deepEqual(readBack, written);
});

test('project sync state round-trips as JSON sidecar data', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'gal-project-'));
  const state = {
    updatedAt: '2026-03-16T10:05:00Z',
    hash: 'abc123',
  };

  const written = writeProjectSyncState(projectRoot, state);
  assert.equal(written.exists, true);
  assert.deepEqual(written.value, state);

  const readBack = readProjectSyncState(projectRoot);
  assert.deepEqual(readBack, written);
});

test('missing config documents return a stable null payload', () => {
  const homeDir = mkdtempSync(join(tmpdir(), 'gal-home-'));
  const projectRoot = mkdtempSync(join(tmpdir(), 'gal-project-'));

  assert.deepEqual(readWorkspaceConfigDocument({ homeDir }), {
    path: join(homeDir, '.gal', 'config.yaml'),
    exists: false,
    content: null,
  });

  assert.deepEqual(readProjectSyncState(projectRoot), {
    path: join(projectRoot, '.gal', 'sync-state.json'),
    exists: false,
    value: null,
  });
});
