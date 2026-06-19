import { isRegexMatch, stripRegexSlashes } from './parser.js';
import type { CommandRule } from './types.js';

/**
 * Match a command-line string against a CommandRule.
 *
 * - Literal patterns match by case-sensitive substring. This is intentional:
 *   `"git push"` should catch `"git push origin main"`, and the tradeoff of
 *   very-occasional false positives on benign substrings is worth it vs.
 *   requiring every user to write regex.
 * - Regex patterns (wrapped in `/.../`) match anywhere in the command.
 *
 * The regex is compiled without the `g` flag so `.test()` is stateless.
 */
export function matchesCommand(rule: CommandRule, command: string): boolean {
  if (isRegexMatch(rule.match)) {
    const regex = new RegExp(stripRegexSlashes(rule.match));
    return regex.test(command);
  }
  return command.includes(rule.match);
}

/**
 * Find the first rule that matches. Order matters — callers should order
 * rules by specificity, most specific first.
 */
export function findMatchingCommandRule(
  rules: readonly CommandRule[],
  command: string,
): CommandRule | undefined {
  return rules.find((rule) => matchesCommand(rule, command));
}
