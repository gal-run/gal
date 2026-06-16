// Conformance tests for the Postgres Store adapter, run against a real Postgres
// (set GOV_TEST_DATABASE_URL). The Makefile target `test-store` spins up an
// ephemeral Docker Postgres and sets this. Skipped if unset.
package store

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/gal-run/gal/services/governance-svc/internal/domain"
)

func newTestStore(t *testing.T) *PostgresStore {
	t.Helper()
	dsn := os.Getenv("GOV_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("GOV_TEST_DATABASE_URL not set; skipping Postgres conformance test")
	}
	mig, err := os.ReadFile(filepath.Join("migrations", "0001_init.sql"))
	if err != nil {
		t.Fatalf("read migration: %v", err)
	}
	s, err := NewPostgresStore(context.Background(), dsn, string(mig))
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	t.Cleanup(s.Close)
	return s
}

func TestPostgresConformance(t *testing.T) {
	ctx := context.Background()
	s := newTestStore(t)
	org := "org_test"

	// --- Policies: create / get / list / activate (single-active invariant) / delete ---
	id1, err := s.CreatePolicy(ctx, &domain.Policy{OrgID: org, Name: "p1", Enforcement: "advisory"})
	if err != nil {
		t.Fatalf("CreatePolicy: %v", err)
	}
	id2, err := s.CreatePolicy(ctx, &domain.Policy{OrgID: org, Name: "p2", Enforcement: "strict"})
	if err != nil {
		t.Fatalf("CreatePolicy2: %v", err)
	}
	got, err := s.GetPolicy(ctx, id1)
	if err != nil || got == nil || got.Name != "p1" {
		t.Fatalf("GetPolicy: %v got=%v", err, got)
	}
	pols, err := s.ListPolicies(ctx, org)
	if err != nil || len(pols) != 2 {
		t.Fatalf("ListPolicies: %v n=%d", err, len(pols))
	}
	if err := s.ActivatePolicy(ctx, org, id1); err != nil {
		t.Fatalf("ActivatePolicy1: %v", err)
	}
	if err := s.ActivatePolicy(ctx, org, id2); err != nil {
		t.Fatalf("ActivatePolicy2: %v", err)
	}
	// only id2 should be active now (the single-active invariant)
	pols, _ = s.ListPolicies(ctx, org)
	active := 0
	for _, p := range pols {
		if p.IsActive {
			active++
			if p.ID != id2 {
				t.Fatalf("wrong active policy: %s", p.ID)
			}
		}
	}
	if active != 1 {
		t.Fatalf("expected exactly 1 active policy, got %d", active)
	}
	if err := s.UpdatePolicy(ctx, id1, map[string]any{"description": "updated"}); err != nil {
		t.Fatalf("UpdatePolicy: %v", err)
	}
	got, _ = s.GetPolicy(ctx, id1)
	if got.Description != "updated" {
		t.Fatalf("UpdatePolicy didn't persist: %q", got.Description)
	}
	if err := s.DeletePolicy(ctx, id1); err != nil {
		t.Fatalf("DeletePolicy: %v", err)
	}
	if g, _ := s.GetPolicy(ctx, id1); g != nil {
		t.Fatalf("policy not deleted")
	}

	// --- Proposals: create / get / list filter / status update ---
	pid, err := s.CreateProposal(ctx, &domain.ConfigProposal{OrgID: org, Scope: "org", Status: "pending"})
	if err != nil {
		t.Fatalf("CreateProposal: %v", err)
	}
	if err := s.UpdateProposalStatus(ctx, pid, "approved", "shay", "lgtm"); err != nil {
		t.Fatalf("UpdateProposalStatus: %v", err)
	}
	pr, _ := s.GetProposal(ctx, pid)
	if pr == nil || pr.Status != "approved" || pr.ApprovedBy != "shay" {
		t.Fatalf("proposal status not updated: %+v", pr)
	}
	if ps, _ := s.ListProposals(ctx, org, "approved", ""); len(ps) != 1 {
		t.Fatalf("ListProposals filtered: n=%d", len(ps))
	}
	if ps, _ := s.ListProposals(ctx, org, "pending", ""); len(ps) != 0 {
		t.Fatalf("ListProposals pending should be 0: n=%d", len(ps))
	}

	// --- Approved config: latest wins ---
	if _, err := s.SetApprovedConfig(ctx, &domain.ApprovedConfig{OrgID: org, Platform: "claude", Version: "1"}); err != nil {
		t.Fatalf("SetApprovedConfig: %v", err)
	}
	if _, err := s.SetApprovedConfig(ctx, &domain.ApprovedConfig{OrgID: org, Platform: "claude", Version: "2"}); err != nil {
		t.Fatalf("SetApprovedConfig2: %v", err)
	}
	ac, _ := s.GetApprovedConfig(ctx, org, "claude")
	if ac == nil || ac.Version != "2" {
		t.Fatalf("GetApprovedConfig latest: %+v", ac)
	}

	// --- Auto-approval settings: default + upsert ---
	def, _ := s.GetAutoApprovalSettings(ctx, org)
	if def == nil || def.Enabled || def.ConfidenceThreshold != 0.8 {
		t.Fatalf("default settings: %+v", def)
	}
	if err := s.SetAutoApprovalSettings(ctx, org, &domain.AutoApprovalSettings{Enabled: true, ConfidenceThreshold: 0.9}); err != nil {
		t.Fatalf("SetAutoApprovalSettings: %v", err)
	}
	s2, _ := s.GetAutoApprovalSettings(ctx, org)
	if !s2.Enabled || s2.ConfidenceThreshold != 0.9 {
		t.Fatalf("settings not upserted: %+v", s2)
	}

	// --- Tool policies + developer compliance + audit + webhooks ---
	tpid, err := s.CreateToolPolicy(ctx, &domain.ToolPolicy{OrgID: org, Tool: "bash", Action: "deny"})
	if err != nil {
		t.Fatalf("CreateToolPolicy: %v", err)
	}
	if tps, _ := s.ListToolPolicies(ctx, org); len(tps) != 1 {
		t.Fatalf("ListToolPolicies: n=%d", len(tps))
	}
	if err := s.DeleteToolPolicy(ctx, tpid); err != nil {
		t.Fatalf("DeleteToolPolicy: %v", err)
	}
	if err := s.ReportDeveloperCompliance(ctx, org, &domain.DeveloperCompliance{DeveloperID: "d1", DriftDetected: true}); err != nil {
		t.Fatalf("ReportDeveloperCompliance: %v", err)
	}
	if err := s.ReportDeveloperCompliance(ctx, org, &domain.DeveloperCompliance{DeveloperID: "d1", DriftDetected: false}); err != nil {
		t.Fatalf("ReportDeveloperCompliance upsert: %v", err)
	}
	if dcs, _ := s.ListDeveloperCompliance(ctx, org); len(dcs) != 1 {
		t.Fatalf("ListDeveloperCompliance should upsert to 1: n=%d", len(dcs))
	}
	// developer rows must NOT leak into GetComplianceStatus
	if cs, _ := s.GetComplianceStatus(ctx, org); len(cs) != 0 {
		t.Fatalf("developer rows leaked into compliance status: n=%d", len(cs))
	}
}
