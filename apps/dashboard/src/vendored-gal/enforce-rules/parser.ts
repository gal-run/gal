import { parse as parseYaml } from 'yaml';
import type {
  CommandRule,
  FilesystemAction,
  FilesystemRule,
  NetworkAction,
  NetworkRule,
  RuleMode,
  RuleSet,
  SdlcPhaseRule,
} from './types.js';

/**
 * Thrown when the enforcement YAML stanza is syntactically valid YAML but
 * semantically invalid (missing required fields, bad enum, etc.). The message
 * always names the offending field path so users can fix it without guessing.
 */
export class ValidationError extends Error {
  constructor(message: string, public path: string) {
    super(`${path}: ${message}`);
    this.name = 'ValidationError';
  }
}

const VALID_MODES: ReadonlySet<RuleMode> = new Set(['warn', 'block']);
const VALID_FS_ACTIONS: ReadonlySet<FilesystemAction> = new Set([
  'deny-read',
  'allow-read',
  'deny-write',
  'allow-write',
]);
const VALID_NET_ACTIONS: ReadonlySet<NetworkAction> = new Set([
  'allow-domain',
  'deny-domain',
]);
const VALID_SCOPES = new Set(['agent', 'sandbox', 'both']);

/**
 * Parse the `enforcement:` stanza out of an approved-config YAML document.
 *
 * Accepts either:
 *   - the full approved-config document with a top-level `enforcement:` key, or
 *   - a bare enforcement stanza (already unwrapped).
 *
 * Empty/missing stanzas produce an empty `RuleSet` rather than throwing — a
 * policy with no enforcement rules is a valid configuration.
 */
export function parseEnforcementYaml(yaml: string): RuleSet {
  if (!yaml.trim()) {
    return emptyRuleSet();
  }

  let doc: unknown;
  try {
    doc = parseYaml(yaml);
  } catch (error) {
    throw new ValidationError(
      `YAML syntax error: ${error instanceof Error ? error.message : String(error)}`,
      '',
    );
  }

  if (doc === null || doc === undefined) {
    return emptyRuleSet();
  }

  if (typeof doc !== 'object' || Array.isArray(doc)) {
    throw new ValidationError('expected an object', '');
  }

  const record = doc as Record<string, unknown>;
  // Unwrap if the caller passed the full approved-config document.
  const stanza =
    'enforcement' in record && record.enforcement !== undefined
      ? record.enforcement
      : record;

  return parseRuleSet(stanza, 'enforcement');
}

function parseRuleSet(raw: unknown, path: string): RuleSet {
  if (raw === null || raw === undefined) {
    return emptyRuleSet();
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ValidationError('expected an object', path);
  }

  const r = raw as Record<string, unknown>;
  const mode = parseMode(r.mode, `${path}.mode`);

  return {
    mode,
    commands: parseArray(r.commands, `${path}.commands`, parseCommandRule),
    filesystem: parseArray(
      r.filesystem,
      `${path}.filesystem`,
      parseFilesystemRule,
    ),
    network: parseArray(r.network, `${path}.network`, parseNetworkRule),
    sdlc: parseArray(r.sdlc, `${path}.sdlc`, parseSdlcRule),
  };
}

function parseMode(raw: unknown, path: string): RuleMode {
  if (raw === undefined) return 'block';
  if (typeof raw !== 'string' || !VALID_MODES.has(raw as RuleMode)) {
    throw new ValidationError(
      `mode must be one of ${[...VALID_MODES].join(', ')}`,
      path,
    );
  }
  return raw as RuleMode;
}

function parseArray<T>(
  raw: unknown,
  path: string,
  parseItem: (item: unknown, itemPath: string) => T,
): T[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new ValidationError('expected an array', path);
  }
  return raw.map((item, i) => parseItem(item, `${path}[${i}]`));
}

function parseCommandRule(raw: unknown, path: string): CommandRule {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ValidationError('expected an object', path);
  }
  const r = raw as Record<string, unknown>;

  const match = requireString(r.match, `${path}.match`);
  // If the match is a regex wrapper, validate that it compiles now so the
  // error surfaces at parse time, not at first hook call.
  if (isRegexMatch(match)) {
    try {
      new RegExp(stripRegexSlashes(match));
    } catch (error) {
      throw new ValidationError(
        `invalid regex in match: ${error instanceof Error ? error.message : String(error)}`,
        `${path}.match`,
      );
    }
  }

  const reason = requireString(r.reason, `${path}.reason`);
  const mode =
    r.mode === undefined ? undefined : parseMode(r.mode, `${path}.mode`);

  let scope: CommandRule['scope'];
  if (r.scope !== undefined) {
    if (typeof r.scope !== 'string' || !VALID_SCOPES.has(r.scope)) {
      throw new ValidationError(
        `scope must be one of ${[...VALID_SCOPES].join(', ')}`,
        `${path}.scope`,
      );
    }
    scope = r.scope as CommandRule['scope'];
  }

  return { match, reason, ...(mode && { mode }), ...(scope && { scope }) };
}

function parseFilesystemRule(raw: unknown, path: string): FilesystemRule {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ValidationError('expected an object', path);
  }
  const r = raw as Record<string, unknown>;

  const actionRaw = requireString(r.action, `${path}.action`);
  if (!VALID_FS_ACTIONS.has(actionRaw as FilesystemAction)) {
    throw new ValidationError(
      `action must be one of ${[...VALID_FS_ACTIONS].join(', ')}`,
      `${path}.action`,
    );
  }

  return {
    action: actionRaw as FilesystemAction,
    path: requireString(r.path, `${path}.path`),
    reason: requireString(r.reason, `${path}.reason`),
  };
}

function parseNetworkRule(raw: unknown, path: string): NetworkRule {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ValidationError('expected an object', path);
  }
  const r = raw as Record<string, unknown>;

  const actionRaw = requireString(r.action, `${path}.action`);
  if (!VALID_NET_ACTIONS.has(actionRaw as NetworkAction)) {
    throw new ValidationError(
      `action must be one of ${[...VALID_NET_ACTIONS].join(', ')}`,
      `${path}.action`,
    );
  }

  return {
    action: actionRaw as NetworkAction,
    pattern: requireString(r.pattern, `${path}.pattern`),
    reason: requireString(r.reason, `${path}.reason`),
  };
}

function parseSdlcRule(raw: unknown, path: string): SdlcPhaseRule {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ValidationError('expected an object', path);
  }
  const r = raw as Record<string, unknown>;

  const rule: SdlcPhaseRule = { phase: requireString(r.phase, `${path}.phase`) };
  if (r.allowCommands !== undefined || r.allow_commands !== undefined) {
    rule.allowCommands = parseStringArray(
      r.allowCommands ?? r.allow_commands,
      `${path}.allowCommands`,
    );
  }
  if (r.denyCommands !== undefined || r.deny_commands !== undefined) {
    rule.denyCommands = parseStringArray(
      r.denyCommands ?? r.deny_commands,
      `${path}.denyCommands`,
    );
  }
  return rule;
}

function requireString(raw: unknown, path: string): string {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new ValidationError('required, must be a non-empty string', path);
  }
  return raw;
}

function parseStringArray(raw: unknown, path: string): string[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError('expected an array of strings', path);
  }
  return raw.map((v, i) => requireString(v, `${path}[${i}]`));
}

export function emptyRuleSet(): RuleSet {
  return { mode: 'block', commands: [], filesystem: [], network: [], sdlc: [] };
}

export function isRegexMatch(pattern: string): boolean {
  return (
    pattern.length >= 2 && pattern.startsWith('/') && pattern.endsWith('/')
  );
}

export function stripRegexSlashes(pattern: string): string {
  return pattern.slice(1, -1);
}
