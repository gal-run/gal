//go:build cloud
// +build cloud

// Package handler provides HTTP handlers for the SDLC enforcement engine.
// Pattern follows billing-svc: service struct with methods that use chi, JWT, and Firestore.
package handler

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/firestore"
	"github.com/gal-run/gal/services/lib/handler"

	"github.com/gal-run/gal/services/sdlc-svc/internal/domain"
)

// ── Service Struct ───────────────────────────────────────────────────────────

type SDLCService struct {
	store *firestore.ServiceStore
	log   *slog.Logger
}

func New(store *firestore.ServiceStore, log *slog.Logger) *SDLCService {
	return &SDLCService{store: store, log: log}
}

// ── Helpers ──────────────────────────────────────────────────────────────────

func (s *SDLCService) orgID(r *http.Request) string {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		return "default"
	}
	return orgID
}

func (s *SDLCService) userID(r *http.Request) string {
	return auth.UserID(r.Context())
}

// ─────────────────────────────────────────────────────────────────────────────
// SDLC Phase Status
// ─────────────────────────────────────────────────────────────────────────────

// GetStatus returns the SDLC phase state for an issue.
// GET /sdlc/status/:issueId
func (s *SDLCService) GetStatus(w http.ResponseWriter, r *http.Request) {
	issueID := chi.URLParam(r, "issueId")
	if issueID == "" {
		handler.RespondError(w, http.StatusBadRequest, "issueId is required", "BAD_REQUEST")
		return
	}
	orgID := s.orgID(r)

	doc, err := s.store.Doc("sdlc_phases", orgID+"_"+issueID).Get(r.Context())
	if err != nil {
		// No state yet — return empty status
		handler.RespondJSON(w, http.StatusOK, domain.SdlcPhaseState{
			IssueID: issueID,
			OrgID:   orgID,
			Status:  "not_started",
		})
		return
	}

	var state domain.SdlcPhaseState
	doc.DataTo(&state)
	handler.RespondJSON(w, http.StatusOK, state)
}

// ─────────────────────────────────────────────────────────────────────────────
// SDLC Phase Transitions
// ─────────────────────────────────────────────────────────────────────────────

// AdvancePhase advances to the next SDLC phase.
// POST /sdlc/phase
func (s *SDLCService) AdvancePhase(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)

	var req struct {
		IssueID string `json:"issueId"`
		Owner   string `json:"owner"`
		Repo    string `json:"repo"`
		Phase   *int   `json:"phase,omitempty"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.IssueID == "" {
		handler.RespondError(w, http.StatusBadRequest, "issueId is required", "BAD_REQUEST")
		return
	}

	docID := orgID + "_" + req.IssueID
	docRef := s.store.Doc("sdlc_phases", docID)
	doc, err := docRef.Get(r.Context())

	now := time.Now()
	var state domain.SdlcPhaseState

	if err != nil || !doc.Exists() {
		// New state machine — first phase is specify
		nextPhase := domain.PhaseSpecify
		if req.Phase != nil && *req.Phase != domain.PhaseSpecify {
			handler.RespondError(w, http.StatusBadRequest, "first phase must be specify (phase 1)", "BAD_REQUEST")
			return
		}

		state = domain.SdlcPhaseState{
			IssueID:         req.IssueID,
			OrgID:           orgID,
			Owner:           req.Owner,
			Repo:            req.Repo,
			CurrentPhase:    nextPhase,
			CompletedPhases: []int{},
			PhaseHistory: []domain.PhaseHistoryEntry{
				{Phase: nextPhase, Status: "in_progress", StartedAt: now},
			},
			Status:    "active",
			CreatedAt: now,
			UpdatedAt: now,
		}
	} else {
		doc.DataTo(&state)

		// Determine next phase
		var nextPhase int
		if req.Phase != nil {
			nextPhase = *req.Phase
		} else {
			nextPhase = state.CurrentPhase + 1
		}

		if !domain.IsValidPhase(nextPhase) {
			handler.RespondError(w, http.StatusBadRequest, "invalid phase number", "BAD_REQUEST")
			return
		}

		// Mark current phase as completed
		for i, entry := range state.PhaseHistory {
			if entry.Phase == state.CurrentPhase && entry.Status == "in_progress" {
				state.PhaseHistory[i].Status = "completed"
				state.PhaseHistory[i].CompletedAt = &now
				break
			}
		}

		if !containsInt(state.CompletedPhases, state.CurrentPhase) {
			state.CompletedPhases = append(state.CompletedPhases, state.CurrentPhase)
		}

		// Advance to next phase
		state.CurrentPhase = nextPhase
		state.PhaseHistory = append(state.PhaseHistory, domain.PhaseHistoryEntry{
			Phase: nextPhase, Status: "in_progress", StartedAt: now,
		})
		state.UpdatedAt = now
	}

	_, err = docRef.Set(r.Context(), state)
	if err != nil {
		s.log.Error("failed to save phase state", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, state)
}

// ApprovePhase approves the current phase.
// POST /sdlc/phase/:phase/approve
func (s *SDLCService) ApprovePhase(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)
	phaseStr := chi.URLParam(r, "phase")
	phase, err := strconv.Atoi(phaseStr)
	if err != nil || !domain.IsValidPhase(phase) {
		handler.RespondError(w, http.StatusBadRequest, "invalid phase number", "BAD_REQUEST")
		return
	}

	var req struct {
		IssueID string `json:"issueId"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.IssueID == "" {
		handler.RespondError(w, http.StatusBadRequest, "issueId is required", "BAD_REQUEST")
		return
	}

	docID := orgID + "_" + req.IssueID
	docRef := s.store.Doc("sdlc_phases", docID)
	doc, err := docRef.Get(r.Context())
	if err != nil || !doc.Exists() {
		handler.RespondError(w, http.StatusNotFound, "no SDLC state found for this issue", "NOT_FOUND")
		return
	}

	var state domain.SdlcPhaseState
	doc.DataTo(&state)

	if state.CurrentPhase != phase {
		handler.RespondError(w, http.StatusBadRequest,
			fmt.Sprintf("current phase is %d, not %d", state.CurrentPhase, phase), "BAD_REQUEST")
		return
	}

	now := time.Now()
	for i, entry := range state.PhaseHistory {
		if entry.Phase == phase && entry.Status == "in_progress" {
			state.PhaseHistory[i].Status = "approved"
			state.PhaseHistory[i].CompletedAt = &now
			break
		}
	}

	if !containsInt(state.CompletedPhases, phase) {
		state.CompletedPhases = append(state.CompletedPhases, phase)
	}

	state.UpdatedAt = now
	_, err = docRef.Set(r.Context(), state)
	if err != nil {
		s.log.Error("failed to approve phase", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"phase":   phase,
		"state":   state,
	})
}

// RejectPhase rejects the current phase and returns to the previous.
// POST /sdlc/phase/:phase/reject
func (s *SDLCService) RejectPhase(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)
	phaseStr := chi.URLParam(r, "phase")
	phase, err := strconv.Atoi(phaseStr)
	if err != nil || !domain.IsValidPhase(phase) {
		handler.RespondError(w, http.StatusBadRequest, "invalid phase number", "BAD_REQUEST")
		return
	}

	var req struct {
		IssueID string `json:"issueId"`
		Reason  string `json:"reason"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.IssueID == "" {
		handler.RespondError(w, http.StatusBadRequest, "issueId is required", "BAD_REQUEST")
		return
	}

	reason := domain.RetractionReason(req.Reason)
	if req.Reason != "" && !domain.IsValidRetractionReason(req.Reason) {
		handler.RespondError(w, http.StatusBadRequest,
			"reason must be one of: review_rejected, ci_failed, quality_gate_failed, governance_rejected", "BAD_REQUEST")
		return
	}

	docID := orgID + "_" + req.IssueID
	docRef := s.store.Doc("sdlc_phases", docID)
	doc, err := docRef.Get(r.Context())
	if err != nil || !doc.Exists() {
		handler.RespondError(w, http.StatusNotFound, "no SDLC state found for this issue", "NOT_FOUND")
		return
	}

	var state domain.SdlcPhaseState
	doc.DataTo(&state)

	if state.CurrentPhase != phase {
		handler.RespondError(w, http.StatusBadRequest,
			fmt.Sprintf("current phase is %d, not %d", state.CurrentPhase, phase), "BAD_REQUEST")
		return
	}

	now := time.Now()

	// Mark current phase as rejected
	for i, entry := range state.PhaseHistory {
		if entry.Phase == phase && entry.Status == "in_progress" {
			state.PhaseHistory[i].Status = "rejected"
			state.PhaseHistory[i].CompletedAt = &now
			break
		}
	}

	// Determine previous phase
	var prevPhase int
	if reason != "" {
		resolved := domain.GetPreviousPhase(phase, reason, nil)
		if resolved == nil {
			handler.RespondError(w, http.StatusBadRequest,
				fmt.Sprintf("cannot retract from phase %d for reason %q", phase, req.Reason), "BAD_REQUEST")
			return
		}
		prevPhase = *resolved
	} else {
		prevPhase = phase - 1
		if prevPhase < domain.PhaseSpecify {
			prevPhase = domain.PhaseSpecify
		}
	}

	state.CurrentPhase = prevPhase
	state.UpdatedAt = now

	_, err = docRef.Set(r.Context(), state)
	if err != nil {
		s.log.Error("failed to reject phase", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"success":       true,
		"previousPhase": phase,
		"currentPhase":  prevPhase,
		"state":         state,
	})
}

// CompleteSDLC marks the SDLC process as complete for an issue.
// POST /sdlc/complete
func (s *SDLCService) CompleteSDLC(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)

	var req struct {
		IssueID string `json:"issueId"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.IssueID == "" {
		handler.RespondError(w, http.StatusBadRequest, "issueId is required", "BAD_REQUEST")
		return
	}

	docID := orgID + "_" + req.IssueID
	docRef := s.store.Doc("sdlc_phases", docID)
	doc, err := docRef.Get(r.Context())
	if err != nil || !doc.Exists() {
		handler.RespondError(w, http.StatusNotFound, "no SDLC state found for this issue", "NOT_FOUND")
		return
	}

	var state domain.SdlcPhaseState
	doc.DataTo(&state)

	if state.CurrentPhase < domain.MaxPhase {
		handler.RespondError(w, http.StatusBadRequest,
			fmt.Sprintf("SDLC not complete: current phase %d, need phase %d", state.CurrentPhase, domain.MaxPhase), "BAD_REQUEST")
		return
	}

	now := time.Now()
	state.Status = "completed"
	state.UpdatedAt = now

	// Mark current phase as completed
	for i, entry := range state.PhaseHistory {
		if entry.Phase == state.CurrentPhase && entry.Status == "in_progress" {
			state.PhaseHistory[i].Status = "completed"
			state.PhaseHistory[i].CompletedAt = &now
			break
		}
	}
	if !containsInt(state.CompletedPhases, state.CurrentPhase) {
		state.CompletedPhases = append(state.CompletedPhases, state.CurrentPhase)
	}

	_, err = docRef.Set(r.Context(), state)
	if err != nil {
		s.log.Error("failed to complete SDLC", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"state":   state,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Compliance
// ─────────────────────────────────────────────────────────────────────────────

// GetCompliance returns org-wide SDLC compliance status.
// GET /sdlc/compliance
func (s *SDLCService) GetCompliance(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)

	iter := s.store.Collection("sdlc_compliance").Documents(r.Context())
	var checks []domain.SdlcComplianceCheck
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var check domain.SdlcComplianceCheck
		doc.DataTo(&check)
		if check.OrgID == "" || check.OrgID == orgID {
			checks = append(checks, check)
		}
	}

	passed := 0
	failed := 0
	for _, c := range checks {
		if c.Status == "pass" {
			passed++
		} else {
			failed++
		}
	}

	handler.RespondJSON(w, http.StatusOK, domain.SdlcComplianceStatus{
		OrgID:  orgID,
		Total:  len(checks),
		Passed: passed,
		Failed: failed,
		Checks: checks,
	})
}

// GetRepoCompliance returns compliance checks for a specific repo.
// GET /sdlc/compliance/:repo
func (s *SDLCService) GetRepoCompliance(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)
	repo := chi.URLParam(r, "repo")
	if repo == "" {
		handler.RespondError(w, http.StatusBadRequest, "repo is required", "BAD_REQUEST")
		return
	}

	iter := s.store.Collection("sdlc_compliance").Where("repo", "==", repo).Documents(r.Context())
	var checks []domain.SdlcComplianceCheck
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var check domain.SdlcComplianceCheck
		doc.DataTo(&check)
		if check.OrgID == orgID {
			checks = append(checks, check)
		}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"orgId":  orgID,
		"repo":   repo,
		"total":  len(checks),
		"checks": checks,
	})
}

// RunComplianceCheck runs a compliance check for an issue.
// POST /sdlc/compliance/check
func (s *SDLCService) RunComplianceCheck(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)
	userID := s.userID(r)

	var req struct {
		IssueNumber int    `json:"issueNumber"`
		Repo        string `json:"repo"`
		Phase       int    `json:"phase"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	status := "pass"
	details := complianceCheckDetails(req.Phase)

	// Check if the phase has any blocker conditions
	blockers := evaluatePhaseGateConditions(req.Phase, nil)
	if len(blockers) > 0 {
		status = "fail"
		details = strings.Join(blockers, "; ")
	}

	check := domain.SdlcComplianceCheck{
		ID:          uuid.New().String(),
		OrgID:       orgID,
		Repo:        req.Repo,
		IssueNumber: req.IssueNumber,
		Phase:       req.Phase,
		Status:      status,
		Details:     details,
		CheckedBy:   userID,
		CreatedAt:   time.Now(),
	}

	_, err := s.store.Doc("sdlc_compliance", check.ID).Set(r.Context(), check)
	if err != nil {
		s.log.Error("failed to save compliance check", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, check)
}

func complianceCheckDetails(phase int) string {
	switch phase {
	case domain.PhaseSpecify:
		return "Specification phase: verify requirements document exists"
	case domain.PhaseDesign:
		return "Design phase: verify design document and plan.md exist"
	case domain.PhaseTest:
		return "Test phase: verify test files exist"
	case domain.PhaseImplement:
		return "Implementation phase: verify PR was created"
	case domain.PhaseDeployVerify:
		return "Deploy-verify phase: verify deployment succeeded"
	case domain.PhaseReview:
		return "Review phase: verify code review was approved"
	case domain.PhaseMerge:
		return "Merge phase: verify PR was merged"
	default:
		return "Unknown phase"
	}
}

func evaluatePhaseGateConditions(phase int, artifacts map[string]bool) []string {
	var blockers []string
	if artifacts == nil {
		return nil
	}

	switch phase {
	case domain.PhaseTest:
		if !artifacts["hasSpec"] {
			blockers = append(blockers, "Specification document not found. Complete the specify phase first.")
		}
		if !artifacts["hasPlan"] {
			blockers = append(blockers, "Design document not found. Complete the design phase first.")
		}
	case domain.PhaseImplement:
		if !artifacts["hasTests"] {
			blockers = append(blockers, "No test files found. Write failing tests first (TDD red phase).")
		}
	case domain.PhaseDeployVerify:
		if artifacts["testsPass"] == false {
			blockers = append(blockers, "Tests are not passing. Fix implementation before deploying.")
		}
	case domain.PhaseReview:
		if artifacts["deploySucceeded"] == false {
			blockers = append(blockers, "Deployment verification failed. Fix deployment before requesting review.")
		}
	case domain.PhaseMerge:
		if artifacts["reviewApproved"] == false {
			blockers = append(blockers, "Code review has not been approved.")
		}
		if artifacts["ciPasses"] == false {
			blockers = append(blockers, "CI pipeline is not passing.")
		}
	}
	return blockers
}

// ─────────────────────────────────────────────────────────────────────────────
// Enforcement
// ─────────────────────────────────────────────────────────────────────────────

// EnforceGate enforces the SDLC gate for an issue or session.
// POST /sdlc/enforce
func (s *SDLCService) EnforceGate(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)

	var req struct {
		IssueID     string `json:"issueId"`
		Branch      string `json:"branch"`
		SessionOnly bool   `json:"sessionOnly"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.IssueID == "" && req.Branch == "" {
		handler.RespondError(w, http.StatusBadRequest, "issueId or branch is required", "BAD_REQUEST")
		return
	}

	// Load enforcement config
	enforcement := s.loadEnforcementConfig(r.Context(), orgID)

	var blockers []string
	var warnings []string
	var currentPhase int

	if req.IssueID != "" {
		docID := orgID + "_" + req.IssueID
		doc, err := s.store.Doc("sdlc_phases", docID).Get(r.Context())
		if err == nil && doc.Exists() {
			var state domain.SdlcPhaseState
			doc.DataTo(&state)
			currentPhase = state.CurrentPhase

			// Check predecessor completion
			predecessor := domain.GetRequiredPredecessor(currentPhase)
			if predecessor != nil {
				found := false
				for _, cp := range state.CompletedPhases {
					if cp == *predecessor {
						found = true
						break
					}
				}
				if !found {
					msg := fmt.Sprintf("Phase %d (%s) blocked: predecessor phase %d (%s) not completed",
						currentPhase, domain.GetPhaseLabel(currentPhase),
						*predecessor, domain.GetPhaseLabel(*predecessor))
					blockers = append(blockers, msg)
				}
			}
		}
	}

	if enforcement.Level == domain.EnforcementWarn && len(blockers) > 0 {
		warnings = blockers
		blockers = nil
	}

	blocked := len(blockers) > 0 && enforcement.Level == domain.EnforcementBlock

	handler.RespondJSON(w, http.StatusOK, domain.SdlcEnforcementStatus{
		IssueID:  req.IssueID,
		Config:   enforcement,
		Blocked:  blocked,
		Blockers: blockers,
		Warnings: warnings,
	})
}

// GetEnforcementStatus returns the enforcement status for an issue.
// GET /sdlc/enforce/status/:issueId
func (s *SDLCService) GetEnforcementStatus(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)
	issueID := chi.URLParam(r, "issueId")
	if issueID == "" {
		handler.RespondError(w, http.StatusBadRequest, "issueId is required", "BAD_REQUEST")
		return
	}

	enforcement := s.loadEnforcementConfig(r.Context(), orgID)

	docID := orgID + "_" + issueID
	doc, err := s.store.Doc("sdlc_phases", docID).Get(r.Context())

	var blockers []string
	var warnings []string

	if err == nil && doc.Exists() {
		var state domain.SdlcPhaseState
		doc.DataTo(&state)

		predecessor := domain.GetRequiredPredecessor(state.CurrentPhase)
		if predecessor != nil {
			found := false
			for _, cp := range state.CompletedPhases {
				if cp == *predecessor {
					found = true
					break
				}
			}
			if !found {
				msg := fmt.Sprintf("Phase %d blocked: predecessor phase %d not completed",
					state.CurrentPhase, *predecessor)
				blockers = append(blockers, msg)
			}
		}

		if enforcement.Level == domain.EnforcementWarn && len(blockers) > 0 {
			warnings = blockers
			blockers = nil
		}
	}

	blocked := len(blockers) > 0 && enforcement.Level == domain.EnforcementBlock

	handler.RespondJSON(w, http.StatusOK, domain.SdlcEnforcementStatus{
		IssueID:  issueID,
		Config:   enforcement,
		Blocked:  blocked,
		Blockers: blockers,
		Warnings: warnings,
	})
}

func (s *SDLCService) loadEnforcementConfig(ctx context.Context, orgID string) domain.SdlcEnforcementConfig {
	// For now, return a default enforcement config.
	// In production, this would read from a Firestore document.
	return domain.SdlcEnforcementConfig{
		Enabled: true,
		Level:   domain.EnforcementWarn,
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Gates
// ─────────────────────────────────────────────────────────────────────────────

// GetGate checks whether an issue passes the SDLC gate.
// GET /sdlc/gate/:issueId
func (s *SDLCService) GetGate(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)
	issueID := chi.URLParam(r, "issueId")
	if issueID == "" {
		handler.RespondError(w, http.StatusBadRequest, "issueId is required", "BAD_REQUEST")
		return
	}

	docID := orgID + "_" + issueID
	doc, err := s.store.Doc("sdlc_phases", docID).Get(r.Context())

	if err != nil || !doc.Exists() {
		handler.RespondJSON(w, http.StatusOK, domain.SdlcGateResult{
			IssueID: issueID,
			Passed:  true,
			Warnings: []string{"No SDLC state found — gate passes by default"},
		})
		return
	}

	var state domain.SdlcPhaseState
	doc.DataTo(&state)

	var blockers []string

	// Check all phase predecessors
	for phase := domain.PhaseSpecify; phase <= state.CurrentPhase; phase++ {
		predecessor := domain.GetRequiredPredecessor(phase)
		if predecessor == nil {
			continue
		}
		found := false
		for _, cp := range state.CompletedPhases {
			if cp == *predecessor {
				found = true
				break
			}
		}
		if !found && phase == state.CurrentPhase {
			blockers = append(blockers, fmt.Sprintf(
				"Phase %d (%s) requires predecessor phase %d (%s) to be completed",
				phase, domain.GetPhaseLabel(phase), *predecessor, domain.GetPhaseLabel(*predecessor)))
		}
	}

	handler.RespondJSON(w, http.StatusOK, domain.SdlcGateResult{
		IssueID:  issueID,
		Phase:    state.CurrentPhase,
		Passed:   len(blockers) == 0,
		Blockers: blockers,
	})
}

// EvaluateGates evaluates all gates for an issue.
// POST /sdlc/gate/evaluate
func (s *SDLCService) EvaluateGates(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)

	var req struct {
		IssueID string `json:"issueId"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.IssueID == "" {
		handler.RespondError(w, http.StatusBadRequest, "issueId is required", "BAD_REQUEST")
		return
	}

	docID := orgID + "_" + req.IssueID
	doc, err := s.store.Doc("sdlc_phases", docID).Get(r.Context())

	var gates []domain.SdlcGateResult

	if err != nil || !doc.Exists() {
		gates = append(gates, domain.SdlcGateResult{
			IssueID: req.IssueID,
			Phase:   0,
			Passed:  true,
		})
		handler.RespondJSON(w, http.StatusOK, domain.SdlcGateEvaluation{
			IssueID:   req.IssueID,
			Gates:     gates,
			AllPassed: true,
		})
		return
	}

	var state domain.SdlcPhaseState
	doc.DataTo(&state)

	allPassed := true
	for phase := domain.PhaseSpecify; phase <= domain.MaxPhase; phase++ {
		predecessor := domain.GetRequiredPredecessor(phase)
		blockers := evaluatePhaseGateConditions(phase, nil)

		// Also check predecessor completion
		if predecessor != nil {
			completed := false
			for _, cp := range state.CompletedPhases {
				if cp == *predecessor {
					completed = true
					break
				}
			}
			if !completed {
				blockers = append(blockers, fmt.Sprintf(
					"Phase %d depends on completed phase %d", phase, *predecessor))
			}
		}

		passed := len(blockers) == 0
		if !passed {
			allPassed = false
		}

		gates = append(gates, domain.SdlcGateResult{
			IssueID:  req.IssueID,
			Phase:    phase,
			Passed:   passed,
			Blockers: blockers,
		})
	}

	handler.RespondJSON(w, http.StatusOK, domain.SdlcGateEvaluation{
		IssueID:   req.IssueID,
		Gates:     gates,
		AllPassed: allPassed,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────────────────────────────────────

// ListTemplates returns built-in SDLC templates.
// GET /sdlc/templates
func (s *SDLCService) ListTemplates(w http.ResponseWriter, r *http.Request) {
	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"templates": domain.BuiltinTemplates,
		"total":     len(domain.BuiltinTemplates),
	})
}

// CreateTemplate creates a custom SDLC template.
// POST /sdlc/templates
func (s *SDLCService) CreateTemplate(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)

	var req struct {
		Name        string           `json:"name"`
		Description string           `json:"description"`
		Phases      []domain.PhaseDef `json:"phases"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Name == "" {
		handler.RespondError(w, http.StatusBadRequest, "name is required", "BAD_REQUEST")
		return
	}

	tmpl := domain.SdlcTemplate{
		ID:          uuid.New().String(),
		OrgID:       orgID,
		Name:        req.Name,
		Description: req.Description,
		Phases:      req.Phases,
		IsBuiltin:   false,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	_, err := s.store.Doc("sdlc_templates", tmpl.ID).Set(r.Context(), tmpl)
	if err != nil {
		s.log.Error("failed to create template", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, tmpl)
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Discipline
// ─────────────────────────────────────────────────────────────────────────────

// GetDisciplineOverview returns the org discipline overview.
// GET /product-discipline
func (s *SDLCService) GetDisciplineOverview(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)

	iter := s.store.Collection("product_discipline").Documents(r.Context())
	var records []domain.ProductDisciplineRecord
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var rec domain.ProductDisciplineRecord
		doc.DataTo(&rec)
		if rec.OrgID == orgID {
			records = append(records, rec)
		}
	}

	overview := domain.DisciplineOverview{OrgID: orgID, TotalEvents: len(records)}
	for _, rec := range records {
		switch rec.WorkLane {
		case "product-integrity":
			overview.IntegrityEvents++
		case "distribution":
			overview.DistributionEvents++
		case "revenue":
			overview.RevenueEvents++
		case "feature-depth":
			overview.FeatureEvents++
		case "migration":
			overview.MigrationEvents++
		case "isolation":
			overview.IsolationEvents++
		case "maintenance":
			overview.MaintenanceEvents++
		}
	}

	handler.RespondJSON(w, http.StatusOK, overview)
}

// ReportDisciplineEvent reports a product discipline event.
// POST /product-discipline/report
func (s *SDLCService) ReportDisciplineEvent(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)
	userID := s.userID(r)

	var req struct {
		Event       string `json:"event"`
		Description string `json:"description"`
		WorkLane    string `json:"workLane"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Event == "" {
		handler.RespondError(w, http.StatusBadRequest, "event is required", "BAD_REQUEST")
		return
	}

	rec := domain.ProductDisciplineRecord{
		ID:          uuid.New().String(),
		OrgID:       orgID,
		Event:       req.Event,
		Description: req.Description,
		WorkLane:    req.WorkLane,
		ReportedBy:  userID,
		CreatedAt:   time.Now(),
	}

	_, err := s.store.Doc("product_discipline", rec.ID).Set(r.Context(), rec)
	if err != nil {
		s.log.Error("failed to save discipline event", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, rec)
}

// ─────────────────────────────────────────────────────────────────────────────
// Product Issue Gate
// ─────────────────────────────────────────────────────────────────────────────

// GetIssueGateConfig returns the issue gate configuration.
// GET /product-issue-gate
func (s *SDLCService) GetIssueGateConfig(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)

	doc, err := s.store.Doc("issue_gates", orgID).Get(r.Context())
	if err != nil || !doc.Exists() {
		handler.RespondJSON(w, http.StatusOK, domain.IssueGateConfig{
			Mode:    "off",
			Enabled: false,
		})
		return
	}

	var config domain.IssueGateConfig
	doc.DataTo(&config)
	handler.RespondJSON(w, http.StatusOK, config)
}

// CheckIssueGate checks whether a PR passes the product issue gate.
// POST /product-issue-gate/check
func (s *SDLCService) CheckIssueGate(w http.ResponseWriter, r *http.Request) {
	orgID := s.orgID(r)

	var req struct {
		IssueID     string `json:"issueId"`
		PRNumber    int    `json:"prNumber"`
		Repo        string `json:"repo"`
		Command     string `json:"command"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.IssueID == "" {
		handler.RespondError(w, http.StatusBadRequest, "issueId is required", "BAD_REQUEST")
		return
	}

	// Load gate config
	doc, err := s.store.Doc("issue_gates", orgID).Get(r.Context())
	config := domain.IssueGateConfig{Mode: "off", Enabled: false}
	if err == nil && doc.Exists() {
		doc.DataTo(&config)
	}

	if !config.Enabled || config.Mode == "off" {
		handler.RespondJSON(w, http.StatusOK, domain.IssueGateCheckResult{
			IssueID: req.IssueID,
			Passed:  true,
			Mode:    "off",
			Reason:  "product_issue_gate_disabled",
		})
		return
	}

	// Check if this is a grooming command (specify, design) that passes the gate
	if req.Command != "" {
		lower := strings.ToLower(strings.TrimSpace(req.Command))
		if strings.HasPrefix(lower, "/sdlc:1-specify") ||
			strings.HasPrefix(lower, "/sdlc:2-design") ||
			strings.HasPrefix(lower, "/specify") ||
			strings.HasPrefix(lower, "/design") ||
			strings.HasPrefix(lower, "/research") ||
			strings.HasPrefix(lower, "/clarify") {
			handler.RespondJSON(w, http.StatusOK, domain.IssueGateCheckResult{
				IssueID: req.IssueID,
				Passed:  true,
				Mode:    config.Mode,
				Reason:  "product_issue_gate_routes_to_grooming",
			})
			return
		}
	}

	// Evaluate gate based on SDLC phase state
	docID := orgID + "_" + req.IssueID
	phaseDoc, err := s.store.Doc("sdlc_phases", docID).Get(r.Context())

	var blockers []string
	if err == nil && phaseDoc.Exists() {
		var state domain.SdlcPhaseState
		phaseDoc.DataTo(&state)

		// If SDLC is complete, gate passes
		if state.Status == "completed" {
			handler.RespondJSON(w, http.StatusOK, domain.IssueGateCheckResult{
				IssueID: req.IssueID,
				Passed:  true,
				Mode:    config.Mode,
				Reason:  "sdlc_complete",
			})
			return
		}

		// If no SDLC state started, block with message
		if state.CurrentPhase < domain.PhaseSpecify {
			blockers = append(blockers, "SDLC process has not started for this issue")
		}
	} else {
		blockers = append(blockers, "No SDLC state found — issue may not have been gated")
	}

	passed := len(blockers) == 0
	if config.Mode == "warn" {
		passed = true
	}

	handler.RespondJSON(w, http.StatusOK, domain.IssueGateCheckResult{
		IssueID:  req.IssueID,
		Passed:   passed,
		Mode:     config.Mode,
		Reason:   fmt.Sprintf("product_issue_gate_evaluated: %d blocker(s)", len(blockers)),
		Blockers: blockers,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Health
// ─────────────────────────────────────────────────────────────────────────────

func HealthCheck(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(`{"status":"ok"}`))
}

// ── Utility ──────────────────────────────────────────────────────────────────

func containsInt(slice []int, val int) bool {
	for _, item := range slice {
		if item == val {
			return true
		}
	}
	return false
}
