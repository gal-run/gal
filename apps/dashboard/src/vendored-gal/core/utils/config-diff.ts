/**
 * Config Diff Utilities - Phase 1
 *
 * Utilities for comparing and merging GAL configurations.
 *
 * Feature: Config Governance Model (GitHub Issue #1044)
 * Spec: openspec/changes/1044-config-governance-model/design.md
 */

import type { GalConfig, GalMcpConfig, ConfigDiff } from '@gal/types';

/**
 * Compute diff between two configs
 *
 * @param current - Current active config (null if no active config)
 * @param proposed - Proposed new config
 * @returns Diff showing additions, modifications, and removals
 */
export function computeConfigDiff(
  current: GalConfig | null,
  proposed: GalConfig
): ConfigDiff {
  const added: Record<string, unknown> = {};
  const modified: Record<string, { old: unknown; new: unknown }> = {};
  const removed: Record<string, unknown> = {};

  // If no current config, everything is added
  if (!current) {
    return {
      added: flattenConfig(proposed),
      modified: {},
      removed: {},
    };
  }

  // Flatten configs for comparison
  const currentFlat = flattenConfig(current);
  const proposedFlat = flattenConfig(proposed);

  // Find additions and modifications
  for (const [key, proposedValue] of Object.entries(proposedFlat)) {
    if (!(key in currentFlat)) {
      added[key] = proposedValue;
    } else if (JSON.stringify(currentFlat[key]) !== JSON.stringify(proposedValue)) {
      modified[key] = {
        old: currentFlat[key],
        new: proposedValue,
      };
    }
  }

  // Find removals
  for (const [key, currentValue] of Object.entries(currentFlat)) {
    if (!(key in proposedFlat)) {
      removed[key] = currentValue;
    }
  }

  return { added, modified, removed };
}

/**
 * Merge org and project configs
 *
 * Project config inherits from org config with explicit override support.
 *
 * @param org - Organization-level config (baseline)
 * @param project - Project-level config (optional overrides)
 * @returns Merged configuration
 */
export function mergeConfigs(
  org: GalConfig,
  project?: GalConfig
): GalConfig {
  // If no project config, return org config as-is
  if (!project) {
    return org;
  }

  // Deep merge with project overrides taking precedence
  // Build object conditionally to handle exactOptionalPropertyTypes
  const merged: GalConfig = {
    version: 1,
    organization: org.organization,
    syncedAt: new Date().toISOString(),
    hash: '', // Will be computed after merge
    configVersion: org.configVersion,
  };

  // Merge instructions (project can override)
  const mergedInstructions = project.instructions || org.instructions;
  if (mergedInstructions) {
    merged.instructions = mergedInstructions;
  }

  // Merge commands (project can add or override by name)
  const mergedCommands = mergeArrayByName(org.commands, project.commands);
  if (mergedCommands && mergedCommands.length > 0) {
    merged.commands = mergedCommands;
  }

  // Merge agents (project can add or override by name)
  const mergedAgents = mergeArrayByName(org.agents, project.agents);
  if (mergedAgents && mergedAgents.length > 0) {
    merged.agents = mergedAgents;
  }

  // Merge rules (project can add or override by name)
  const mergedRules = mergeArrayByName(org.rules, project.rules);
  if (mergedRules && mergedRules.length > 0) {
    merged.rules = mergedRules;
  }

  // Merge hooks (both org and project hooks run)
  const mergedHooks = [...(org.hooks || []), ...(project.hooks || [])];
  if (mergedHooks.length > 0) {
    merged.hooks = mergedHooks;
  }

  // Merge settings (project overrides org)
  const mergedSettings = project.settings
    ? deepMerge(org.settings, project.settings)
    : org.settings;
  if (mergedSettings) {
    merged.settings = mergedSettings;
  }

  // Merge MCP config (project can add or override servers)
  const mergedMcp = mergeMcpConfig(org.mcp, project.mcp);
  if (mergedMcp && Object.keys(mergedMcp).length > 0) {
    merged.mcp = mergedMcp;
  }

  return merged;
}

/**
 * Flatten config object into dot-notation keys
 * For easier comparison and diff display
 *
 * @param obj - Object to flatten
 * @param prefix - Prefix for keys (used in recursion)
 * @returns Flattened object with dot-notation keys
 */
function flattenConfig(
  obj: any,
  prefix = ''
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively flatten nested objects
      Object.assign(result, flattenConfig(value, fullKey));
    } else {
      result[fullKey] = value;
    }
  }

  return result;
}

/**
 * Merge arrays by name property
 * Project items override org items with same name, otherwise concatenate
 *
 * @param orgArray - Organization array
 * @param projectArray - Project array
 * @returns Merged array
 */
function mergeArrayByName<T extends { name: string }>(
  orgArray?: T[],
  projectArray?: T[]
): T[] | undefined {
  if (!orgArray && !projectArray) return undefined;
  if (!orgArray) return projectArray;
  if (!projectArray) return orgArray;

  const merged = [...orgArray];
  const orgNames = new Set(orgArray.map(item => item.name));

  for (const projectItem of projectArray) {
    if (orgNames.has(projectItem.name)) {
      // Override: replace org item with project item
      const index = merged.findIndex(item => item.name === projectItem.name);
      merged[index] = projectItem;
    } else {
      // Addition: add new project item
      merged.push(projectItem);
    }
  }

  return merged;
}

/**
 * Deep merge two objects
 * Project values override org values
 *
 * @param org - Organization object
 * @param project - Project object
 * @returns Merged object
 */
function deepMerge<T>(org?: T, project?: T): T | undefined {
  if (!org && !project) return undefined;
  if (!org) return project;
  if (!project) return org;

  if (typeof org !== 'object' || typeof project !== 'object') {
    return project; // Project wins on primitive values
  }

  const merged: any = { ...org };

  for (const [key, value] of Object.entries(project as any)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      merged[key] = deepMerge((merged as any)[key], value);
    } else {
      merged[key] = value; // Project wins
    }
  }

  return merged;
}

/**
 * Merge MCP configurations
 * Project can add or override servers by name
 *
 * @param org - Organization MCP config
 * @param project - Project MCP config
 * @returns Merged MCP config
 */
function mergeMcpConfig(
  org?: GalMcpConfig,
  project?: GalMcpConfig
): GalMcpConfig | undefined {
  if (!org && !project) return undefined;
  if (!org) return project;
  if (!project) return org;

  const orgServers = org.servers || [];
  const projectServers = project.servers || [];
  const mergedServers = mergeArrayByName(orgServers, projectServers);

  // Only include servers property if we have servers
  if (mergedServers && mergedServers.length > 0) {
    return { servers: mergedServers };
  }
  return {};
}
