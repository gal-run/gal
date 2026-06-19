import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  getProjectConfigPath,
  getProjectSyncStatePath,
  getWorkspaceConfigPath,
  getWorkspaceSyncStatePath,
} from './filesystem-helpers.mjs';

function validateTextContent(content, label) {
  if (typeof content !== 'string') {
    throw new TypeError(`${label} must be a string`);
  }

  if (content.includes('\0')) {
    throw new Error(`${label} cannot contain a null byte`);
  }

  return content;
}

function ensureParentDir(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
}

function readTextDocument(filePath) {
  if (!existsSync(filePath)) {
    return {
      path: filePath,
      exists: false,
      content: null,
    };
  }

  return {
    path: filePath,
    exists: true,
    content: readFileSync(filePath, 'utf-8'),
  };
}

function writeTextDocument(filePath, content) {
  ensureParentDir(filePath);
  writeFileSync(filePath, validateTextContent(content, 'Document content'), 'utf-8');
  return readTextDocument(filePath);
}

function readJsonDocument(filePath) {
  if (!existsSync(filePath)) {
    return {
      path: filePath,
      exists: false,
      value: null,
    };
  }

  return {
    path: filePath,
    exists: true,
    value: JSON.parse(readFileSync(filePath, 'utf-8')),
  };
}

function writeJsonDocument(filePath, value) {
  ensureParentDir(filePath);
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
  return readJsonDocument(filePath);
}

export function readWorkspaceConfigDocument(options = {}) {
  return readTextDocument(getWorkspaceConfigPath(options));
}

export function writeWorkspaceConfigDocument(content, options = {}) {
  return writeTextDocument(getWorkspaceConfigPath(options), content);
}

export function readProjectConfigDocument(projectRoot) {
  return readTextDocument(getProjectConfigPath(projectRoot));
}

export function writeProjectConfigDocument(projectRoot, content) {
  return writeTextDocument(getProjectConfigPath(projectRoot), content);
}

export function readWorkspaceSyncState(options = {}) {
  return readJsonDocument(getWorkspaceSyncStatePath(options));
}

export function writeWorkspaceSyncState(value, options = {}) {
  return writeJsonDocument(getWorkspaceSyncStatePath(options), value);
}

export function readProjectSyncState(projectRoot) {
  return readJsonDocument(getProjectSyncStatePath(projectRoot));
}

export function writeProjectSyncState(projectRoot, value) {
  return writeJsonDocument(getProjectSyncStatePath(projectRoot), value);
}
