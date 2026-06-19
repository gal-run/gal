import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, parse, resolve } from 'node:path';

function validatePathString(value, label) {
  if (typeof value !== 'string') {
    throw new TypeError(`${label} must be a string`);
  }

  if (!value.trim()) {
    throw new Error(`${label} cannot be empty`);
  }

  if (value.includes('\0')) {
    throw new Error(`${label} cannot contain a null byte`);
  }

  return value;
}

function validatePathSegment(name, label) {
  const value = validatePathString(name, label).trim();

  if (
    value === '.' ||
    value === '..' ||
    value.includes('/') ||
    value.includes('\\')
  ) {
    throw new Error(`${label} must be a single path segment`);
  }

  return value;
}

export function getGalRoot({ homeDir = homedir() } = {}) {
  return join(resolve(validatePathString(homeDir, 'Home directory')), '.gal');
}

export function getGalStateDir(options = {}) {
  return join(getGalRoot(options), 'state');
}

export function getWorkspaceConfigPath(options = {}) {
  return join(getGalRoot(options), 'config.yaml');
}

export function getWorkspaceSyncStatePath(options = {}) {
  return join(getGalRoot(options), 'sync-state.json');
}

export function getProjectGalDir(projectRoot) {
  return join(resolve(validatePathString(projectRoot, 'Project root')), '.gal');
}

export function getProjectConfigPath(projectRoot) {
  return join(getProjectGalDir(projectRoot), 'config.yaml');
}

export function getProjectSyncStatePath(projectRoot) {
  return join(getProjectGalDir(projectRoot), 'sync-state.json');
}

export function findProjectRoot(
  startPath = process.cwd(),
  {
    additionalMarkers = ['.claude', '.gal'],
  } = {}
) {
  const resolvedStartPath = resolve(validatePathString(startPath, 'Start path'));
  const root = parse(resolvedStartPath).root;

  let currentPath = resolvedStartPath;
  while (true) {
    if (existsSync(join(currentPath, '.git'))) {
      return currentPath;
    }

    if (currentPath === root) {
      break;
    }

    currentPath = dirname(currentPath);
  }

  const markers = additionalMarkers.map((marker) =>
    validatePathSegment(marker, 'Project marker')
  );

  currentPath = resolvedStartPath;
  while (true) {
    if (markers.some((marker) => existsSync(join(currentPath, marker)))) {
      return currentPath;
    }

    if (currentPath === root) {
      break;
    }

    currentPath = dirname(currentPath);
  }

  return resolvedStartPath;
}
