/**
 * GAL Enforcement — unified rule model (Level 0).
 *
 * Canonical in-memory representation of an org's enforcement policy. Downstream
 * compilers (Level 1 hooks, Level 2 srt settings) consume `RuleSet` without
 * touching the source YAML again. See docs/architecture/enforcement.md.
 */

export type RuleMode = 'warn' | 'block';

export interface CommandRule {
  /**
   * Literal substring match by default (case-sensitive) against the command
   * text as seen by the hook (e.g. "git push origin main"). To match as a
   * regex, wrap the pattern in slashes — "/^git push/" — so the rule stays
   * round-trippable through YAML without a custom tag.
   */
  match: string;
  mode?: RuleMode;
  /** Human-readable reason surfaced when the rule fires. */
  reason: string;
  /**
   * Which enforcement layer this rule targets. `both` (default) emits both.
   * `agent` = Level 1 hook only. `sandbox` = Level 2 srt only.
   */
  scope?: 'agent' | 'sandbox' | 'both';
}

export type FilesystemAction =
  | 'deny-read'
  | 'allow-read'
  | 'deny-write'
  | 'allow-write';

export interface FilesystemRule {
  action: FilesystemAction;
  /** Glob on macOS (sandbox-exec), literal on Linux (bubblewrap). */
  path: string;
  reason: string;
}

export type NetworkAction = 'allow-domain' | 'deny-domain';

export interface NetworkRule {
  action: NetworkAction;
  /** Domain or wildcard (e.g. "*.anthropic.com"). */
  pattern: string;
  reason: string;
}

export interface SdlcPhaseRule {
  /** SDLC phase name, e.g. "3-test", "5-deploy". */
  phase: string;
  allowCommands?: string[];
  denyCommands?: string[];
}

export interface RuleSet {
  mode: RuleMode;
  commands: CommandRule[];
  filesystem: FilesystemRule[];
  network: NetworkRule[];
  sdlc: SdlcPhaseRule[];
}

/**
 * Which scope a rule set was loaded from. Used by the merger to resolve
 * conflicts — org > project > user.
 */
export type RuleScope = 'org' | 'project' | 'user';

export interface ScopedRuleSet {
  scope: RuleScope;
  rules: RuleSet;
}
