// Package handler implements HTTP routes for the swarm microservice.
package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	hlp "github.com/gal-run/gal/services/lib/handler"
	"github.com/gal-run/gal/services/swarm-svc/internal/catalog"
	"github.com/gal-run/gal/services/swarm-svc/internal/domain"
	"github.com/gal-run/gal/services/swarm-svc/internal/planning"
)

// Handler holds dependencies for the swarm HTTP handlers.
type Handler struct {
	// In-memory run storage (for development; production uses Firestore).
	runs map[string]*domain.GalSwarmStoredRun
}

// New creates a new Handler.
func New() *Handler {
	return &Handler{
		runs: make(map[string]*domain.GalSwarmStoredRun),
	}
}

// RegisterRoutes mounts swarm routes on the router.
func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Route("/swarm", func(r chi.Router) {
		// Run lifecycle
		r.Post("/run", h.CreateRun)
		r.Get("/run/{id}", h.GetRun)
		r.Post("/run/{id}/preflight", h.RunPreflight)
		r.Post("/run/{id}/dispatch", h.DispatchRun)
		r.Post("/run/{id}/closeout", h.CloseoutRun)
		r.Get("/run/{id}/evidence", h.GetEvidence)

		// Catalog
		r.Get("/catalog", h.GetCatalog)
		r.Get("/catalog/providers", h.GetProviders)

		// Doctor
		r.Get("/doctor", h.GetDoctor)

		// Topology
		r.Get("/topology", h.GetTopology)
		r.Post("/topology/plan", h.PlanTopology)

		// Records
		r.Get("/records", h.GetRecords)
		r.Get("/records/{id}", h.GetRecord)
	})

	r.Get("/health", h.HealthCheck)
}

// HealthCheck returns service health.
func (h *Handler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	hlp.RespondJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"service": "swarm-svc",
		"version": domain.GalSwarmAPIVersion,
	})
}

// CreateRun handles POST /swarm/run.
func (h *Handler) CreateRun(w http.ResponseWriter, r *http.Request) {
	var req domain.GalSwarmRunRequest
	if err := hlp.DecodeJSON(r, &req); err != nil {
		hlp.RespondError(w, http.StatusBadRequest, "Invalid request body", "INVALID_REQUEST")
		return
	}

	runID := uuid.New().String()
	if req.CorrelationID != nil && strings.TrimSpace(*req.CorrelationID) != "" {
		runID = strings.TrimSpace(*req.CorrelationID)
	}

	sandboxProvider := resolveSandboxProvider(req.Target)

	questionnaire := normalizeQuestionnaire(req)
	executionApproval := normalizeExecutionApproval(req, questionnaire)

	predictedTokenSeconds := (req.Workload.PromptTokens + req.Workload.CompletionTokens + 119) / 120
	if predictedTokenSeconds < 1 {
		predictedTokenSeconds = 1
	}
	predictedDurationSeconds := predictedTokenSeconds
	if req.Workload.WorkflowWaitSeconds > predictedDurationSeconds {
		predictedDurationSeconds = req.Workload.WorkflowWaitSeconds
	}
	if tc := req.Workload.ToolCalls * 8; tc > predictedDurationSeconds {
		predictedDurationSeconds = tc
	}

	status := domain.GalSwarmRunStatusPlanned
	if req.Mode == domain.GalSwarmRunModeApply {
		status = domain.GalSwarmRunStatusReadyForApply
	}

	plan := &domain.GalSwarmRunPlan{
		APIVersion:                domain.GalSwarmAPIVersion,
		RunID:                     runID,
		OrgName:                   req.OrgName,
		Status:                    status,
		Source:                    req.Source,
		Mode:                      req.Mode,
		Objective:                 req.Objective,
		Questionnaire:             questionnaire,
		ExecutionApproval:         executionApproval,
		Target:                    req.Target,
		Workload:                  req.Workload,
		PredictedDurationSeconds:  predictedDurationSeconds,
		PredictedTokenSeconds:     predictedTokenSeconds,
		ServerlessFallbackRequired: true,
		ApprovalRequired:          req.Mode == domain.GalSwarmRunModeApply,
		PreflightChecks:           createPreflightChecks(req, sandboxProvider),
		StratusOperations: []domain.GalSwarmStratusOperation{
			{Type: "preflight", TaskType: "stratus.agent-sandbox.preflight.check", DispatchSurface: "gal-api-swarm-microservice", ArtifactName: ptr("stratus-agent-sandbox-preflight-result-" + string(sandboxProvider))},
			{Type: "burst-start-plan", TaskType: "stratus.agent-sandbox.burst.start.plan", DispatchSurface: "gal-api-swarm-microservice", ArtifactName: ptr("stratus-agent-sandbox-burst-start-plan-" + string(sandboxProvider))},
			{Type: "burst-run", TaskType: "stratus.agent-sandbox.burst.run", DispatchSurface: "stratus-sandbox-controller", ControllerEndpoint: ptr("/sandbox/agent/start"), ArtifactName: ptr("stratus-agent-sandbox-burst-run-result-" + string(sandboxProvider) + "-" + string(req.Mode))},
			{Type: "monitor", TaskType: "stratus.agent-sandbox.monitor", DispatchSurface: "gal-api-swarm-microservice"},
			{Type: "drain", TaskType: "stratus.agent-sandbox.drain", DispatchSurface: "gal-api-swarm-microservice"},
		},
	}

	stored := &domain.GalSwarmStoredRun{
		Plan:      plan,
		CreatedAt: domain.GalSwarmNow(),
		UpdatedAt: domain.GalSwarmNow(),
	}
	h.runs[runID] = stored

	endpoints := createRunEndpoints(plan)

	hlp.RespondJSON(w, http.StatusCreated, map[string]interface{}{
		"plan":      plan,
		"run":       stored,
		"endpoints": endpoints,
	})
}

// GetRun handles GET /swarm/run/{id}.
func (h *Handler) GetRun(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	run, ok := h.runs[id]
	if !ok {
		hlp.RespondError(w, http.StatusNotFound, "Run not found", "NOT_FOUND")
		return
	}
	hlp.RespondJSON(w, http.StatusOK, run)
}

// RunPreflight handles POST /swarm/run/{id}/preflight.
func (h *Handler) RunPreflight(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	run, ok := h.runs[id]
	if !ok {
		hlp.RespondError(w, http.StatusNotFound, "Run not found", "NOT_FOUND")
		return
	}

	var preflightResult map[string]interface{}
	if err := hlp.DecodeJSON(r, &preflightResult); err != nil {
		// If no body, return the preflight checks from the plan
		hlp.RespondJSON(w, http.StatusOK, map[string]interface{}{
			"runId":            id,
			"preflightChecks":  run.Plan.PreflightChecks,
			"stratusOperations": run.Plan.StratusOperations,
		})
		return
	}

	hlp.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"runId":            id,
		"preflightChecks":  run.Plan.PreflightChecks,
		"stratusOperations": run.Plan.StratusOperations,
		"input":            preflightResult,
	})
}

// DispatchRun handles POST /swarm/run/{id}/dispatch.
func (h *Handler) DispatchRun(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	run, ok := h.runs[id]
	if !ok {
		hlp.RespondError(w, http.StatusNotFound, "Run not found", "NOT_FOUND")
		return
	}

	run.Plan.Status = domain.GalSwarmRunStatusRunning
	run.UpdatedAt = domain.GalSwarmNow()

	hlp.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"runId":  id,
		"status": run.Plan.Status,
		"message": "Run dispatched. Monitor progress via GET /swarm/run/" + id,
	})
}

// CloseoutRun handles POST /swarm/run/{id}/closeout.
func (h *Handler) CloseoutRun(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	run, ok := h.runs[id]
	if !ok {
		hlp.RespondError(w, http.StatusNotFound, "Run not found", "NOT_FOUND")
		return
	}

	var closeout domain.GalSwarmRunCloseout
	if err := hlp.DecodeJSON(r, &closeout); err == nil {
		run.Closeout = &closeout
	}

	run.Plan.Status = domain.GalSwarmRunStatusCompleted
	run.UpdatedAt = domain.GalSwarmNow()

	hlp.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"runId":  id,
		"status": run.Plan.Status,
	})
}

// GetEvidence handles GET /swarm/run/{id}/evidence.
func (h *Handler) GetEvidence(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	run, ok := h.runs[id]
	if !ok {
		hlp.RespondError(w, http.StatusNotFound, "Run not found", "NOT_FOUND")
		return
	}

	hlp.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"runId":    id,
		"evidence": run.Closeout,
	})
}

// GetCatalog handles GET /swarm/catalog.
func (h *Handler) GetCatalog(w http.ResponseWriter, r *http.Request) {
	cat := catalog.CreateGalSwarmCapabilityCatalog(nil)
	hlp.RespondJSON(w, http.StatusOK, cat)
}

// GetProviders handles GET /swarm/catalog/providers.
func (h *Handler) GetProviders(w http.ResponseWriter, r *http.Request) {
	providers := map[string]interface{}{
		"aiProviders":             domain.GalSwarmEnabledAIProviders,
		"sandboxProviders":        domain.GalSwarmEnabledSandboxProviders,
		"integrationProfiles":     catalog.DefaultGalSwarmProviderIntegrationProfiles(),
		"firstBurstDefaults":      catalog.DefaultGalSwarmFirstBurstLaunchDefaults(),
		"preflightComputeProfiles": catalog.DefaultGalSwarmPreflightComputeProfiles(),
		"providerCandidates":      catalog.DefaultGalSwarmFirstBurstProviderCandidates(),
	}
	hlp.RespondJSON(w, http.StatusOK, providers)
}

// GetDoctor handles GET /swarm/doctor.
func (h *Handler) GetDoctor(w http.ResponseWriter, r *http.Request) {
	report := catalog.CreateGalSwarmDoctorReport(domain.GalSwarmDoctorReportInput{
		Checks: []domain.GalSwarmDoctorCheck{},
	})
	hlp.RespondJSON(w, http.StatusOK, report)
}

// GetTopology handles GET /swarm/topology.
func (h *Handler) GetTopology(w http.ResponseWriter, r *http.Request) {
	aliases := planning.ListGalSwarmTopologyAliases()
	hlp.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"orchestrationModes": domain.GalSwarmAllOrchestrationModes,
		"aliases":            aliases,
		"aliasHelp":          planning.FormatGalSwarmTopologyAliasHelp("  "),
	})
}

// PlanTopology handles POST /swarm/topology/plan.
func (h *Handler) PlanTopology(w http.ResponseWriter, r *http.Request) {
	var req domain.GalSwarmTopologyRequest
	if err := hlp.DecodeJSON(r, &req); err != nil {
		hlp.RespondError(w, http.StatusBadRequest, "Invalid request body: "+err.Error(), "INVALID_REQUEST")
		return
	}

	plan, err := planning.CreateGalSwarmTopologyPlan(req)
	if err != nil {
		hlp.RespondError(w, http.StatusBadRequest, err.Error(), "PLANNING_FAILED")
		return
	}
	hlp.RespondJSON(w, http.StatusOK, plan)
}

// GetRecords handles GET /swarm/records.
func (h *Handler) GetRecords(w http.ResponseWriter, r *http.Request) {
	var records []*domain.GalSwarmStoredRun
	for _, run := range h.runs {
		records = append(records, run)
	}
	hlp.RespondJSON(w, http.StatusOK, records)
}

// GetRecord handles GET /swarm/records/{id}.
func (h *Handler) GetRecord(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	run, ok := h.runs[id]
	if !ok {
		hlp.RespondError(w, http.StatusNotFound, "Run not found", "NOT_FOUND")
		return
	}
	hlp.RespondJSON(w, http.StatusOK, run)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func resolveSandboxProvider(target domain.GalSwarmComputeTarget) domain.GalSwarmSandboxProvider {
	if target.SandboxProvider != nil {
		return *target.SandboxProvider
	}
	if target.Provider != nil {
		return *target.Provider
	}
	return domain.GalSwarmSandboxProviderStratus
}

func normalizeQuestionnaire(req domain.GalSwarmRunRequest) domain.GalSwarmOperatorQuestionnaire {
	highLevel := strings.TrimSpace(req.Objective)
	if req.Questionnaire != nil && strings.TrimSpace(req.Questionnaire.HighLevelPrompt) != "" {
		highLevel = strings.TrimSpace(req.Questionnaire.HighLevelPrompt)
	}

	successCriteria := normalizeStringList(
		func() []string { if req.Questionnaire != nil { return req.Questionnaire.SuccessCriteria }; return nil }(),
		[]string{"Complete the requested objective: " + strings.TrimSpace(req.Objective)},
	)
	constraints := normalizeStringList(
		func() []string { if req.Questionnaire != nil { return req.Questionnaire.Constraints }; return nil }(),
		nil,
	)
	approvalQuestion := "Approve starting this swarm to satisfy: " + highLevel + "?"
	if req.Questionnaire != nil && strings.TrimSpace(req.Questionnaire.ApprovalQuestion) != "" {
		approvalQuestion = strings.TrimSpace(req.Questionnaire.ApprovalQuestion)
	}

	return domain.GalSwarmOperatorQuestionnaire{
		HighLevelPrompt:  highLevel,
		SuccessCriteria:  successCriteria,
		Constraints:      constraints,
		ApprovalQuestion: approvalQuestion,
	}
}

func normalizeExecutionApproval(req domain.GalSwarmRunRequest, questionnaire domain.GalSwarmOperatorQuestionnaire) domain.GalSwarmExecutionApproval {
	approval := domain.GalSwarmExecutionApproval{
		Required: true,
		Approved: false,
		Question: questionnaire.ApprovalQuestion,
	}

	if req.ExecutionApproval != nil {
		approval.Approved = req.ExecutionApproval.Approved
		if strings.TrimSpace(req.ExecutionApproval.Question) != "" {
			approval.Question = strings.TrimSpace(req.ExecutionApproval.Question)
		}
		if req.ExecutionApproval.ApprovedBy != nil && strings.TrimSpace(*req.ExecutionApproval.ApprovedBy) != "" {
			approval.ApprovedBy = ptr(strings.TrimSpace(*req.ExecutionApproval.ApprovedBy))
		}
		if req.ExecutionApproval.ApprovedAt != nil && strings.TrimSpace(*req.ExecutionApproval.ApprovedAt) != "" {
			approval.ApprovedAt = ptr(strings.TrimSpace(*req.ExecutionApproval.ApprovedAt))
		}
	}

	evidenceURL := ""
	if req.ApprovalEvidenceURL != nil && strings.TrimSpace(*req.ApprovalEvidenceURL) != "" {
		evidenceURL = strings.TrimSpace(*req.ApprovalEvidenceURL)
	} else if req.ExecutionApproval != nil && req.ExecutionApproval.ApprovalEvidenceURL != nil && strings.TrimSpace(*req.ExecutionApproval.ApprovalEvidenceURL) != "" {
		evidenceURL = strings.TrimSpace(*req.ExecutionApproval.ApprovalEvidenceURL)
	}
	if evidenceURL != "" {
		approval.ApprovalEvidenceURL = &evidenceURL
	}

	return approval
}

func createPreflightChecks(req domain.GalSwarmRunRequest, sp domain.GalSwarmSandboxProvider) []domain.GalSwarmRunPreflightCheck {
	dryRunDesc := "Confirm this is a dry-run plan and cannot start paid compute."
	applyDesc := "Verify approvalEvidenceUrl and confirm the request is allowed to start paid compute."
	approvalDesc := dryRunDesc
	if req.Mode == domain.GalSwarmRunModeApply {
		approvalDesc = applyDesc
	}

	return []domain.GalSwarmRunPreflightCheck{
		{ID: "approval-evidence", Category: "approval", Required: true, Status: "pending", Description: approvalDesc},
		{ID: "budget-cap", Category: "budget", Required: true, Status: "pending", Description: "Confirm maxHourlyUsd (" + formatFloat(req.Target.MaxHourlyUsd) + ") and ttlHours (" + formatFloat(req.Target.TTLHours) + ") are within the approved burst budget."},
		{ID: "provider-credentials", Category: "provider", Required: true, Status: "pending", Description: "Verify " + string(sp) + " credentials, project/account selection, and API access for compute profile " + req.Target.ComputeProfileID + "."},
		{ID: "provider-quota", Category: "quota", Required: true, Status: "pending", Description: "Verify quota for " + itoa(req.Target.DesiredComputeUnits) + " compute unit(s) and " + itoa(req.Target.DesiredWorkers) + " worker(s)."},
		{ID: "model-capacity", Category: "model", Required: true, Status: "pending", Description: "Verify the selected model endpoint can satisfy predicted token throughput and context needs."},
		{ID: "workload-estimate", Category: "workload", Required: true, Status: "pending", Description: "Validate " + itoa(req.Workload.Tasks) + " task(s), " + itoa(req.Workload.ToolCalls) + " tool call(s), and " + itoa(req.Workload.WorkflowWaitSeconds) + "s workflow wait estimate."},
		{ID: "sandbox-capacity", Category: "sandbox", Required: true, Status: "pending", Description: "Verify " + itoa(req.Workload.SandboxCount) + " sandbox(es) can be started with required secrets and filesystem isolation."},
		{ID: "monitoring", Category: "monitoring", Required: true, Status: "pending", Description: "Confirm utilization, cost, token throughput, tool latency, and workflow wait monitoring is active before apply."},
		{ID: "drain-plan", Category: "drain", Required: true, Status: "pending", Description: "Confirm low-utilization drain threshold, timeout, and shutdown path before any self-hosted burst."},
		{ID: "serverless-fallback", Category: "fallback", Required: true, Status: "pending", Description: "Verify serverless fallback endpoint " + req.Target.ServerlessEndpointID + " is ready if self-hosted utilization drops below threshold."},
	}
}

func createRunEndpoints(plan *domain.GalSwarmRunPlan) map[string]interface{} {
	return map[string]interface{}{
		"dashboard": "/dashboard/swarm/" + plan.RunID,
		"galCode":   "gal swarm status " + plan.RunID + " --org " + plan.OrgName,
		"stratus": map[string]interface{}{
			"swarmApi":          "/api/swarm/" + plan.OrgName + "/runs/" + plan.RunID,
			"sandboxController": "/sandbox/agent/start",
			"preflightTask":     "stratus.agent-sandbox.preflight.check",
			"burstStartTask":    "stratus.agent-sandbox.burst.start.plan",
			"burstRunTask":      "stratus.agent-sandbox.burst.run",
			"drainTask":         "stratus.agent-sandbox.drain",
		},
	}
}

func normalizeStringList(input []string, fallback []string) []string {
	if len(input) == 0 {
		if len(fallback) == 0 {
			return nil
		}
		result := make([]string, len(fallback))
		for i, s := range fallback {
			result[i] = s
		}
		return result
	}
	var result []string
	for _, s := range input {
		t := strings.TrimSpace(s)
		if t != "" {
			result = append(result, t)
		}
	}
	return result
}

func ptr[T any](v T) *T {
	return &v
}

func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	digits := ""
	neg := false
	if i < 0 {
		neg = true
		i = -i
	}
	for i > 0 {
		digits = string(byte('0'+i%10)) + digits
		i /= 10
	}
	if neg {
		return "-" + digits
	}
	return digits
}

func formatFloat(f float64) string {
	s := strconv.FormatFloat(f, 'f', 2, 64)
	return strings.TrimRight(strings.TrimRight(s, "0"), ".")
}
