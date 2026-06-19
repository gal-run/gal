package agg

import (
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	workspaceSnapshotSchema = "git-evidence-snapshot.v1"
	scanSchemaVersion       = "agent-git-graph.scan.v1"
	graphSchemaVersion      = "agent-git-graph.graph.v1"
	handoffSchemaVersion    = "agent-git-graph.handoff.v1"
)

type Snapshot struct {
	SchemaVersion string         `json:"schemaVersion"`
	Workspace     string         `json:"workspace"`
	GeneratedAt   string         `json:"generatedAt"`
	FetchRemotes  bool           `json:"fetchRemotes"`
	Repos         []SnapshotRepo `json:"repos"`
}

type SnapshotRepo struct {
	Path          string               `json:"path"`
	RelativePath  string               `json:"relativePath"`
	Kind          string               `json:"kind"`
	Remote        string               `json:"remote"`
	GitHub        SnapshotGitHub       `json:"github"`
	Branch        SnapshotBranch       `json:"branch"`
	HeadSHA       string               `json:"headSha"`
	Worktree      SnapshotWorktree     `json:"worktree"`
	Dirt          SnapshotDirt         `json:"dirt"`
	Evidence      SnapshotEvidence     `json:"evidence"`
	AgenticLayers SnapshotAgenticLayer `json:"agenticLayers"`
}

type SnapshotGitHub struct {
	Slug  string `json:"slug"`
	Owner string `json:"owner"`
	Name  string `json:"name"`
}

type SnapshotBranch struct {
	Current     *string `json:"current"`
	Default     *string `json:"default"`
	Upstream    *string `json:"upstream"`
	HasUpstream bool    `json:"hasUpstream"`
	Ahead       int     `json:"ahead"`
	Behind      int     `json:"behind"`
}

type SnapshotWorktree struct {
	IsWorktree bool `json:"isWorktree"`
}

type SnapshotDirt struct {
	Modified            bool `json:"modified"`
	UntrackedCount      int  `json:"untrackedCount"`
	StashCount          int  `json:"stashCount"`
	SubmoduleDriftCount int  `json:"submoduleDriftCount"`
}

type SnapshotEvidence struct {
	EntireCheckpoint       *string  `json:"entireCheckpoint"`
	EntireCheckpointRefs   []string `json:"entireCheckpointRefs"`
	EntireCheckpointRemote *string  `json:"entireCheckpointRemote"`
	GalSession             *string  `json:"galSession"`
	GalAgentLayer          *string  `json:"galAgentLayer"`
	GalEvidence            *string  `json:"galEvidence"`
}

type SnapshotAgenticLayer struct {
	Count          int `json:"count"`
	TrackedCount   int `json:"trackedCount"`
	UntrackedCount int `json:"untrackedCount"`
}

type SourceInfo struct {
	Workspace           string  `json:"workspace"`
	SnapshotFile        string  `json:"snapshotFile"`
	SnapshotGeneratedAt string  `json:"snapshotGeneratedAt"`
	FetchRemotes        bool    `json:"fetchRemotes"`
	RepoFilter          *string `json:"repoFilter"`
}

type ScanReport struct {
	SchemaVersion                string         `json:"schemaVersion"`
	GeneratedAt                  string         `json:"generatedAt"`
	Source                       SourceInfo     `json:"source"`
	Summary                      ScanSummary    `json:"summary"`
	Owners                       []OwnerSummary `json:"owners"`
	Attention                    []RepoRow      `json:"attention"`
	FirstPartyAttention          []RepoRow      `json:"firstPartyAttention"`
	CheckoutAttention            []RepoRow      `json:"checkoutAttention"`
	ActiveWorktreeAttention      []RepoRow      `json:"activeWorktreeAttention"`
	WorktreeIntegrationAttention []RepoRow      `json:"worktreeIntegrationAttention"`
	ExternalAttention            []RepoRow      `json:"externalAttention"`
	Worktrees                    []RepoRow      `json:"worktrees"`
	Repositories                 []RepoRow      `json:"repositories"`
}

type ScanSummary struct {
	RepoCount                         int `json:"repoCount"`
	CleanCount                        int `json:"cleanCount"`
	AttentionCount                    int `json:"attentionCount"`
	FirstPartyAttentionCount          int `json:"firstPartyAttentionCount"`
	ThirdPartyAttentionCount          int `json:"thirdPartyAttentionCount"`
	FirstPartyCheckoutAttentionCount  int `json:"firstPartyCheckoutAttentionCount"`
	ActiveWorktreeAttentionCount      int `json:"activeWorktreeAttentionCount"`
	WorktreeIntegrationAttentionCount int `json:"worktreeIntegrationAttentionCount"`
	DirtyCount                        int `json:"dirtyCount"`
	SyncGapCount                      int `json:"syncGapCount"`
	NoUpstreamCount                   int `json:"noUpstreamCount"`
	DetachedCount                     int `json:"detachedCount"`
	WorktreeCount                     int `json:"worktreeCount"`
	EvidenceCount                     int `json:"evidenceCount"`
	AgenticLayerWarningCount          int `json:"agenticLayerWarningCount"`
}

type OwnerSummary struct {
	Owner          string `json:"owner"`
	RepoCount      int    `json:"repoCount"`
	AttentionCount int    `json:"attentionCount"`
}

type RepoRow struct {
	Repository     string         `json:"repository"`
	Owner          string         `json:"owner"`
	RelativePath   string         `json:"relativePath"`
	Path           string         `json:"path"`
	Kind           string         `json:"kind"`
	Branch         BranchInfo     `json:"branch"`
	Worktree       WorktreeInfo   `json:"worktree"`
	Dirt           DirtInfo       `json:"dirt"`
	Evidence       EvidenceInfo   `json:"evidence"`
	AgenticLayers  AgenticInfo    `json:"agenticLayers"`
	Classification Classification `json:"classification"`
	Cleanliness    Cleanliness    `json:"cleanliness"`
}

type BranchInfo struct {
	Current     *string `json:"current"`
	Default     *string `json:"default"`
	Upstream    *string `json:"upstream"`
	HasUpstream bool    `json:"hasUpstream"`
	Ahead       int     `json:"ahead"`
	Behind      int     `json:"behind"`
	Detached    bool    `json:"detached"`
}

type WorktreeInfo struct {
	IsWorktree bool `json:"isWorktree"`
}

type DirtInfo struct {
	Modified            bool `json:"modified"`
	UntrackedCount      int  `json:"untrackedCount"`
	StashCount          int  `json:"stashCount"`
	SubmoduleDriftCount int  `json:"submoduleDriftCount"`
}

type EvidenceInfo struct {
	HasEvidence                bool `json:"hasEvidence"`
	EntireCheckpointRefs       int  `json:"entireCheckpointRefs"`
	CheckpointRemoteConfigured bool `json:"checkpointRemoteConfigured"`
	GalSession                 bool `json:"galSession"`
	GalAgentLayer              bool `json:"galAgentLayer"`
	GalEvidence                bool `json:"galEvidence"`
}

type AgenticInfo struct {
	Count          int `json:"count"`
	TrackedCount   int `json:"trackedCount"`
	UntrackedCount int `json:"untrackedCount"`
}

type Classification struct {
	Ownership              string  `json:"ownership"`
	LaneType               string  `json:"laneType"`
	AttentionScope         string  `json:"attentionScope"`
	WorktreeAttentionClass *string `json:"worktreeAttentionClass"`
}

type Cleanliness struct {
	Status         string   `json:"status"`
	Clean          bool     `json:"clean"`
	Reasons        []string `json:"reasons"`
	AttentionScore int      `json:"attentionScore"`
}

type GraphReport struct {
	SchemaVersion string          `json:"schemaVersion"`
	GeneratedAt   string          `json:"generatedAt"`
	Source        SourceInfo      `json:"source"`
	Repository    GraphRepository `json:"repository"`
	Summary       GraphSummary    `json:"summary"`
	Branches      []GraphBranch   `json:"branches"`
	Lanes         []RepoRow       `json:"lanes"`
	Edges         []GraphEdge     `json:"edges"`
}

type GraphRepository struct {
	Repository           string  `json:"repository"`
	Owner                string  `json:"owner"`
	DefaultBranch        *string `json:"defaultBranch"`
	LaneCount            int     `json:"laneCount"`
	PrimaryCheckoutCount int     `json:"primaryCheckoutCount"`
	WorktreeCount        int     `json:"worktreeCount"`
}

type GraphSummary struct {
	BranchCount          int `json:"branchCount"`
	LaneCount            int `json:"laneCount"`
	WorktreeCount        int `json:"worktreeCount"`
	AttentionCount       int `json:"attentionCount"`
	CleanCount           int `json:"cleanCount"`
	PrimaryCheckoutCount int `json:"primaryCheckoutCount"`
}

type GraphBranch struct {
	Name           string      `json:"name"`
	IsDefault      bool        `json:"isDefault"`
	LaneCount      int         `json:"laneCount"`
	WorktreeCount  int         `json:"worktreeCount"`
	AttentionCount int         `json:"attentionCount"`
	Upstreams      []string    `json:"upstreams"`
	Reasons        []string    `json:"reasons"`
	Lanes          []GraphLane `json:"lanes"`
}

type GraphLane struct {
	Repository    string       `json:"repository"`
	RelativePath  string       `json:"relativePath"`
	Path          string       `json:"path"`
	Kind          string       `json:"kind"`
	CheckoutType  string       `json:"checkoutType"`
	Branch        BranchInfo   `json:"branch"`
	Dirt          DirtInfo     `json:"dirt"`
	Evidence      EvidenceInfo `json:"evidence"`
	AgenticLayers AgenticInfo  `json:"agenticLayers"`
	Cleanliness   Cleanliness  `json:"cleanliness"`
}

type GraphEdge struct {
	From string `json:"from"`
	To   string `json:"to"`
	Kind string `json:"kind"`
}

type HandoffReport struct {
	SchemaVersion   string            `json:"schemaVersion"`
	GeneratedAt     string            `json:"generatedAt"`
	Source          SourceInfo        `json:"source"`
	Repository      HandoffRepository `json:"repository"`
	Summary         HandoffSummary    `json:"summary"`
	Recommendations []string          `json:"recommendations"`
	Lanes           []HandoffLane     `json:"lanes"`
}

type HandoffRepository struct {
	Repository string `json:"repository"`
	Owner      string `json:"owner"`
	Status     string `json:"status"`
}

type HandoffSummary struct {
	LaneCount          int `json:"laneCount"`
	SafeToHandoffCount int `json:"safeToHandoffCount"`
	SafeToCommitCount  int `json:"safeToCommitCount"`
	BlockedCount       int `json:"blockedCount"`
}

type HandoffLane struct {
	Repository     string         `json:"repository"`
	Owner          string         `json:"owner"`
	RelativePath   string         `json:"relativePath"`
	Path           string         `json:"path"`
	Kind           string         `json:"kind"`
	Branch         BranchInfo     `json:"branch"`
	Worktree       WorktreeInfo   `json:"worktree"`
	Dirt           DirtInfo       `json:"dirt"`
	Evidence       EvidenceInfo   `json:"evidence"`
	AgenticLayers  AgenticInfo    `json:"agenticLayers"`
	Classification Classification `json:"classification"`
	Cleanliness    Cleanliness    `json:"cleanliness"`
	Handoff        HandoffStatus  `json:"handoff"`
}

type HandoffStatus struct {
	Status          string   `json:"status"`
	Blockers        []string `json:"blockers"`
	HandoffGaps     []string `json:"handoffGaps"`
	Recommendations []string `json:"recommendations"`
}

func ParseSnapshot(raw []byte) (*Snapshot, error) {
	var snapshot Snapshot
	if err := json.Unmarshal(raw, &snapshot); err != nil {
		return nil, err
	}
	if snapshot.SchemaVersion != workspaceSnapshotSchema {
		return nil, fmt.Errorf("invalid git-evidence snapshot schema: %s", snapshot.SchemaVersion)
	}
	return &snapshot, nil
}

func BuildScanReport(snapshot *Snapshot, snapshotFile string, repoFilter string) (*ScanReport, error) {
	selected := make([]RepoRow, 0, len(snapshot.Repos))
	for _, repo := range snapshot.Repos {
		if repoFilter != "" && !matchesRepoFilter(repo, repoFilter) {
			continue
		}
		selected = append(selected, buildRepoRow(repo))
	}

	if repoFilter != "" && len(selected) == 0 {
		return nil, fmt.Errorf("repo not found in snapshot: %s", repoFilter)
	}

	sortRepoRows(selected)
	attention := filterAndSort(selected, func(row RepoRow) bool { return !row.Cleanliness.Clean })
	firstPartyAttention := filterAndSort(selected, func(row RepoRow) bool {
		return !row.Cleanliness.Clean && row.Classification.Ownership == "first_party"
	})
	checkoutAttention := filterAndSort(selected, func(row RepoRow) bool {
		return !row.Cleanliness.Clean && row.Classification.AttentionScope == "first_party_checkout"
	})
	activeWorktreeAttention := filterAndSort(selected, func(row RepoRow) bool {
		return stringValue(row.Classification.WorktreeAttentionClass) == "active_edit_lane"
	})
	worktreeIntegrationAttention := filterAndSort(selected, func(row RepoRow) bool {
		return stringValue(row.Classification.WorktreeAttentionClass) == "integration_lane"
	})
	externalAttention := filterAndSort(selected, func(row RepoRow) bool {
		return !row.Cleanliness.Clean && row.Classification.Ownership == "third_party_fork"
	})
	worktrees := filterRepoRows(selected, func(row RepoRow) bool { return row.Worktree.IsWorktree })
	sortRepoRows(worktrees)

	repoFilterPointer := stringPointerOrNil(repoFilter)
	report := &ScanReport{
		SchemaVersion: scanSchemaVersion,
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		Source: SourceInfo{
			Workspace:           snapshot.Workspace,
			SnapshotFile:        snapshotFile,
			SnapshotGeneratedAt: snapshot.GeneratedAt,
			FetchRemotes:        snapshot.FetchRemotes,
			RepoFilter:          repoFilterPointer,
		},
		Summary: ScanSummary{
			RepoCount:                         len(selected),
			CleanCount:                        countRepoRows(selected, func(row RepoRow) bool { return row.Cleanliness.Clean }),
			AttentionCount:                    len(attention),
			FirstPartyAttentionCount:          len(firstPartyAttention),
			ThirdPartyAttentionCount:          len(externalAttention),
			FirstPartyCheckoutAttentionCount:  len(checkoutAttention),
			ActiveWorktreeAttentionCount:      len(activeWorktreeAttention),
			WorktreeIntegrationAttentionCount: len(worktreeIntegrationAttention),
			DirtyCount:                        countRepoRows(selected, func(row RepoRow) bool { return isDirtyRow(row) }),
			SyncGapCount:                      countRepoRows(selected, func(row RepoRow) bool { return row.Branch.Ahead > 0 || row.Branch.Behind > 0 }),
			NoUpstreamCount:                   countRepoRows(selected, func(row RepoRow) bool { return !row.Branch.HasUpstream }),
			DetachedCount:                     countRepoRows(selected, func(row RepoRow) bool { return row.Branch.Detached }),
			WorktreeCount:                     countRepoRows(selected, func(row RepoRow) bool { return row.Worktree.IsWorktree }),
			EvidenceCount:                     countRepoRows(selected, func(row RepoRow) bool { return row.Evidence.HasEvidence }),
			AgenticLayerWarningCount:          countRepoRows(selected, func(row RepoRow) bool { return row.AgenticLayers.UntrackedCount > 0 }),
		},
		Owners:                       buildOwnerSummaries(selected),
		Attention:                    attention,
		FirstPartyAttention:          firstPartyAttention,
		CheckoutAttention:            checkoutAttention,
		ActiveWorktreeAttention:      activeWorktreeAttention,
		WorktreeIntegrationAttention: worktreeIntegrationAttention,
		ExternalAttention:            externalAttention,
		Worktrees:                    worktrees,
		Repositories:                 append([]RepoRow(nil), selected...),
	}

	return report, nil
}

func BuildGraphReport(scanReport *ScanReport) (*GraphReport, error) {
	if scanReport.Summary.RepoCount == 0 {
		return nil, errors.New("repo not found in scan model")
	}

	defaultBranch := pickDefaultBranch(scanReport.Repositories)
	repository := firstUniqueRepository(scanReport.Repositories)
	owner := firstUniqueOwner(scanReport.Repositories)
	branches := buildGraphBranches(scanReport.Repositories, defaultBranch)
	edges := buildGraphEdges(repository, branches)

	report := &GraphReport{
		SchemaVersion: graphSchemaVersion,
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		Source:        scanReport.Source,
		Repository: GraphRepository{
			Repository:           repository,
			Owner:                owner,
			DefaultBranch:        defaultBranch,
			LaneCount:            len(scanReport.Repositories),
			PrimaryCheckoutCount: countRepoRows(scanReport.Repositories, func(row RepoRow) bool { return !row.Worktree.IsWorktree }),
			WorktreeCount:        countRepoRows(scanReport.Repositories, func(row RepoRow) bool { return row.Worktree.IsWorktree }),
		},
		Summary: GraphSummary{
			BranchCount:          len(branches),
			LaneCount:            len(scanReport.Repositories),
			WorktreeCount:        countRepoRows(scanReport.Repositories, func(row RepoRow) bool { return row.Worktree.IsWorktree }),
			AttentionCount:       countRepoRows(scanReport.Repositories, func(row RepoRow) bool { return !row.Cleanliness.Clean }),
			CleanCount:           countRepoRows(scanReport.Repositories, func(row RepoRow) bool { return row.Cleanliness.Clean }),
			PrimaryCheckoutCount: countRepoRows(scanReport.Repositories, func(row RepoRow) bool { return !row.Worktree.IsWorktree }),
		},
		Branches: branches,
		Lanes:    append([]RepoRow(nil), scanReport.Repositories...),
		Edges:    edges,
	}

	return report, nil
}

func BuildHandoffReport(scanReport *ScanReport) (*HandoffReport, error) {
	if scanReport.Summary.RepoCount == 0 {
		return nil, errors.New("repo not found in scan model")
	}

	lanes := make([]HandoffLane, 0, len(scanReport.Repositories))
	for _, row := range scanReport.Repositories {
		lanes = append(lanes, buildHandoffLane(row))
	}
	sort.Slice(lanes, func(i, j int) bool {
		return compareRepoKeys(lanes[i].Repository, lanes[i].RelativePath, lanes[j].Repository, lanes[j].RelativePath)
	})

	recommendations := uniqueStrings(flattenLaneRecommendations(lanes))
	status := repoHandoffStatus(lanes)
	report := &HandoffReport{
		SchemaVersion: handoffSchemaVersion,
		GeneratedAt:   time.Now().UTC().Format(time.RFC3339),
		Source:        scanReport.Source,
		Repository: HandoffRepository{
			Repository: firstUniqueRepository(scanReport.Repositories),
			Owner:      firstUniqueOwner(scanReport.Repositories),
			Status:     status,
		},
		Summary: HandoffSummary{
			LaneCount:          len(lanes),
			SafeToHandoffCount: countHandoffLanes(lanes, "safe_to_handoff"),
			SafeToCommitCount:  countHandoffLanes(lanes, "safe_to_commit"),
			BlockedCount:       countHandoffLanes(lanes, "blocked"),
		},
		Recommendations: recommendations,
		Lanes:           lanes,
	}

	return report, nil
}

func buildRepoRow(repo SnapshotRepo) RepoRow {
	reasons := repoReasons(repo)
	detached := isDetached(repo)
	owner := repoOwner(repo)
	repository := repoID(repo)
	ownership := "first_party"
	if repo.Kind == "third_party_fork" {
		ownership = "third_party_fork"
	}
	laneType := "primary_checkout"
	if repo.Worktree.IsWorktree {
		laneType = "worktree"
	}
	attentionScope := "clean"
	switch {
	case len(reasons) == 0:
		attentionScope = "clean"
	case ownership == "third_party_fork":
		attentionScope = "third_party_fork"
	case repo.Worktree.IsWorktree:
		attentionScope = "first_party_worktree"
	default:
		attentionScope = "first_party_checkout"
	}
	worktreeAttentionClass := (*string)(nil)
	if repo.Worktree.IsWorktree && len(reasons) > 0 {
		if hasEditDirt(repo) {
			worktreeAttentionClass = stringPointer("active_edit_lane")
		} else {
			worktreeAttentionClass = stringPointer("integration_lane")
		}
	}

	return RepoRow{
		Repository:   repository,
		Owner:        owner,
		RelativePath: repo.RelativePath,
		Path:         repo.Path,
		Kind:         repo.Kind,
		Branch: BranchInfo{
			Current:     cloneStringPointer(repo.Branch.Current),
			Default:     cloneStringPointer(repo.Branch.Default),
			Upstream:    cloneStringPointer(repo.Branch.Upstream),
			HasUpstream: repo.Branch.HasUpstream,
			Ahead:       repo.Branch.Ahead,
			Behind:      repo.Branch.Behind,
			Detached:    detached,
		},
		Worktree: WorktreeInfo{
			IsWorktree: repo.Worktree.IsWorktree,
		},
		Dirt: DirtInfo{
			Modified:            repo.Dirt.Modified,
			UntrackedCount:      repo.Dirt.UntrackedCount,
			StashCount:          repo.Dirt.StashCount,
			SubmoduleDriftCount: repo.Dirt.SubmoduleDriftCount,
		},
		Evidence: EvidenceInfo{
			HasEvidence:                hasEvidence(repo),
			EntireCheckpointRefs:       len(repo.Evidence.EntireCheckpointRefs),
			CheckpointRemoteConfigured: repo.Evidence.EntireCheckpointRemote != nil,
			GalSession:                 repo.Evidence.GalSession != nil,
			GalAgentLayer:              repo.Evidence.GalAgentLayer != nil,
			GalEvidence:                repo.Evidence.GalEvidence != nil,
		},
		AgenticLayers: AgenticInfo{
			Count:          repo.AgenticLayers.Count,
			TrackedCount:   repo.AgenticLayers.TrackedCount,
			UntrackedCount: repo.AgenticLayers.UntrackedCount,
		},
		Classification: Classification{
			Ownership:              ownership,
			LaneType:               laneType,
			AttentionScope:         attentionScope,
			WorktreeAttentionClass: worktreeAttentionClass,
		},
		Cleanliness: Cleanliness{
			Status:         cleanlinessStatus(reasons),
			Clean:          len(reasons) == 0,
			Reasons:        reasons,
			AttentionScore: attentionScore(repo),
		},
	}
}

func buildGraphBranches(rows []RepoRow, defaultBranch *string) []GraphBranch {
	grouped := map[string][]GraphLane{}
	for _, row := range rows {
		branchName := branchDisplayName(row.Branch.Current)
		grouped[branchName] = append(grouped[branchName], GraphLane{
			Repository:    row.Repository,
			RelativePath:  row.RelativePath,
			Path:          row.Path,
			Kind:          row.Kind,
			CheckoutType:  checkoutType(row.Worktree.IsWorktree),
			Branch:        row.Branch,
			Dirt:          row.Dirt,
			Evidence:      row.Evidence,
			AgenticLayers: row.AgenticLayers,
			Cleanliness:   row.Cleanliness,
		})
	}

	branchNames := make([]string, 0, len(grouped))
	for name := range grouped {
		branchNames = append(branchNames, name)
	}
	sort.Slice(branchNames, func(i, j int) bool {
		leftDefault := stringValue(defaultBranch) != "" && branchNames[i] == stringValue(defaultBranch)
		rightDefault := stringValue(defaultBranch) != "" && branchNames[j] == stringValue(defaultBranch)
		if leftDefault != rightDefault {
			return leftDefault
		}
		return branchNames[i] < branchNames[j]
	})

	branches := make([]GraphBranch, 0, len(branchNames))
	for _, name := range branchNames {
		lanes := grouped[name]
		sort.Slice(lanes, func(i, j int) bool { return lanes[i].RelativePath < lanes[j].RelativePath })
		upstreams := uniqueStrings(graphLaneStrings(lanes, func(l GraphLane) string { return stringValue(l.Branch.Upstream) }))
		reasons := uniqueStrings(flattenGraphReasons(lanes))
		branch := GraphBranch{
			Name:           name,
			IsDefault:      stringValue(defaultBranch) != "" && name == stringValue(defaultBranch),
			LaneCount:      len(lanes),
			WorktreeCount:  countGraphLanes(lanes, func(l GraphLane) bool { return l.CheckoutType == "worktree" }),
			AttentionCount: countGraphLanes(lanes, func(l GraphLane) bool { return !l.Cleanliness.Clean }),
			Upstreams:      upstreams,
			Reasons:        reasons,
			Lanes:          lanes,
		}
		branches = append(branches, branch)
	}

	return branches
}

func buildGraphEdges(repository string, branches []GraphBranch) []GraphEdge {
	edges := make([]GraphEdge, 0, len(branches)*2)
	for _, branch := range branches {
		kind := "branch"
		if branch.IsDefault {
			kind = "default_branch"
		}
		edges = append(edges, GraphEdge{
			From: repository,
			To:   "branch:" + branch.Name,
			Kind: kind,
		})
		for _, lane := range branch.Lanes {
			laneKind := "primary_lane"
			if lane.CheckoutType == "worktree" {
				laneKind = "worktree_lane"
			}
			edges = append(edges, GraphEdge{
				From: "branch:" + branch.Name,
				To:   "lane:" + lane.RelativePath,
				Kind: laneKind,
			})
		}
	}
	return edges
}

func buildHandoffLane(row RepoRow) HandoffLane {
	status := handoffStatusForRow(row)
	return HandoffLane{
		Repository:     row.Repository,
		Owner:          row.Owner,
		RelativePath:   row.RelativePath,
		Path:           row.Path,
		Kind:           row.Kind,
		Branch:         row.Branch,
		Worktree:       row.Worktree,
		Dirt:           row.Dirt,
		Evidence:       row.Evidence,
		AgenticLayers:  row.AgenticLayers,
		Classification: row.Classification,
		Cleanliness:    row.Cleanliness,
		Handoff: HandoffStatus{
			Status:          status,
			Blockers:        blockersForRow(row),
			HandoffGaps:     handoffGapsForRow(row),
			Recommendations: recommendationsForRow(row),
		},
	}
}

func cleanlinessStatus(reasons []string) string {
	if len(reasons) == 0 {
		return "clean"
	}
	return "attention"
}

func repoReasons(repo SnapshotRepo) []string {
	reasons := make([]string, 0, 9)
	if repo.Dirt.Modified {
		reasons = append(reasons, "modified")
	}
	if repo.Dirt.UntrackedCount > 0 {
		reasons = append(reasons, "untracked")
	}
	if repo.Dirt.StashCount > 0 {
		reasons = append(reasons, "stash")
	}
	if repo.Dirt.SubmoduleDriftCount > 0 {
		reasons = append(reasons, "submodule_drift")
	}
	if repo.Branch.Ahead > 0 {
		reasons = append(reasons, "ahead")
	}
	if repo.Branch.Behind > 0 {
		reasons = append(reasons, "behind")
	}
	if !repo.Branch.HasUpstream {
		reasons = append(reasons, "no_upstream")
	}
	if isDetached(repo) {
		reasons = append(reasons, "detached")
	}
	if repo.AgenticLayers.UntrackedCount > 0 {
		reasons = append(reasons, "untracked_agentic_layers")
	}
	return reasons
}

func attentionScore(repo SnapshotRepo) int {
	score := 0
	if repo.Dirt.Modified {
		score += 40
	}
	score += repo.Dirt.UntrackedCount * 5
	score += repo.Dirt.StashCount * 8
	score += repo.Dirt.SubmoduleDriftCount * 10
	score += repo.Branch.Ahead * 2
	score += repo.Branch.Behind * 2
	if !repo.Branch.HasUpstream {
		score += 12
	}
	if isDetached(repo) {
		score += 20
	}
	score += repo.AgenticLayers.UntrackedCount * 6
	return score
}

func hasEvidence(repo SnapshotRepo) bool {
	return repo.Evidence.EntireCheckpoint != nil ||
		len(repo.Evidence.EntireCheckpointRefs) > 0 ||
		repo.Evidence.EntireCheckpointRemote != nil ||
		repo.Evidence.GalSession != nil ||
		repo.Evidence.GalAgentLayer != nil ||
		repo.Evidence.GalEvidence != nil
}

func hasEditDirt(repo SnapshotRepo) bool {
	return repo.Dirt.Modified ||
		repo.Dirt.UntrackedCount > 0 ||
		repo.Dirt.StashCount > 0 ||
		repo.Dirt.SubmoduleDriftCount > 0 ||
		repo.AgenticLayers.UntrackedCount > 0
}

func isDetached(repo SnapshotRepo) bool {
	return repo.Branch.Current == nil || strings.TrimSpace(*repo.Branch.Current) == ""
}

func repoID(repo SnapshotRepo) string {
	if strings.TrimSpace(repo.GitHub.Slug) != "" {
		return repo.GitHub.Slug
	}
	return repo.RelativePath
}

func repoOwner(repo SnapshotRepo) string {
	if strings.TrimSpace(repo.GitHub.Owner) != "" {
		return repo.GitHub.Owner
	}
	parts := strings.Split(repo.RelativePath, "/")
	if len(parts) == 0 {
		return repo.RelativePath
	}
	return parts[0]
}

func matchesRepoFilter(repo SnapshotRepo, repoFilter string) bool {
	return repo.GitHub.Slug == repoFilter || repo.RelativePath == repoFilter || repo.GitHub.Name == repoFilter
}

func buildOwnerSummaries(rows []RepoRow) []OwnerSummary {
	grouped := map[string]*OwnerSummary{}
	for _, row := range rows {
		entry := grouped[row.Owner]
		if entry == nil {
			entry = &OwnerSummary{Owner: row.Owner}
			grouped[row.Owner] = entry
		}
		entry.RepoCount++
		if !row.Cleanliness.Clean {
			entry.AttentionCount++
		}
	}

	summaries := make([]OwnerSummary, 0, len(grouped))
	for _, summary := range grouped {
		summaries = append(summaries, *summary)
	}
	sort.Slice(summaries, func(i, j int) bool {
		if summaries[i].RepoCount != summaries[j].RepoCount {
			return summaries[i].RepoCount > summaries[j].RepoCount
		}
		return summaries[i].Owner < summaries[j].Owner
	})
	return summaries
}

func filterAndSort(rows []RepoRow, fn func(RepoRow) bool) []RepoRow {
	filtered := filterRepoRows(rows, fn)
	sort.Slice(filtered, func(i, j int) bool {
		if filtered[i].Cleanliness.AttentionScore != filtered[j].Cleanliness.AttentionScore {
			return filtered[i].Cleanliness.AttentionScore > filtered[j].Cleanliness.AttentionScore
		}
		return compareRepoKeys(filtered[i].Repository, filtered[i].RelativePath, filtered[j].Repository, filtered[j].RelativePath)
	})
	return filtered
}

func filterRepoRows(rows []RepoRow, fn func(RepoRow) bool) []RepoRow {
	filtered := make([]RepoRow, 0, len(rows))
	for _, row := range rows {
		if fn(row) {
			filtered = append(filtered, row)
		}
	}
	return filtered
}

func countRepoRows(rows []RepoRow, fn func(RepoRow) bool) int {
	count := 0
	for _, row := range rows {
		if fn(row) {
			count++
		}
	}
	return count
}

func countGraphLanes(lanes []GraphLane, fn func(GraphLane) bool) int {
	count := 0
	for _, lane := range lanes {
		if fn(lane) {
			count++
		}
	}
	return count
}

func countHandoffLanes(lanes []HandoffLane, status string) int {
	count := 0
	for _, lane := range lanes {
		if lane.Handoff.Status == status {
			count++
		}
	}
	return count
}

func sortRepoRows(rows []RepoRow) {
	sort.Slice(rows, func(i, j int) bool {
		return compareRepoKeys(rows[i].Repository, rows[i].RelativePath, rows[j].Repository, rows[j].RelativePath)
	})
}

func compareRepoKeys(leftRepository, leftPath, rightRepository, rightPath string) bool {
	if leftRepository != rightRepository {
		return leftRepository < rightRepository
	}
	return leftPath < rightPath
}

func branchDisplayName(current *string) string {
	if current == nil || strings.TrimSpace(*current) == "" {
		return "DETACHED"
	}
	return *current
}

func checkoutType(isWorktree bool) string {
	if isWorktree {
		return "worktree"
	}
	return "primary"
}

func pickDefaultBranch(rows []RepoRow) *string {
	counts := map[string]int{}
	for _, row := range rows {
		if row.Branch.Default != nil && strings.TrimSpace(*row.Branch.Default) != "" {
			counts[*row.Branch.Default]++
		}
	}
	if len(counts) == 0 {
		return nil
	}
	keys := make([]string, 0, len(counts))
	for key := range counts {
		keys = append(keys, key)
	}
	sort.Slice(keys, func(i, j int) bool {
		if counts[keys[i]] != counts[keys[j]] {
			return counts[keys[i]] > counts[keys[j]]
		}
		return keys[i] < keys[j]
	})
	return stringPointer(keys[0])
}

func firstUniqueRepository(rows []RepoRow) string {
	for _, row := range rows {
		if row.Repository != "" {
			return row.Repository
		}
	}
	return ""
}

func firstUniqueOwner(rows []RepoRow) string {
	for _, row := range rows {
		if row.Owner != "" {
			return row.Owner
		}
	}
	return ""
}

func blockersForRow(row RepoRow) []string {
	blockers := make([]string, 0, 6)
	if row.Branch.Detached {
		blockers = append(blockers, "detached")
	}
	if row.Dirt.Modified {
		blockers = append(blockers, "modified")
	}
	if row.Dirt.UntrackedCount > 0 {
		blockers = append(blockers, "untracked")
	}
	if row.Dirt.StashCount > 0 {
		blockers = append(blockers, "stash")
	}
	if row.Dirt.SubmoduleDriftCount > 0 {
		blockers = append(blockers, "submodule_drift")
	}
	if row.AgenticLayers.UntrackedCount > 0 {
		blockers = append(blockers, "untracked_agentic_layers")
	}
	return blockers
}

func handoffGapsForRow(row RepoRow) []string {
	gaps := make([]string, 0, 3)
	if !row.Branch.HasUpstream {
		gaps = append(gaps, "no_upstream")
	}
	if row.Branch.Ahead > 0 {
		gaps = append(gaps, "ahead")
	}
	if row.Branch.Behind > 0 {
		gaps = append(gaps, "behind")
	}
	return gaps
}

func recommendationsForRow(row RepoRow) []string {
	recommendations := make([]string, 0, 8)
	if row.Branch.Detached {
		recommendations = append(recommendations, "attach the checkout to a branch before handoff")
	}
	if row.Dirt.Modified || row.Dirt.UntrackedCount > 0 {
		recommendations = append(recommendations, "commit, stash, or move filesystem changes before handoff")
	}
	if row.Dirt.StashCount > 0 {
		recommendations = append(recommendations, "review or clear repo-local stashes before handoff")
	}
	if row.Dirt.SubmoduleDriftCount > 0 {
		recommendations = append(recommendations, "reconcile submodule drift before handoff")
	}
	if row.AgenticLayers.UntrackedCount > 0 {
		recommendations = append(recommendations, "track or remove local-only agentic-layer files before handoff")
	}
	if !row.Branch.HasUpstream {
		recommendations = append(recommendations, "push with upstream tracking before handoff")
	}
	if row.Branch.Ahead > 0 {
		recommendations = append(recommendations, "push local commits before handoff")
	}
	if row.Branch.Behind > 0 {
		recommendations = append(recommendations, "pull or rebase onto upstream before handoff")
	}
	return uniqueStrings(recommendations)
}

func handoffStatusForRow(row RepoRow) string {
	if row.Branch.Detached ||
		row.Dirt.Modified ||
		row.Dirt.UntrackedCount > 0 ||
		row.Dirt.StashCount > 0 ||
		row.Dirt.SubmoduleDriftCount > 0 ||
		row.AgenticLayers.UntrackedCount > 0 {
		return "blocked"
	}
	if !row.Branch.HasUpstream || row.Branch.Ahead > 0 || row.Branch.Behind > 0 {
		return "safe_to_commit"
	}
	return "safe_to_handoff"
}

func repoHandoffStatus(lanes []HandoffLane) string {
	hasCommit := false
	for _, lane := range lanes {
		if lane.Handoff.Status == "blocked" {
			return "blocked"
		}
		if lane.Handoff.Status == "safe_to_commit" {
			hasCommit = true
		}
	}
	if hasCommit {
		return "safe_to_commit"
	}
	return "safe_to_handoff"
}

func flattenLaneRecommendations(lanes []HandoffLane) []string {
	recommendations := make([]string, 0)
	for _, lane := range lanes {
		recommendations = append(recommendations, lane.Handoff.Recommendations...)
	}
	return recommendations
}

func flattenGraphReasons(lanes []GraphLane) []string {
	reasons := make([]string, 0)
	for _, lane := range lanes {
		reasons = append(reasons, lane.Cleanliness.Reasons...)
	}
	return reasons
}

func graphLaneStrings(lanes []GraphLane, fn func(GraphLane) string) []string {
	values := make([]string, 0, len(lanes))
	for _, lane := range lanes {
		value := fn(lane)
		if value != "" {
			values = append(values, value)
		}
	}
	return values
}

func uniqueStrings(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	unique := make([]string, 0, len(values))
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		unique = append(unique, value)
	}
	return unique
}

func stringPointer(value string) *string {
	return &value
}

func stringPointerOrNil(value string) *string {
	if value == "" {
		return nil
	}
	return stringPointer(value)
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	copied := *value
	return &copied
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func isDirtyRow(row RepoRow) bool {
	return row.Dirt.Modified || row.Dirt.UntrackedCount > 0 || row.Dirt.StashCount > 0 || row.Dirt.SubmoduleDriftCount > 0
}
