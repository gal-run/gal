/**
 * Platform Registry — Single source of truth for all platform definitions.
 *
 * Every platform identifier, directory path, display name, icon, and capability
 * flag lives here. Downstream modules derive their platform lists from this
 * registry instead of hard-coding string unions.
 *
 * Issue: #2821
 */

// =============================================================================
// Platform Identifier (canonical union)
// =============================================================================

/**
 * Canonical platform identifier used across the entire codebase.
 *
 * When adding a new platform:
 *   1. Add the literal here
 *   2. Add a PLATFORM_REGISTRY entry below
 *   3. Every derived list updates automatically
 */
export type PlatformId =
  | 'claude'
  | 'cursor'
  | 'copilot'
  | 'gemini'
  | 'codex'
  | 'codex-cloud'
  | 'windsurf'
  | 'antigravity'
  | 'amp'
  | 'ai-studio'
  | 'kling'
  | 'higgsfield'
  | 'jules'
  | 'gal-code';

// =============================================================================
// Platform Definition
// =============================================================================

export interface PlatformDefinition {
  /** Canonical identifier */
  id: PlatformId;

  /** Platform config directory (e.g. '.claude', '.cursor') */
  directory: string;

  /** Display metadata */
  display: {
    /** Full human-readable name */
    fullName: string;
    /** Short label for compact UI */
    shortName: string;
    /** Emoji icon */
    icon: string;
  };

  /** Capability flags — drive derived lists */
  capabilities: {
    /** Has lifecycle hooks (pre/post tool use, etc.) */
    hooks: boolean;
    /** Supports credential sync (OAuth background agent sessions) */
    credentialSync: boolean;
    /** Can run background agent sessions */
    sessionRunner: boolean;
    /** Included in compliance scans */
    complianceScan: boolean;
    /** Platform is considered stable / GA */
    stable: boolean;
  };

  /** Main instruction file at repo root (e.g. 'CLAUDE.md', 'GEMINI.md') */
  instructionFile?: string;
}

// =============================================================================
// The Registry
// =============================================================================

export const PLATFORM_REGISTRY: Record<PlatformId, PlatformDefinition> = {
  claude: {
    id: 'claude',
    directory: '.claude',
    display: { fullName: 'Claude Code', shortName: 'Claude', icon: '🤖' },
    capabilities: {
      hooks: true,
      credentialSync: true,
      sessionRunner: true,
      complianceScan: true,
      stable: true,
    },
    instructionFile: 'CLAUDE.md',
  },
  cursor: {
    id: 'cursor',
    directory: '.cursor',
    display: { fullName: 'Cursor', shortName: 'Cursor', icon: '🎯' },
    capabilities: {
      hooks: true,
      credentialSync: false,
      sessionRunner: false,
      complianceScan: true,
      stable: true,
    },
  },
  copilot: {
    id: 'copilot',
    directory: '.github',
    display: { fullName: 'GitHub Copilot', shortName: 'Copilot', icon: '🚀' },
    capabilities: {
      hooks: false,
      credentialSync: false,
      sessionRunner: true,
      complianceScan: true,
      stable: true,
    },
  },
  gemini: {
    id: 'gemini',
    directory: '.gemini',
    display: { fullName: 'Gemini CLI', shortName: 'Gemini', icon: '💎' },
    capabilities: {
      hooks: true,
      credentialSync: true,
      sessionRunner: true,
      complianceScan: true,
      stable: true,
    },
    instructionFile: 'GEMINI.md',
  },
  codex: {
    id: 'codex',
    directory: '.codex',
    display: { fullName: 'Codex CLI', shortName: 'Codex', icon: '🌟' },
    capabilities: {
      hooks: false,
      credentialSync: true,
      sessionRunner: true,
      complianceScan: true,
      stable: true,
    },
    instructionFile: 'AGENTS.md',
  },
  'codex-cloud': {
    id: 'codex-cloud',
    directory: '.codex',
    display: { fullName: 'Codex Cloud', shortName: 'Codex Cloud', icon: '☁️' },
    capabilities: {
      hooks: false,
      credentialSync: false,
      sessionRunner: false,
      complianceScan: false,
      stable: false,
    },
  },
  windsurf: {
    id: 'windsurf',
    directory: '.windsurf',
    display: { fullName: 'Windsurf', shortName: 'Windsurf', icon: '🏄' },
    capabilities: {
      hooks: true,
      credentialSync: false,
      sessionRunner: false,
      complianceScan: true,
      stable: true,
    },
  },
  antigravity: {
    id: 'antigravity',
    directory: '.antigravity',
    display: { fullName: 'Antigravity', shortName: 'Antigravity', icon: '🪐' },
    capabilities: {
      hooks: false,
      credentialSync: false,
      sessionRunner: false,
      complianceScan: true,
      stable: false,
    },
  },
  amp: {
    id: 'amp',
    directory: '.amp',
    display: { fullName: 'Amp', shortName: 'Amp', icon: '⚡' },
    capabilities: {
      hooks: false,
      credentialSync: false,
      sessionRunner: false,
      complianceScan: true,
      stable: false,
    },
    instructionFile: 'AGENT.md',
  },
  'ai-studio': {
    id: 'ai-studio',
    directory: '.ai-studio',
    display: { fullName: 'Google AI Studio', shortName: 'AI Studio', icon: '🧪' },
    capabilities: {
      hooks: false,
      credentialSync: false,
      sessionRunner: false,
      complianceScan: false,
      stable: false,
    },
  },
  kling: {
    id: 'kling',
    directory: '.kling',
    display: { fullName: 'Kling AI', shortName: 'Kling AI', icon: '🎬' },
    capabilities: {
      hooks: false,
      credentialSync: false,
      sessionRunner: false,
      complianceScan: false,
      stable: false,
    },
  },
  higgsfield: {
    id: 'higgsfield',
    directory: '.higgsfield',
    display: { fullName: 'Higgsfield AI', shortName: 'Higgsfield', icon: '🎥' },
    capabilities: {
      hooks: false,
      credentialSync: false,
      sessionRunner: false,
      complianceScan: false,
      stable: false,
    },
  },
  jules: {
    id: 'jules',
    directory: '.jules',
    display: { fullName: 'Jules', shortName: 'Jules', icon: '🤖' },
    capabilities: {
      hooks: false,
      credentialSync: false,
      sessionRunner: false,
      complianceScan: false,
      stable: false,
    },
  },
  'gal-code': {
    id: 'gal-code',
    directory: '.',
    display: { fullName: 'Gal Code', shortName: 'Gal Code', icon: '💻' },
    capabilities: {
      hooks: false,
      credentialSync: false,
      sessionRunner: false,
      complianceScan: true,
      stable: true,
    },
  },
};

// =============================================================================
// Derived helpers (auto-update when registry changes)
// =============================================================================

/** All platform IDs in registry order */
export const ALL_PLATFORM_IDS: PlatformId[] =
  Object.keys(PLATFORM_REGISTRY) as PlatformId[];

/** Platforms marked as stable */
export const STABLE_PLATFORM_IDS: PlatformId[] =
  ALL_PLATFORM_IDS.filter((id) => PLATFORM_REGISTRY[id].capabilities.stable);

/** Helper: filter platforms by a capability flag */
export function platformsWithCapability(
  cap: keyof PlatformDefinition['capabilities'],
): PlatformId[] {
  return ALL_PLATFORM_IDS.filter((id) => PLATFORM_REGISTRY[id].capabilities[cap]);
}

/** Platforms that support lifecycle hooks */
export const HOOKABLE_PLATFORMS: PlatformId[] = platformsWithCapability('hooks');

/** Platforms that support credential sync (OAuth for background agents) */
export const CREDENTIAL_SYNC_PLATFORMS: PlatformId[] =
  platformsWithCapability('credentialSync');

/** Platforms that can run background agent sessions */
export const SESSION_RUNNER_PLATFORMS: PlatformId[] =
  platformsWithCapability('sessionRunner');

// =============================================================================
// Directory & display maps
// =============================================================================

/** Map of PlatformId -> config directory (e.g. '.claude') */
export const PLATFORM_DIRECTORY_MAP: Record<PlatformId, string> =
  Object.fromEntries(
    ALL_PLATFORM_IDS.map((id) => [id, PLATFORM_REGISTRY[id].directory]),
  ) as Record<PlatformId, string>;

/** Map of PlatformId -> full display name */
export const PLATFORM_DISPLAY_MAP: Record<PlatformId, string> =
  Object.fromEntries(
    ALL_PLATFORM_IDS.map((id) => [id, PLATFORM_REGISTRY[id].display.fullName]),
  ) as Record<PlatformId, string>;

/** Map of PlatformId -> instruction file (only platforms that have one) */
export const PLATFORM_INSTRUCTION_FILE_MAP: Partial<Record<PlatformId, string>> =
  Object.fromEntries(
    ALL_PLATFORM_IDS
      .filter((id) => PLATFORM_REGISTRY[id].instructionFile)
      .map((id) => [id, PLATFORM_REGISTRY[id].instructionFile!]),
  ) as Partial<Record<PlatformId, string>>;
