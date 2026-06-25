// Package enforce evaluates governance policy rules against enforcement
// check requests. It is a pure, testable library with no HTTP or store
// dependencies.
package enforce

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/gal-run/gal/services/governance-svc/internal/domain"
)

// EvaluatePolicyDecision evaluates a governance policy against an enforcement
// check request and returns the final enforcement decision.
//
// The decision is the result of:
//  1. Parsing p.Rules (JSON). If malformed: fail-closed (treated as an implicit
//     "deny" outcome before mode combination).
//  2. Scanning the parsed rules in order. The first matching rule's Effect wins.
//     If no rule matches, the ruleset's Default is used ("allow" if unset).
//  3. Combining the matched effect with p.Enforcement mode:
//     - "disabled"  → always Allowed:true, Action:"allowed" (mode overrides rules).
//     - "strict"    → "deny"  → Allowed:false, Action:"denied"
//                      "audit" → Allowed:true,  Action:"audit"
//                      "allow" → Allowed:true,  Action:"allowed"
//     - "advisory"  → "deny"  → downgraded to Allowed:true, Action:"audit"
//                      "audit" → Allowed:true, Action:"audit"
//                      "allow" → Allowed:true, Action:"allowed"
func EvaluatePolicyDecision(p domain.Policy, req domain.EnforcementCheckRequest) domain.EnforcementCheckResult {
	// Step 1: Parse Rules JSON. Fail-closed on malformed data.
	ruleset, parseErr := parseRules(p.Rules)
	if parseErr != nil {
		return failClosedResult(p, parseErr)
	}

	// Step 2: Evaluate rules. First match wins.
	matchedEffect, matchedReason := evaluateRules(ruleset, req)

	// Step 3: Combine with enforcement mode.
	return combineWithMode(p, matchedEffect, matchedReason)
}

// parseRules unmarshals a JSON RuleSet string.
func parseRules(raw string) (domain.RuleSet, error) {
	if raw == "" {
		return domain.RuleSet{Rules: nil, Default: "allow"}, nil
	}
	var rs domain.RuleSet
	if err := json.Unmarshal([]byte(raw), &rs); err != nil {
		return domain.RuleSet{}, fmt.Errorf("malformed rules JSON: %w", err)
	}
	// Normalise: nil -> empty slice for deterministic iteration.
	if rs.Rules == nil {
		rs.Rules = []domain.Rule{}
	}
	return rs, nil
}

// evaluateRules scans the rules in order. Returns the first matching rule's
// effect and reason. If no rule matches, returns the default effect.
func evaluateRules(rs domain.RuleSet, req domain.EnforcementCheckRequest) (effect, reason string) {
	for _, rule := range rs.Rules {
		if matchRule(rule.Match, req) {
			return rule.Effect, rule.Reason
		}
	}
	// Default: "allow" if unset.
	def := rs.Default
	if def == "" {
		def = "allow"
	}
	return def, fmt.Sprintf("default policy (%s) — no matching rule", def)
}

// matchRule returns true when ALL non-empty match fields match the request.
func matchRule(m domain.RuleMatch, req domain.EnforcementCheckRequest) bool {
	return fieldMatches(m.Action, req.Action) &&
		fieldMatches(m.Repo, req.Repo) &&
		fieldMatches(m.Context, req.Context)
}

// fieldMatches checks whether pattern p matches value v.
// Matching is case-insensitive. An empty pattern is a wildcard (matches
// everything).
//
// Semantics:
//   - "*" -> matches everything.
//   - Trailing "*" -> prefix match (e.g. "git*" matches "git push").
//   - Leading "*" -> suffix match (e.g. "*merge" matches "squash-merge").
//   - Otherwise -> exact (case-insensitive) match.
func fieldMatches(pattern, value string) bool {
	if pattern == "" {
		return true
	}
	p := strings.ToLower(pattern)
	v := strings.ToLower(value)
	if p == "*" {
		return true
	}
	if strings.HasPrefix(p, "*") && strings.HasSuffix(p, "*") {
		// Both prefix and suffix wildcard — substring match.
		return strings.Contains(v, p[1:len(p)-1])
	}
	if strings.HasPrefix(p, "*") {
		return strings.HasSuffix(v, p[1:])
	}
	if strings.HasSuffix(p, "*") {
		return strings.HasPrefix(v, p[:len(p)-1])
	}
	return p == v
}

// combineWithMode combines the matched rule effect with the policy's
// enforcement mode to produce the final EnforcementCheckResult.
func combineWithMode(p domain.Policy, effect, reason string) domain.EnforcementCheckResult {
	// Build a base reason that names the policy.
	baseReason := reason
	if baseReason == "" {
		baseReason = fmt.Sprintf("policy %q rule matched", p.Name)
	}

	switch p.Enforcement {
	case "disabled":
		return domain.EnforcementCheckResult{
			Allowed:    true,
			Action:     "allowed",
			PolicyID:   p.ID,
			PolicyName: p.Name,
			Reason:     fmt.Sprintf("policy enforcement disabled (rule would: %s — %s)", effect, baseReason),
		}

	case "strict":
		switch effect {
		case "deny":
			return domain.EnforcementCheckResult{
				Allowed:    false,
				Action:     "denied",
				PolicyID:   p.ID,
				PolicyName: p.Name,
				Reason:     fmt.Sprintf("strict enforcement: denied — %s", baseReason),
			}
		case "audit":
			return domain.EnforcementCheckResult{
				Allowed:    true,
				Action:     "audit",
				PolicyID:   p.ID,
				PolicyName: p.Name,
				Reason:     fmt.Sprintf("strict enforcement: audit — %s", baseReason),
			}
		default: // "allow"
			return domain.EnforcementCheckResult{
				Allowed:    true,
				Action:     "allowed",
				PolicyID:   p.ID,
				PolicyName: p.Name,
				Reason:     fmt.Sprintf("strict enforcement: allowed — %s", baseReason),
			}
		}

	default: // "advisory" (including any unrecognised mode)
		switch effect {
		case "deny":
			return domain.EnforcementCheckResult{
				Allowed:    true,
				Action:     "audit",
				PolicyID:   p.ID,
				PolicyName: p.Name,
				Reason:     fmt.Sprintf("advisory: would deny under strict — %s", baseReason),
			}
		case "audit":
			return domain.EnforcementCheckResult{
				Allowed:    true,
				Action:     "audit",
				PolicyID:   p.ID,
				PolicyName: p.Name,
				Reason:     fmt.Sprintf("advisory: audit — %s", baseReason),
			}
		default: // "allow"
			return domain.EnforcementCheckResult{
				Allowed:    true,
				Action:     "allowed",
				PolicyID:   p.ID,
				PolicyName: p.Name,
				Reason:     fmt.Sprintf("advisory: allowed — %s", baseReason),
			}
		}
	}
}

// failClosedResult is used when the Rules JSON is malformed or unparseable.
// It produces an implicit "deny" outcome, which combineWithMode then turns
// into the actual denial depending on the enforcement mode.
func failClosedResult(p domain.Policy, parseErr error) domain.EnforcementCheckResult {
	effect := "deny"
	reason := fmt.Sprintf("malformed rules JSON — fail-closed: %v", parseErr)
	return combineWithMode(p, effect, reason)
}
