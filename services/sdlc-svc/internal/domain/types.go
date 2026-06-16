// Package domain defines shared types and constants for the SDLC enforcement engine.
package domain

import "time"

// ── Phase Constants ──────────────────────────────────────────────────────────

const (
	PhaseSpecify      = 1
	PhaseDesign       = 2
	PhaseTest         = 3
	PhaseImplement    = 4
	PhaseDeployVerify = 5
	PhaseReview       = 6
	PhaseMerge        = 7
	MaxPhase          = 7
)

var BackgroundAgentPhases = []int{1, 2, 3, 4, 6, 7}

var PhaseLabels = map[int]string{
	1: "stage:1-specify",
	2: "stage:2-design",
	3: "stage:3-test",
	4: "stage:4-implement",
	5: "stage:5-deploy-verify",
	6: "stage:6-review",
	7: "stage:7-merged-main",
}

var PhaseCommands = map[int]string{
	1: "/sdlc:1-specify:run",
	2: "/sdlc:2-design:run",
	3: "/sdlc:3-test:run",
	4: "/sdlc:4-implement:run",
	5: "/sdlc:5-deploy-verify:run",
	6: "/sdlc:6-review:run",
	7: "/sdlc:7-merge:run",
}

// RequiredPredecessors maps each phase to its required predecessor (nil for phase 1).
var RequiredPredecessors = map[int]*int{
	1: nil,
	2: ptr(1),
	3: ptr(2),
	4: ptr(3),
	5: ptr(4),
	6: ptr(4),
	7: ptr(6),
}

func ptr(v int) *int { return &v }

// ── Retraction ───────────────────────────────────────────────────────────────

type RetractionReason string

const (
	RetractionReviewRejected    RetractionReason = "review_rejected"
	RetractionCIFailed          RetractionReason = "ci_failed"
	RetractionQualityGateFailed RetractionReason = "quality_gate_failed"
	RetractionGovernanceRejected RetractionReason = "governance_rejected"
)

type RetractionTarget struct {
	ToPhase    int
	FromPhases []int
}

var DefaultRetractionTargets = map[RetractionReason]RetractionTarget{
	RetractionReviewRejected:    {ToPhase: 4, FromPhases: []int{6, 7}},
	RetractionCIFailed:          {ToPhase: 4, FromPhases: []int{6, 7}},
	RetractionQualityGateFailed: {ToPhase: 3, FromPhases: []int{4}},
	RetractionGovernanceRejected: {ToPhase: 1, FromPhases: []int{2, 3, 4, 5, 6, 7}},
}

func IsValidRetractionReason(reason string) bool {
	switch RetractionReason(reason) {
	case RetractionReviewRejected, RetractionCIFailed, RetractionQualityGateFailed, RetractionGovernanceRejected:
		return true
	default:
		return false
	}
}

func GetPreviousPhase(currentPhase int, reason RetractionReason, explicitTarget *int) *int {
	if explicitTarget != nil {
		if *explicitTarget >= currentPhase || *explicitTarget < 1 {
			return nil
		}
		return explicitTarget
	}
	mapping, ok := DefaultRetractionTargets[reason]
	if !ok {
		return nil
	}
	found := false
	for _, fp := range mapping.FromPhases {
		if fp == currentPhase {
			found = true
			break
		}
	}
	if !found {
		return nil
	}
	return &mapping.ToPhase
}

// Phase helpers

func GetPhaseLabel(phase int) string {
	if label, ok := PhaseLabels[phase]; ok {
		return label
	}
	return ""
}

func GetPhaseName(phase int) string {
	switch phase {
	case PhaseSpecify:
		return "specify"
	case PhaseDesign:
		return "design"
	case PhaseTest:
		return "test"
	case PhaseImplement:
		return "implement"
	case PhaseDeployVerify:
		return "deploy-verify"
	case PhaseReview:
		return "review"
	case PhaseMerge:
		return "merge"
	default:
		return ""
	}
}

func GetPhaseCommand(phase int) string {
	return PhaseCommands[phase]
}

func GetRequiredPredecessor(phase int) *int {
	return RequiredPredecessors[phase]
}

func IsValidPhase(phase int) bool {
	return phase >= PhaseSpecify && phase <= PhaseMerge
}

func IsValidTransition(from, to int) bool {
	fromIdx := from - 1
	toIdx := to - 1
	return toIdx == fromIdx+1
}

// ── SDLC Phase State ─────────────────────────────────────────────────────────

type SdlcPhaseState struct {
	IssueID         string              `json:"issueId" firestore:"issueId"`
	OrgID           string              `json:"orgId" firestore:"orgId"`
	Repo            string              `json:"repo,omitempty" firestore:"repo,omitempty"`
	Owner           string              `json:"owner,omitempty" firestore:"owner,omitempty"`
	CurrentPhase    int                 `json:"currentPhase" firestore:"currentPhase"`
	CompletedPhases []int               `json:"completedPhases" firestore:"completedPhases"`
	PhaseHistory    []PhaseHistoryEntry `json:"phaseHistory" firestore:"phaseHistory"`
	Status          string              `json:"status" firestore:"status"` // active, completed
	CreatedAt       time.Time           `json:"createdAt" firestore:"createdAt"`
	UpdatedAt       time.Time           `json:"updatedAt" firestore:"updatedAt"`
}

type PhaseHistoryEntry struct {
	Phase       int        `json:"phase" firestore:"phase"`
	Status      string     `json:"status" firestore:"status"` // in_progress, completed, rejected
	StartedAt   time.Time  `json:"startedAt" firestore:"startedAt"`
	CompletedAt *time.Time `json:"completedAt,omitempty" firestore:"completedAt,omitempty"`
}

// ── Compliance ───────────────────────────────────────────────────────────────

type SdlcComplianceCheck struct {
	ID          string    `json:"id" firestore:"id"`
	OrgID       string    `json:"orgId" firestore:"orgId"`
	Repo        string    `json:"repo" firestore:"repo"`
	IssueNumber int       `json:"issueNumber" firestore:"issueNumber"`
	Phase       int       `json:"phase" firestore:"phase"`
	Status      string    `json:"status" firestore:"status"` // pass, fail, warn
	Details     string    `json:"details,omitempty" firestore:"details,omitempty"`
	CheckedBy   string    `json:"checkedBy" firestore:"checkedBy"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
}

type SdlcComplianceStatus struct {
	OrgID  string                `json:"orgId"`
	Total  int                   `json:"total"`
	Passed int                   `json:"passed"`
	Failed int                   `json:"failed"`
	Checks []SdlcComplianceCheck `json:"checks"`
}

// ── Enforcement ──────────────────────────────────────────────────────────────

type SdlcEnforcementLevel string

const (
	EnforcementOff   SdlcEnforcementLevel = "off"
	EnforcementWarn  SdlcEnforcementLevel = "warn"
	EnforcementBlock SdlcEnforcementLevel = "block"
)

type SdlcEnforcementConfig struct {
	Enabled   bool                 `json:"enabled" firestore:"enabled"`
	Level     SdlcEnforcementLevel `json:"level" firestore:"level"`
	Reason    string               `json:"reason,omitempty" firestore:"reason,omitempty"`
	UpdatedAt time.Time            `json:"updatedAt" firestore:"updatedAt"`
	UpdatedBy string               `json:"updatedBy" firestore:"updatedBy"`
}

type SdlcEnforcementStatus struct {
	IssueID  string                `json:"issueId"`
	Config   SdlcEnforcementConfig `json:"config"`
	Blocked  bool                  `json:"blocked"`
	Blockers []string              `json:"blockers"`
	Warnings []string              `json:"warnings"`
}

// ── Gate ─────────────────────────────────────────────────────────────────────

type SdlcGateResult struct {
	IssueID  string   `json:"issueId"`
	Phase    int      `json:"phase"`
	Passed   bool     `json:"passed"`
	Blockers []string `json:"blockers"`
	Warnings []string `json:"warnings"`
}

type SdlcGateEvaluation struct {
	IssueID   string           `json:"issueId"`
	Gates     []SdlcGateResult `json:"gates"`
	AllPassed bool             `json:"allPassed"`
}

// ── Templates ────────────────────────────────────────────────────────────────

type SdlcTemplate struct {
	ID          string    `json:"id" firestore:"id"`
	OrgID       string    `json:"orgId" firestore:"orgId"`
	Name        string    `json:"name" firestore:"name"`
	Description string    `json:"description" firestore:"description"`
	Phases      []PhaseDef `json:"phases" firestore:"phases"`
	IsBuiltin   bool      `json:"isBuiltin" firestore:"isBuiltin"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt" firestore:"updatedAt"`
}

type PhaseDef struct {
	Number  int    `json:"number"`
	Name    string `json:"name"`
	Command string `json:"command"`
}

var BuiltinTemplates = []SdlcTemplate{
	{
		ID:          "builtin-sdlc-7-phase",
		Name:        "GAL 7-Phase SDLC",
		Description: "Standard GAL SDLC with specify, design, test, implement, deploy-verify, review, merge phases.",
		IsBuiltin:   true,
		Phases: []PhaseDef{
			{Number: 1, Name: "specify", Command: "/sdlc:1-specify:run"},
			{Number: 2, Name: "design", Command: "/sdlc:2-design:run"},
			{Number: 3, Name: "test", Command: "/sdlc:3-test:run"},
			{Number: 4, Name: "implement", Command: "/sdlc:4-implement:run"},
			{Number: 5, Name: "deploy-verify", Command: "/sdlc:5-deploy-verify:run"},
			{Number: 6, Name: "review", Command: "/sdlc:6-review:run"},
			{Number: 7, Name: "merge", Command: "/sdlc:7-merge:run"},
		},
	},
	{
		ID:          "builtin-sdlc-compact",
		Name:        "GAL Compact SDLC",
		Description: "Compact 5-phase SDLC: specify, design, implement, review, merge.",
		IsBuiltin:   true,
		Phases: []PhaseDef{
			{Number: 1, Name: "specify", Command: "/sdlc:1-specify:run"},
			{Number: 2, Name: "design", Command: "/sdlc:2-design:run"},
			{Number: 3, Name: "implement", Command: "/sdlc:4-implement:run"},
			{Number: 4, Name: "review", Command: "/sdlc:6-review:run"},
			{Number: 5, Name: "merge", Command: "/sdlc:7-merge:run"},
		},
	},
}

// ── Product Discipline ───────────────────────────────────────────────────────

type ProductDisciplineRecord struct {
	ID          string    `json:"id" firestore:"id"`
	OrgID       string    `json:"orgId" firestore:"orgId"`
	Event       string    `json:"event" firestore:"event"`
	Description string    `json:"description" firestore:"description"`
	WorkLane    string    `json:"workLane,omitempty" firestore:"workLane,omitempty"`
	ReportedBy  string    `json:"reportedBy" firestore:"reportedBy"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
}

type DisciplineOverview struct {
	OrgID             string `json:"orgId"`
	TotalEvents       int    `json:"totalEvents"`
	IntegrityEvents   int    `json:"integrityEvents"`
	DistributionEvents int   `json:"distributionEvents"`
	RevenueEvents     int    `json:"revenueEvents"`
	FeatureEvents     int    `json:"featureEvents"`
	MigrationEvents   int    `json:"migrationEvents"`
	MaintenanceEvents int    `json:"maintenanceEvents"`
	IsolationEvents   int    `json:"isolationEvents"`
}

// ── Issue Gate ───────────────────────────────────────────────────────────────

type IssueGateConfig struct {
	Mode      string    `json:"mode" firestore:"mode"`
	Enabled   bool      `json:"enabled" firestore:"enabled"`
	UpdatedAt time.Time `json:"updatedAt" firestore:"updatedAt"`
	UpdatedBy string    `json:"updatedBy" firestore:"updatedBy"`
}

type IssueGateCheckResult struct {
	IssueID  string   `json:"issueId"`
	Passed   bool     `json:"passed"`
	Mode     string   `json:"mode"`
	Reason   string   `json:"reason"`
	Blockers []string `json:"blockers"`
}

// ── Phase Progress ───────────────────────────────────────────────────────────

type SdlcPhaseProgress struct {
	CompletedPhases []int `json:"completedPhases"`
	CurrentPhase    *int  `json:"currentPhase,omitempty"`
}

func BuildPhaseProgress(workItems []WorkItemSummary) SdlcPhaseProgress {
	completed := make(map[int]bool)
	var current *int

	for _, item := range workItems {
		if item.Status == "completed" && item.SdlcPhase > 0 {
			completed[item.SdlcPhase] = true
		}
		if item.Status == "in_progress" && item.SdlcPhase > 0 {
			v := item.SdlcPhase
			current = &v
		}
	}

	var completedList []int
	for p := range completed {
		completedList = append(completedList, p)
	}
	// Sort completed phases
	for i := 0; i < len(completedList); i++ {
		for j := i + 1; j < len(completedList); j++ {
			if completedList[i] > completedList[j] {
				completedList[i], completedList[j] = completedList[j], completedList[i]
			}
		}
	}

	return SdlcPhaseProgress{
		CompletedPhases: completedList,
		CurrentPhase:    current,
	}
}

type WorkItemSummary struct {
	Status    string `json:"status"`
	SdlcPhase int    `json:"sdlcPhase"`
}

func GetCurrentOrNextBackgroundPhase(progress SdlcPhaseProgress) *int {
	if progress.CurrentPhase != nil {
		for _, bp := range BackgroundAgentPhases {
			if *progress.CurrentPhase == bp {
				return progress.CurrentPhase
			}
		}
	}

	completed := make(map[int]bool)
	for _, p := range progress.CompletedPhases {
		completed[p] = true
	}

	for _, phase := range BackgroundAgentPhases {
		if completed[phase] {
			continue
		}
		predecessor := GetRequiredPredecessor(phase)
		if predecessor == nil || completed[*predecessor] {
			return &phase
		}
	}

	return nil
}
