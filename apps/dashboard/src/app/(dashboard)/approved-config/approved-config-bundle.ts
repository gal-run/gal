type ConfigEntry = {
  name: string
  content: string
  sourceRepo?: string
  sourcePath?: string
  hash?: string
}

type SingleConfigEntry = {
  content: string
  sourceRepo?: string
  sourcePath?: string
  hash?: string
}

type BundleCore = {
  commands: ConfigEntry[]
  subagents: ConfigEntry[]
  hooks: ConfigEntry[]
  settings?: SingleConfigEntry | null
  instructions?: SingleConfigEntry | null
}

type MatchingConfigLike = {
  repo?: string | null
  path?: string | null
}

export function appendConfigToBundle(args: {
  bundle: BundleCore
  configType: string
  configName: string
  matchingConfig: MatchingConfigLike
  configContent: string | null | undefined
  itemHash: string
}): BundleCore {
  return appendConfigToBundleTyped(args)
}

export function appendConfigToBundleTyped<T extends BundleCore>(args: {
  bundle: T
  configType: string
  configName: string
  matchingConfig: MatchingConfigLike
  configContent: string | null | undefined
  itemHash: string
}): T {
  const {
    bundle,
    configType,
    configName,
    matchingConfig,
    configContent,
    itemHash,
  } = args

  const sourceRepo = matchingConfig.repo ?? undefined
  const sourcePath = matchingConfig.path ?? undefined
  const content = configContent ?? ''
  const fileName = sourcePath?.split('/').pop()

  if (configType === 'command') {
    return {
      ...bundle,
      commands: [
        ...bundle.commands,
        {
          name: fileName || `${configName}.md`,
          content,
          sourceRepo,
          sourcePath,
          hash: itemHash,
        },
      ],
    } as T
  }

  if (configType === 'subagent') {
    return {
      ...bundle,
      subagents: [
        ...bundle.subagents,
        {
          name: fileName || `${configName}.md`,
          content,
          sourceRepo,
          sourcePath,
          hash: itemHash,
        },
      ],
    } as T
  }

  if (configType === 'hook') {
    return {
      ...bundle,
      hooks: [
        ...bundle.hooks,
        {
          name: fileName || configName,
          content,
          sourceRepo,
          sourcePath,
          hash: itemHash,
        },
      ],
    } as T
  }

  if (configType === 'settings') {
    return {
      ...bundle,
      settings: {
        content,
        sourceRepo,
        sourcePath,
        hash: itemHash,
      },
    } as T
  }

  if (configType === 'instructions') {
    return {
      ...bundle,
      instructions: {
        content,
        sourceRepo,
        sourcePath,
        hash: itemHash,
      },
    } as T
  }

  return bundle
}
