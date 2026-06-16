package agg

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

func WriteScanOutput(writer io.Writer, report *ScanReport, jsonOutput bool) error {
	if jsonOutput {
		return writeJSON(writer, report)
	}

	writeLine(writer, "Agent Git Graph Scan")
	writeLine(writer, fmt.Sprintf("workspace: %s", report.Source.Workspace))
	writeLine(writer, fmt.Sprintf("snapshot: %s | filter=%s | fetchRemotes=%t", report.Source.SnapshotGeneratedAt, coalesceString(report.Source.RepoFilter, "all"), report.Source.FetchRemotes))
	writeLine(writer, "")
	writeLine(writer, "Summary:")
	writeLine(writer, fmt.Sprintf("  repos: %d | clean: %d | attention: %d | worktrees: %d", report.Summary.RepoCount, report.Summary.CleanCount, report.Summary.AttentionCount, report.Summary.WorktreeCount))
	writeLine(writer, fmt.Sprintf("  first-party attention: %d | checkouts: %d | active worktrees: %d | integration worktrees: %d | forks: %d", report.Summary.FirstPartyAttentionCount, report.Summary.FirstPartyCheckoutAttentionCount, report.Summary.ActiveWorktreeAttentionCount, report.Summary.WorktreeIntegrationAttentionCount, report.Summary.ThirdPartyAttentionCount))
	writeLine(writer, fmt.Sprintf("  dirty: %d | sync gaps: %d | no upstream: %d | detached: %d", report.Summary.DirtyCount, report.Summary.SyncGapCount, report.Summary.NoUpstreamCount, report.Summary.DetachedCount))
	writeLine(writer, fmt.Sprintf("  evidence rows: %d | agentic layer warnings: %d", report.Summary.EvidenceCount, report.Summary.AgenticLayerWarningCount))
	writeLine(writer, "")
	writeLine(writer, "Primary checkout attention:")
	writeRepoSection(writer, report.CheckoutAttention)
	writeLine(writer, "")
	writeLine(writer, "Active worktree lanes:")
	writeRepoSection(writer, report.ActiveWorktreeAttention)
	writeLine(writer, "")
	writeLine(writer, "Worktree integration lanes:")
	writeRepoSection(writer, report.WorktreeIntegrationAttention)
	writeLine(writer, "")
	writeLine(writer, "Third-party fork attention:")
	writeRepoSection(writer, report.ExternalAttention)
	writeLine(writer, "")
	writeLine(writer, "Worktrees:")
	if len(report.Worktrees) == 0 {
		writeLine(writer, "  none")
	} else {
		limit := min(len(report.Worktrees), 15)
		for _, row := range report.Worktrees[:limit] {
			writeLine(writer, fmt.Sprintf("  - %s | branch=%s | status=%s | path=%s", row.Repository, branchDisplayName(row.Branch.Current), row.Cleanliness.Status, row.RelativePath))
		}
	}
	writeLine(writer, "")
	writeLine(writer, "Owners:")
	if len(report.Owners) == 0 {
		writeLine(writer, "  none")
	} else {
		limit := min(len(report.Owners), 12)
		for _, owner := range report.Owners[:limit] {
			writeLine(writer, fmt.Sprintf("  - %s: repos=%d attention=%d", owner.Owner, owner.RepoCount, owner.AttentionCount))
		}
	}
	return nil
}

func WriteGraphOutput(writer io.Writer, report *GraphReport, jsonOutput bool) error {
	if jsonOutput {
		return writeJSON(writer, report)
	}

	writeLine(writer, "Agent Git Graph")
	writeLine(writer, fmt.Sprintf("repo: %s", report.Repository.Repository))
	writeLine(writer, fmt.Sprintf("workspace: %s", report.Source.Workspace))
	writeLine(writer, fmt.Sprintf("snapshot: %s | filter=%s", report.Source.SnapshotGeneratedAt, coalesceString(report.Source.RepoFilter, "all")))
	writeLine(writer, "")
	writeLine(writer, "Summary:")
	writeLine(writer, fmt.Sprintf("  branches: %d | lanes: %d | worktrees: %d | attention: %d", report.Summary.BranchCount, report.Summary.LaneCount, report.Summary.WorktreeCount, report.Summary.AttentionCount))
	writeLine(writer, fmt.Sprintf("  primary checkouts: %d | clean lanes: %d | default branch: %s", report.Summary.PrimaryCheckoutCount, report.Summary.CleanCount, defaultBranchLabel(report.Repository.DefaultBranch)))
	writeLine(writer, "")
	writeLine(writer, "Topology:")
	writeLine(writer, fmt.Sprintf("repo %s", report.Repository.Repository))
	for _, branch := range report.Branches {
		writeLine(writer, fmt.Sprintf("  - branch %s", graphBranchLabel(branch)))
		for _, lane := range branch.Lanes {
			reasons := ""
			if len(lane.Cleanliness.Reasons) > 0 {
				reasons = fmt.Sprintf(" reasons=%s", strings.Join(lane.Cleanliness.Reasons, ","))
			}
			writeLine(writer, fmt.Sprintf("    - %s %s | status=%s upstream=%s%s", lane.CheckoutType, lane.RelativePath, lane.Cleanliness.Status, coalesceString(lane.Branch.Upstream, "none"), reasons))
		}
	}
	return nil
}

func WriteHandoffOutput(writer io.Writer, report *HandoffReport, jsonOutput bool) error {
	if jsonOutput {
		return writeJSON(writer, report)
	}

	writeLine(writer, "Agent Git Handoff")
	writeLine(writer, fmt.Sprintf("repo: %s", report.Repository.Repository))
	writeLine(writer, fmt.Sprintf("workspace: %s", report.Source.Workspace))
	writeLine(writer, fmt.Sprintf("snapshot: %s | filter=%s", report.Source.SnapshotGeneratedAt, coalesceString(report.Source.RepoFilter, "all")))
	writeLine(writer, "")
	writeLine(writer, "Summary:")
	writeLine(writer, fmt.Sprintf("  repo status: %s", report.Repository.Status))
	writeLine(writer, fmt.Sprintf("  lanes: %d | safe to handoff: %d | safe to commit: %d | blocked: %d", report.Summary.LaneCount, report.Summary.SafeToHandoffCount, report.Summary.SafeToCommitCount, report.Summary.BlockedCount))
	writeLine(writer, "")
	writeLine(writer, "Lanes:")
	for _, lane := range report.Lanes {
		writeLine(writer, fmt.Sprintf("  - %s %s | branch=%s | status=%s | blockers=%s | handoff-gaps=%s", handoffLaneType(lane.Worktree.IsWorktree), lane.RelativePath, branchDisplayName(lane.Branch.Current), lane.Handoff.Status, joinOrNone(lane.Handoff.Blockers), joinOrNone(lane.Handoff.HandoffGaps)))
		writeLine(writer, fmt.Sprintf("    next: %s", joinRecommendations(lane.Handoff.Recommendations)))
	}
	writeLine(writer, "")
	writeLine(writer, "Repo next steps:")
	if len(report.Recommendations) == 0 {
		writeLine(writer, "  - none")
	} else {
		for _, recommendation := range report.Recommendations {
			writeLine(writer, "  - "+recommendation)
		}
	}
	return nil
}

func writeJSON(writer io.Writer, value any) error {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	_, err = writer.Write(append(encoded, '\n'))
	return err
}

func writeRepoSection(writer io.Writer, rows []RepoRow) {
	if len(rows) == 0 {
		writeLine(writer, "  none")
		return
	}
	limit := min(len(rows), 15)
	for _, row := range rows[:limit] {
		writeLine(writer, fmt.Sprintf("  - %s | branch=%s | reasons=%s | path=%s", row.Repository, branchDisplayName(row.Branch.Current), reasonsText(row.Cleanliness.Reasons), row.RelativePath))
	}
}

func graphBranchLabel(branch GraphBranch) string {
	switch {
	case branch.IsDefault:
		return branch.Name + " [default]"
	case branch.AttentionCount > 0:
		return branch.Name + " [attention]"
	default:
		return branch.Name
	}
}

func handoffLaneType(isWorktree bool) string {
	if isWorktree {
		return "worktree"
	}
	return "checkout"
}

func defaultBranchLabel(value *string) string {
	if value == nil || strings.TrimSpace(*value) == "" {
		return "unknown"
	}
	return *value
}

func reasonsText(reasons []string) string {
	if len(reasons) == 0 {
		return "clean"
	}
	return strings.Join(reasons, ",")
}

func joinOrNone(values []string) string {
	if len(values) == 0 {
		return "none"
	}
	return strings.Join(values, ",")
}

func joinRecommendations(values []string) string {
	if len(values) == 0 {
		return "none"
	}
	return strings.Join(values, " | ")
}

func coalesceString(value *string, fallback string) string {
	if value == nil || strings.TrimSpace(*value) == "" {
		return fallback
	}
	return *value
}

func writeLine(writer io.Writer, line string) {
	fmt.Fprintln(writer, line)
}

func min(left, right int) int {
	if left < right {
		return left
	}
	return right
}
