import type { RuleSet, ScopedRuleSet, RuleScope } from './types.js';

// Higher number = wins on mode conflict. Org is strictest authority.
const SCOPE_PRIORITY: Record<RuleScope, number> = {
  user: 0,
  project: 1,
  org: 2,
};

/**
 * Merge rule sets from multiple scopes into one effective rule set.
 *
 * Semantics:
 * - `mode`: highest-priority scope wins (org > project > user).
 * - Rule arrays (commands, filesystem, network, sdlc) are concatenated in
 *   order of decreasing priority. Org rules appear first so the first-match
 *   logic in `findMatchingCommandRule` picks them up before project/user.
 *
 * This is deliberately additive — if a lower scope wants a broader rule, it
 * can, but it cannot weaken a higher scope's rule because higher-scope rules
 * are evaluated first.
 */
export function mergeRuleSets(scopes: ScopedRuleSet[]): RuleSet {
  if (scopes.length === 0) {
    return { mode: 'block', commands: [], filesystem: [], network: [], sdlc: [] };
  }

  const sorted = [...scopes].sort(
    (a, b) => SCOPE_PRIORITY[b.scope] - SCOPE_PRIORITY[a.scope],
  );

  const highestMode = sorted[0]!.rules.mode;

  return {
    mode: highestMode,
    commands: sorted.flatMap((s) => s.rules.commands),
    filesystem: sorted.flatMap((s) => s.rules.filesystem),
    network: sorted.flatMap((s) => s.rules.network),
    sdlc: sorted.flatMap((s) => s.rules.sdlc),
  };
}
