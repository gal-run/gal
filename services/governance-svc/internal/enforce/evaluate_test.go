package enforce_test

import (
	"testing"

	"github.com/gal-run/gal/services/governance-svc/internal/domain"
	"github.com/gal-run/gal/services/governance-svc/internal/enforce"
)

// buildPolicy is a test helper that creates a domain.Policy with the given
// attributes. rulesRaw is the JSON for Policy.Rules.
func buildPolicy(id, name, enforcement, rulesRaw string) domain.Policy {
	return domain.Policy{
		ID:          id,
		OrgID:       "org-1",
		Name:        name,
		Description: "test policy",
		Rules:       rulesRaw,
		Enforcement: enforcement,
		IsActive:    true,
	}
}

// req is a test helper for creating a request.
func req(action, repo, context string) domain.EnforcementCheckRequest {
	return domain.EnforcementCheckRequest{Action: action, Repo: repo, Context: context}
}

func TestEvaluatePolicyDecision_RulesDriveDecision(t *testing.T) {
	// (a) Two policies, SAME Enforcement="strict", DIFFERENT Rules.
	//     Same request {Action:"delete"} must produce different results.

	rulesAllowDelete := `{
		"rules": [{"match": {"action": "delete"}, "effect": "allow", "reason": "deletion allowed"}],
		"default": "deny"
	}`
	rulesDenyDelete := `{
		"rules": [{"match": {"action": "delete"}, "effect": "deny", "reason": "deletion prohibited"}],
		"default": "allow"
	}`

	pAllow := buildPolicy("p-allow", "allow-delete", "strict", rulesAllowDelete)
	pDeny := buildPolicy("p-deny", "deny-delete", "strict", rulesDenyDelete)

	r := req("delete", "", "")

	// Policy that ALLOWS delete → Allowed:true
	result1 := enforce.EvaluatePolicyDecision(pAllow, r)
	if result1.Allowed != true {
		t.Errorf("expected allowed=true for policy with allow-delete rule, got allowed=%v action=%q", result1.Allowed, result1.Action)
	}
	if result1.Action != "allowed" {
		t.Errorf("expected action=allowed, got %q", result1.Action)
	}

	// Policy that DENIES delete → Allowed:false
	result2 := enforce.EvaluatePolicyDecision(pDeny, r)
	if result2.Allowed != false {
		t.Errorf("expected allowed=false for policy with deny-delete rule, got allowed=%v action=%q", result2.Allowed, result2.Action)
	}
	if result2.Action != "denied" {
		t.Errorf("expected action=denied, got %q", result2.Action)
	}
}

func TestEvaluatePolicyDecision_RequestPayloadMatters(t *testing.T) {
	// (b) ONE strict policy: denies "delete", allows "read".
	rules := `{
		"rules": [
			{"match": {"action": "delete"}, "effect": "deny", "reason": "no deletions"},
			{"match": {"action": "read"},   "effect": "allow", "reason": "reads ok"}
		],
		"default": "audit"
	}`
	p := buildPolicy("p-1", "multi-rule", "strict", rules)

	// Delete → denied
	rDel := req("delete", "", "")
	resDel := enforce.EvaluatePolicyDecision(p, rDel)
	if resDel.Allowed != false || resDel.Action != "denied" {
		t.Errorf("delete: expected denied, got allowed=%v action=%q", resDel.Allowed, resDel.Action)
	}

	// Read → allowed
	rRead := req("read", "", "")
	resRead := enforce.EvaluatePolicyDecision(p, rRead)
	if resRead.Allowed != true || resRead.Action != "allowed" {
		t.Errorf("read: expected allowed, got allowed=%v action=%q", resRead.Allowed, resRead.Action)
	}
}

func TestEvaluatePolicyDecision_AdvisoryDowngradesDeny(t *testing.T) {
	// (c) Advisory mode: a deny rule produces Allowed:true + Action:"audit".
	rules := `{
		"rules": [{"match": {"action": "delete"}, "effect": "deny", "reason": "no deletions"}]
	}`
	p := buildPolicy("p-advisory", "advisory", "advisory", rules)

	rDel := req("delete", "", "")
	result := enforce.EvaluatePolicyDecision(p, rDel)

	if result.Allowed != true {
		t.Errorf("advisory deny: expected allowed=true (downgraded), got %v", result.Allowed)
	}
	if result.Action != "audit" {
		t.Errorf("advisory deny: expected action=audit, got %q", result.Action)
	}
}

func TestEvaluatePolicyDecision_DisabledAllows(t *testing.T) {
	// (d) Disabled mode: even a deny rule produces Allowed:true.
	rules := `{
		"rules": [{"match": {"action": "delete"}, "effect": "deny", "reason": "no deletions"}]
	}`
	p := buildPolicy("p-disabled", "disabled", "disabled", rules)

	rDel := req("delete", "", "")
	result := enforce.EvaluatePolicyDecision(p, rDel)

	if result.Allowed != true {
		t.Errorf("disabled deny: expected allowed=true, got %v", result.Allowed)
	}
	if result.Action != "allowed" {
		t.Errorf("disabled deny: expected action=allowed, got %q", result.Action)
	}
}

func TestEvaluatePolicyDecision_MalformedRules(t *testing.T) {
	// (e) Malformed Rules JSON → no panic; fail-closed; strict mode denies.
	p := buildPolicy("p-bad", "bad-rules", "strict", "{{{not json}}")

	// Must not panic.
	rDel := req("anything", "", "")
	result := enforce.EvaluatePolicyDecision(p, rDel)

	if result.Allowed != false {
		t.Errorf("malformed strict: expected allowed=false (fail-closed), got %v", result.Allowed)
	}
	if result.Action != "denied" {
		t.Errorf("malformed strict: expected action=denied, got %q", result.Action)
	}
	if result.PolicyID != "p-bad" {
		t.Errorf("expected PolicyID=p-bad, got %q", result.PolicyID)
	}

	// Also verify advisory mode with malformed JSON does not hard-block.
	p2 := buildPolicy("p-bad-advisory", "bad-rules-advisory", "advisory", "{{{not json}}")
	result2 := enforce.EvaluatePolicyDecision(p2, rDel)
	if result2.Allowed != true {
		t.Errorf("malformed advisory: expected allowed=true (downgraded), got %v", result2.Allowed)
	}
	if result2.Action != "audit" {
		t.Errorf("malformed advisory: expected action=audit, got %q", result2.Action)
	}
}

func TestEvaluatePolicyDecision_DefaultEffect(t *testing.T) {
	// When no rule matches, the default ("allow") must be used.
	rules := `{
		"rules": [{"match": {"action": "delete"}, "effect": "deny"}],
		"default": "allow"
	}`
	p := buildPolicy("p-def", "with-default", "strict", rules)

	// Action "push" does not match the "delete" rule → default "allow"
	rPush := req("push", "", "")
	result := enforce.EvaluatePolicyDecision(p, rPush)
	if result.Allowed != true || result.Action != "allowed" {
		t.Errorf("default allow: expected allowed, got allowed=%v action=%q", result.Allowed, result.Action)
	}

	// Default unset → defaults to "allow"
	rulesNoDefault := `{
		"rules": [{"match": {"action": "delete"}, "effect": "deny"}]
	}`
	p2 := buildPolicy("p-nodef", "no-default", "strict", rulesNoDefault)
	result2 := enforce.EvaluatePolicyDecision(p2, rPush)
	if result2.Allowed != true || result2.Action != "allowed" {
		t.Errorf("unset default: expected allowed, got allowed=%v action=%q", result2.Allowed, result2.Action)
	}
}

func TestEvaluatePolicyDecision_WildcardAndGlobMatching(t *testing.T) {
	// Test prefix, suffix, universal wildcard, and case-insensitive matching.
	rules := `{
		"rules": [
			{"match": {"action": "git*"},      "effect": "deny",  "reason": "all git ops denied"},
			{"match": {"action": "*delete"},     "effect": "deny",  "reason": "delete-anything denied"},
			{"match": {"action": "*"},           "effect": "allow", "reason": "everything else allowed"}
		]
	}`
	p := buildPolicy("p-glob", "glob-policy", "strict", rules)

	// "git push" matches prefix "git*" → denied
	r1 := req("git push", "", "")
	res1 := enforce.EvaluatePolicyDecision(p, r1)
	if res1.Allowed != false {
		t.Errorf("git push: expected denied, got allowed=%v", res1.Allowed)
	}

	// "force-delete" matches suffix "*delete" → denied
	r2 := req("force-delete", "", "")
	res2 := enforce.EvaluatePolicyDecision(p, r2)
	if res2.Allowed != false {
		t.Errorf("force-delete: expected denied, got allowed=%v", res2.Allowed)
	}

	// "read" matches "*" → allowed
	r3 := req("read", "", "")
	res3 := enforce.EvaluatePolicyDecision(p, r3)
	if res3.Allowed != true {
		t.Errorf("read: expected allowed, got allowed=%v", res3.Allowed)
	}

	// Case insensitivity: "GIT PUSH" matches "git*" → denied
	r4 := req("GIT PUSH", "", "")
	res4 := enforce.EvaluatePolicyDecision(p, r4)
	if res4.Allowed != false {
		t.Errorf("GIT PUSH (case insensitive): expected denied, got allowed=%v", res4.Allowed)
	}
}

func TestEvaluatePolicyDecision_RepoAndContextMatch(t *testing.T) {
	// Rules may match on repo and context too. All set fields must match.
	rules := `{
		"rules": [
			{"match": {"action": "deploy", "repo": "prod*", "context": "production"}, "effect": "deny", "reason": "no prod deploys"},
			{"match": {"action": "deploy", "repo": "staging"},                           "effect": "allow", "reason": "staging ok"}
		],
		"default": "audit"
	}`
	p := buildPolicy("p-repo", "repo-aware", "strict", rules)

	// Deploy to prod-web → denied (matches repo="prod*" and context="production")
	r1 := req("deploy", "prod-web", "production")
	res1 := enforce.EvaluatePolicyDecision(p, r1)
	if res1.Allowed != false || res1.Action != "denied" {
		t.Errorf("prod deploy: expected denied, got allowed=%v action=%q", res1.Allowed, res1.Action)
	}

	// Deploy to staging → allowed (matches second rule)
	r2 := req("deploy", "staging", "")
	res2 := enforce.EvaluatePolicyDecision(p, r2)
	if res2.Allowed != true || res2.Action != "allowed" {
		t.Errorf("staging deploy: expected allowed, got allowed=%v action=%q", res2.Allowed, res2.Action)
	}

	// Deploy to prod-web with wrong context → does NOT match first rule (context mismatch), falls through to default "audit"
	r3 := req("deploy", "prod-web", "staging")
	res3 := enforce.EvaluatePolicyDecision(p, r3)
	if res3.Action != "audit" {
		t.Errorf("prod deploy with staging context: expected audit (default fallthrough), got action=%q", res3.Action)
	}
}
