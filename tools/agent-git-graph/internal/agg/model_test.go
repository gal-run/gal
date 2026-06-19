package agg

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBuildScanReport(t *testing.T) {
	snapshot := loadFixtureSnapshot(t, filepath.Join("..", "..", "tests", "fixtures", "sample-snapshot.json"))

	report, err := BuildScanReport(snapshot, "/tmp/sample-snapshot.json", "")
	if err != nil {
		t.Fatalf("BuildScanReport returned error: %v", err)
	}

	if report.SchemaVersion != scanSchemaVersion {
		t.Fatalf("expected scan schema %q, got %q", scanSchemaVersion, report.SchemaVersion)
	}
	if report.Summary.RepoCount != 3 || report.Summary.AttentionCount != 2 {
		t.Fatalf("unexpected scan summary: %+v", report.Summary)
	}
	if report.Summary.WorktreeCount != 1 || report.Summary.EvidenceCount != 1 {
		t.Fatalf("unexpected worktree/evidence summary: %+v", report.Summary)
	}
	if got := coalesceString(report.Source.RepoFilter, ""); got != "" {
		t.Fatalf("expected nil repo filter, got %q", got)
	}
}

func TestBuildGraphReport(t *testing.T) {
	snapshot := loadFixtureSnapshot(t, filepath.Join("..", "..", "tests", "fixtures", "sample-snapshot.json"))
	scanReport, err := BuildScanReport(snapshot, "/tmp/sample-snapshot.json", "gal-run/gal-cli")
	if err != nil {
		t.Fatalf("BuildScanReport returned error: %v", err)
	}

	graphReport, err := BuildGraphReport(scanReport)
	if err != nil {
		t.Fatalf("BuildGraphReport returned error: %v", err)
	}

	if graphReport.Repository.Repository != "gal-run/gal-cli" {
		t.Fatalf("unexpected graph repository: %+v", graphReport.Repository)
	}
	if graphReport.Summary.BranchCount != 1 || graphReport.Summary.LaneCount != 1 || graphReport.Summary.AttentionCount != 1 {
		t.Fatalf("unexpected graph summary: %+v", graphReport.Summary)
	}
}

func TestBuildHandoffReport(t *testing.T) {
	snapshot := loadFixtureSnapshot(t, filepath.Join("..", "..", "tests", "fixtures", "handoff-snapshot.json"))
	scanReport, err := BuildScanReport(snapshot, "/tmp/handoff-snapshot.json", "gal-run/gal-handoff-demo")
	if err != nil {
		t.Fatalf("BuildScanReport returned error: %v", err)
	}

	handoffReport, err := BuildHandoffReport(scanReport)
	if err != nil {
		t.Fatalf("BuildHandoffReport returned error: %v", err)
	}

	if handoffReport.Repository.Status != "blocked" {
		t.Fatalf("unexpected repo status: %+v", handoffReport.Repository)
	}
	if handoffReport.Summary.SafeToHandoffCount != 1 || handoffReport.Summary.BlockedCount != 2 {
		t.Fatalf("unexpected handoff summary: %+v", handoffReport.Summary)
	}
}

func loadFixtureSnapshot(t *testing.T, relativePath string) *Snapshot {
	t.Helper()

	rawFixture, err := os.ReadFile(relativePath)
	if err != nil {
		t.Fatalf("failed to read fixture %s: %v", relativePath, err)
	}

	snapshot, err := ParseSnapshot(rawFixture)
	if err != nil {
		t.Fatalf("failed to parse fixture %s: %v", relativePath, err)
	}
	return snapshot
}
