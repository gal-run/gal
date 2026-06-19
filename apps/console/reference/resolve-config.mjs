function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function deepClone(value) {
  if (Array.isArray(value)) {
    return value.map(deepClone);
  }
  if (isObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, deepClone(nested)])
    );
  }
  return value;
}

function deepMerge(baseValue, overrideValue) {
  if (!isObject(baseValue) || !isObject(overrideValue)) {
    return deepClone(overrideValue);
  }

  const merged = { ...deepClone(baseValue) };
  for (const [key, value] of Object.entries(overrideValue)) {
    if (isObject(value) && isObject(merged[key])) {
      merged[key] = deepMerge(merged[key], value);
    } else {
      merged[key] = deepClone(value);
    }
  }
  return merged;
}

function mergeInstructions(workspaceInstructions, projectInstructions) {
  if (!workspaceInstructions && !projectInstructions) {
    return undefined;
  }

  if (!workspaceInstructions) {
    return deepClone(projectInstructions);
  }

  if (!projectInstructions) {
    return deepClone(workspaceInstructions);
  }

  const strategy = projectInstructions.strategy || 'replace';
  if (strategy === 'append') {
    const workspaceContent = workspaceInstructions.content || '';
    const projectContent = projectInstructions.content || '';
    return {
      ...deepClone(projectInstructions),
      strategy: 'append',
      content: [workspaceContent, projectContent].filter(Boolean).join('\n\n'),
    };
  }

  return deepClone(projectInstructions);
}

function mergeNamedMap(workspaceMap, projectMap) {
  const result = {};
  const names = new Set([
    ...Object.keys(workspaceMap || {}),
    ...Object.keys(projectMap || {}),
  ]);

  for (const name of names) {
    const workspaceValue = workspaceMap?.[name];
    const projectValue = projectMap?.[name];
    const selected = projectValue !== undefined ? projectValue : workspaceValue;

    if (!selected || selected.disabled) {
      continue;
    }

    result[name] = deepClone(selected);
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function mergeDomains(workspaceDomains, projectDomains) {
  if (!workspaceDomains && !projectDomains) {
    return undefined;
  }

  if (!workspaceDomains) {
    return deepClone(projectDomains);
  }

  if (!projectDomains) {
    return deepClone(workspaceDomains);
  }

  const workspaceAllow = new Set(workspaceDomains.allow || []);
  const projectAllow = new Set(projectDomains.allow || []);
  const mode = projectDomains.mode || 'union';

  if (mode === 'narrow') {
    const intersection = [...projectAllow].filter((domain) => workspaceAllow.has(domain));
    return {
      mode,
      allow: intersection,
    };
  }

  return {
    mode,
    allow: [...new Set([...workspaceAllow, ...projectAllow])],
  };
}

function mergePlatformConfig(workspacePlatform, projectPlatform) {
  const platform = {};

  platform.instructions = mergeInstructions(
    workspacePlatform?.instructions,
    projectPlatform?.instructions
  );

  platform.commands = mergeNamedMap(
    workspacePlatform?.commands,
    projectPlatform?.commands
  );

  platform.agents = mergeNamedMap(
    workspacePlatform?.agents,
    projectPlatform?.agents
  );

  platform.rules = mergeNamedMap(
    workspacePlatform?.rules,
    projectPlatform?.rules
  );

  platform.hooks = mergeNamedMap(
    workspacePlatform?.hooks,
    projectPlatform?.hooks
  );

  platform.mcpServers = mergeNamedMap(
    workspacePlatform?.mcpServers,
    projectPlatform?.mcpServers
  );

  platform.settings = projectPlatform?.settings
    ? deepMerge(workspacePlatform?.settings || {}, projectPlatform.settings)
    : workspacePlatform?.settings
      ? deepClone(workspacePlatform.settings)
      : undefined;

  return Object.fromEntries(
    Object.entries(platform).filter(([, value]) => value !== undefined)
  );
}

export function resolveConfig({ workspace = {}, project = {} }) {
  const effective = {
    apiVersion: 'gal/v1',
    kind: 'EffectiveConfig',
    metadata: {
      workspaceRef:
        project?.metadata?.workspaceRef || workspace?.metadata?.id || 'personal',
    },
  };

  const platformNames = new Set([
    ...Object.keys(workspace.platforms || {}),
    ...Object.keys(project.platforms || {}),
  ]);

  if (platformNames.size > 0) {
    effective.platforms = {};
    for (const name of platformNames) {
      const mergedPlatform = mergePlatformConfig(
        workspace.platforms?.[name],
        project.platforms?.[name]
      );
      if (Object.keys(mergedPlatform).length > 0) {
        effective.platforms[name] = mergedPlatform;
      }
    }
  }

  if (workspace.defaults || project.defaults) {
    effective.defaults = deepMerge(workspace.defaults || {}, project.defaults || {});
  }

  const domains = mergeDomains(
    workspace.policy?.domains,
    project.policy?.domains
  );
  if (domains) {
    effective.policy = {
      domains,
    };
  }

  return effective;
}
