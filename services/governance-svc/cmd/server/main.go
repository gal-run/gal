package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"

	"github.com/gal-run/gal/services/governance-svc/internal/domain"
	"github.com/gal-run/gal/services/governance-svc/internal/enforce"
	"github.com/gal-run/gal/services/governance-svc/internal/store"
	"github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/handler"
	"github.com/gal-run/gal/services/lib/telemetry"
)

// governance-svc: config proposals, approved configs, auto-approval AI engine,
// policy CRUD + enforcement, compliance drift detection, tool allowlists, domain audit.

func main() {
	ctx := context.Background()
	log := telemetry.Logger()

	tp, _ := telemetry.InitTracer(ctx, "governance-svc")
	defer tp.Shutdown(ctx)

	// Storage backend (SEAM 1/2). GOV_STORE selects the persistence layer:
	//   GOV_STORE=postgres  -> OSS self-host, boots GCP-free (uses DATABASE_URL).
	//   default/"firestore" -> cloud Firestore (requires GCP credentials).
	gStore := newGovernanceStore(ctx, log)
	svc := &governanceSvc{
		gStore: gStore,
		log:    log,
	}

	ja := jwtauth.New("HS256", []byte(os.Getenv("JWT_SECRET")), nil)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))

	// Health check — no auth.
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
	})

	// GAL model — no auth (dashboard, events, stats).
	r.Get("/gal/dashboard", svc.galDashboard)
	r.Get("/gal/events", svc.galEvents)
	r.Get("/gal/stats", svc.galStats)
	r.Post("/gal/simulate", svc.galSimulate)
	r.Post("/gal/infer", svc.galInfer)

	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))
		r.Use(auth.Middleware(ja))

		// Proposals
		r.Get("/proposals", svc.listProposals)
		r.Post("/proposals", svc.createProposal)
		r.Get("/proposals/{id}", svc.getProposal)
		r.Patch("/proposals/{id}", svc.updateProposal)
		r.Post("/proposals/{id}/approve", svc.approveProposal)
		r.Post("/proposals/{id}/reject", svc.rejectProposal)

		// Approved Config
		r.Get("/approved-config", svc.getApprovedConfig)
		r.Post("/approved-config/generate", svc.generateApprovedConfig)
		r.Post("/approved-config/publish", svc.publishApprovedConfig)

		// Auto-Approval Settings
		r.Get("/auto-approval/settings", svc.getAutoApprovalSettings)
		r.Patch("/auto-approval/settings", svc.updateAutoApprovalSettings)

		// Policies
		r.Get("/policies", svc.listPolicies)
		r.Post("/policies", svc.createPolicy)
		r.Get("/policies/{id}", svc.getPolicy)
		r.Patch("/policies/{id}", svc.updatePolicy)
		r.Delete("/policies/{id}", svc.deletePolicy)
		r.Post("/policies/{id}/activate", svc.activatePolicy)

		// Compliance Status
		r.Get("/compliance-status", svc.listComplianceStatus)
		r.Get("/compliance-status/{repoId}", svc.getComplianceStatusForRepo)

		// Drift Status
		r.Get("/drift-status", svc.listDriftStatus)
		r.Get("/drift-status/{appId}", svc.getDriftStatusForApp)

		// Developer Compliance
		r.Get("/developer-compliance", svc.listDeveloperCompliance)
		r.Post("/developer-compliance/report", svc.reportDeveloperCompliance)

		// Tool Policies
		r.Get("/tool-policy", svc.listToolPolicies)
		r.Post("/tool-policy", svc.createToolPolicy)
		r.Delete("/tool-policy/{id}", svc.deleteToolPolicy)

		// Domain Audit
		r.Get("/domain-audit", svc.listDomainAudit)
		r.Post("/domain-audit/query", svc.queryDomainAudit)

		// Enforcement
		r.Post("/enforcement/check", svc.enforcementCheck)
		r.Get("/enforcement/hooks", svc.enforcementHooks)
	})

	port := envOrDefault("PORT", "8080")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	}()

	log.Info("governance-svc starting", "port", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server error", "error", err)
		os.Exit(1)
	}
}

type governanceSvc struct {
	// gStore is the storage-agnostic governance persistence boundary (SEAM 1).
	// Concrete backend (Firestore for cloud, Postgres for OSS self-host) is
	// selected at construction; handlers depend only on this interface.
	gStore store.Store
	log    *slog.Logger
}

// newGovernanceStore selects the persistence backend by the GOV_STORE env var.
// "postgres" => OSS self-host (no GCP; uses DATABASE_URL + the embedded schema).
// anything else => cloud Firestore (only in the `cloud` build; requires GCP
// credentials). The OSS build links no Firestore/GCP SDK: the cloud branch is
// provided by newFirestoreStore in store_cloud.go (//go:build cloud); the OSS
// stub (store_oss.go) returns a "cloud build required" error so the self-host
// binary boots GCP-free and fails fast with a clear message if GOV_STORE is
// left at its Firestore default.
func newGovernanceStore(ctx context.Context, log *slog.Logger) store.Store {
	switch os.Getenv("GOV_STORE") {
	case "postgres":
		dsn := os.Getenv("DATABASE_URL")
		if dsn == "" {
			log.Error("GOV_STORE=postgres but DATABASE_URL is not set")
			os.Exit(1)
		}
		pg, err := store.NewPostgresStore(ctx, dsn, store.InitSchema)
		if err != nil {
			log.Error("postgres store unavailable", "error", err)
			os.Exit(1)
		}
		log.Info("governance store backend: postgres")
		return pg
	default:
		s, err := newFirestoreStore(ctx)
		if err != nil {
			log.Error("firestore backend unavailable", "error", err,
				"hint", "set GOV_STORE=postgres for self-hosted/OSS deployments")
			os.Exit(1)
		}
		log.Info("governance store backend: firestore")
		return s
	}
}

// ============================================================================
// Proposals
// ============================================================================

func (s *governanceSvc) listProposals(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}
	status := r.URL.Query().Get("status")
	scope := r.URL.Query().Get("scope")

	proposals, err := s.gStore.ListProposals(r.Context(), orgID, status, scope)
	if err != nil {
		s.log.Error("list proposals", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to list proposals", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"proposals": proposals,
		"total":     len(proposals),
	})
}

func (s *governanceSvc) createProposal(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}
	userID := auth.UserID(r.Context())

	var req struct {
		Scope      string `json:"scope"`
		ScopeID    string `json:"scopeId"`
		Content    string `json:"content"`
		ConfigType string `json:"configType"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Content == "" {
		handler.RespondError(w, http.StatusBadRequest, "missing required field: content", "BAD_REQUEST")
		return
	}

	p := &domain.ConfigProposal{
		OrgID:      orgID,
		Scope:      req.Scope,
		ScopeID:    req.ScopeID,
		Content:    req.Content,
		ProposedBy: userID,
		Status:     "pending",
	}

	id, err := s.gStore.CreateProposal(r.Context(), p)
	if err != nil {
		s.log.Error("create proposal", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to create proposal", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, map[string]any{
		"id":        id,
		"status":    "pending",
		"createdAt": p.CreatedAt,
	})
}

func (s *governanceSvc) getProposal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	proposal, err := s.gStore.GetProposal(r.Context(), id)
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "proposal not found", "NOT_FOUND")
		return
	}
	if proposal.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	handler.RespondJSON(w, http.StatusOK, proposal)
}

func (s *governanceSvc) updateProposal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	// Verify ownership.
	existing, err := s.gStore.GetProposal(r.Context(), id)
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "proposal not found", "NOT_FOUND")
		return
	}
	if existing.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	var req struct {
		Content string `json:"content"`
		Scope   string `json:"scope"`
		ScopeID string `json:"scopeId"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	updates := map[string]any{}
	if req.Content != "" {
		updates["content"] = req.Content
	}
	if req.Scope != "" {
		updates["scope"] = req.Scope
	}
	if req.ScopeID != "" {
		updates["scopeId"] = req.ScopeID
	}
	if len(updates) == 0 {
		handler.RespondError(w, http.StatusBadRequest, "no fields to update", "BAD_REQUEST")
		return
	}

	if err := s.gStore.UpdateProposalContent(r.Context(), id, updates); err != nil {
		s.log.Error("update proposal", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to update proposal", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (s *governanceSvc) approveProposal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	orgID := auth.OrgID(r.Context())
	userID := auth.UserID(r.Context())
	if orgID == "" || userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing auth", "UNAUTHORIZED")
		return
	}

	existing, err := s.gStore.GetProposal(r.Context(), id)
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "proposal not found", "NOT_FOUND")
		return
	}
	if existing.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}
	if existing.Status != "pending" {
		handler.RespondError(w, http.StatusConflict, "proposal already reviewed", "CONFLICT")
		return
	}

	var req struct {
		Comment string `json:"comment"`
	}
	handler.DecodeJSON(r, &req)

	if err := s.gStore.UpdateProposalStatus(r.Context(), id, "approved", userID, req.Comment); err != nil {
		s.log.Error("approve proposal", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to approve proposal", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "approved"})
}

func (s *governanceSvc) rejectProposal(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	orgID := auth.OrgID(r.Context())
	userID := auth.UserID(r.Context())
	if orgID == "" || userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing auth", "UNAUTHORIZED")
		return
	}

	existing, err := s.gStore.GetProposal(r.Context(), id)
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "proposal not found", "NOT_FOUND")
		return
	}
	if existing.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}
	if existing.Status != "pending" {
		handler.RespondError(w, http.StatusConflict, "proposal already reviewed", "CONFLICT")
		return
	}

	var req struct {
		Comment string `json:"comment"`
	}
	handler.DecodeJSON(r, &req)

	if err := s.gStore.UpdateProposalStatus(r.Context(), id, "rejected", userID, req.Comment); err != nil {
		s.log.Error("reject proposal", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to reject proposal", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}

// ============================================================================
// Approved Config
// ============================================================================

func (s *governanceSvc) getApprovedConfig(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}
	platform := r.URL.Query().Get("platform")
	if platform == "" {
		platform = "claude"
	}

	ac, err := s.gStore.GetApprovedConfig(r.Context(), orgID, platform)
	if err != nil {
		s.log.Error("get approved config", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to get config", "FIRESTORE_ERROR")
		return
	}
	if ac == nil {
		handler.RespondJSON(w, http.StatusOK, map[string]any{
			"orgId":    orgID,
			"platform": platform,
			"config":   nil,
		})
		return
	}
	handler.RespondJSON(w, http.StatusOK, ac)
}

func (s *governanceSvc) generateApprovedConfig(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		Platform  string `json:"platform"`
		Rationale string `json:"rationale"`
		Sources   string `json:"sources"` // JSON discovery data
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Platform == "" {
		req.Platform = "claude"
	}
	if req.Rationale == "" {
		handler.RespondError(w, http.StatusBadRequest, "rationale is required for generation", "BAD_REQUEST")
		return
	}

	// Build a generated config from the request data. This is a deterministic
	// fallback; a production deployment would invoke an AI inference service.
	configMap := map[string]string{
		"instructions": req.Rationale,
		"generatedAt":  time.Now().UTC().Format(time.RFC3339),
		"platform":     req.Platform,
	}
	if req.Sources != "" {
		configMap["sources"] = req.Sources
	}
	raw, _ := json.Marshal(configMap)

	ac := &domain.ApprovedConfig{
		OrgID:    orgID,
		Platform: req.Platform,
		Version:  "0.0.1",
		Config:   string(raw),
		Hash:     "",
	}

	id, err := s.gStore.SetApprovedConfig(r.Context(), ac)
	if err != nil {
		s.log.Error("generate approved config", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to save generated config", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, map[string]any{
		"id":       id,
		"version":  ac.Version,
		"platform": ac.Platform,
		"config":   configMap,
	})
}

func (s *governanceSvc) publishApprovedConfig(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	userID := auth.UserID(r.Context())
	if orgID == "" || userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing auth", "UNAUTHORIZED")
		return
	}

	var req struct {
		Platform string `json:"platform"`
		Config   string `json:"config"`
		Version  string `json:"version"`
		Hash     string `json:"hash"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Platform == "" {
		req.Platform = "claude"
	}

	ac := &domain.ApprovedConfig{
		OrgID:       orgID,
		Platform:    req.Platform,
		Config:      req.Config,
		Version:     req.Version,
		Hash:        req.Hash,
		PublishedBy: userID,
	}

	id, err := s.gStore.SetApprovedConfig(r.Context(), ac)
	if err != nil {
		s.log.Error("publish approved config", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to publish config", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, map[string]any{
		"id":       id,
		"version":  ac.Version,
		"platform": ac.Platform,
		"hash":     ac.Hash,
	})
}

// ============================================================================
// Auto-Approval Settings
// ============================================================================

func (s *governanceSvc) getAutoApprovalSettings(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	settings, err := s.gStore.GetAutoApprovalSettings(r.Context(), orgID)
	if err != nil {
		s.log.Error("get auto-approval settings", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to get settings", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, settings)
}

func (s *governanceSvc) updateAutoApprovalSettings(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		Enabled             *bool    `json:"enabled"`
		ConfidenceThreshold *float64 `json:"confidenceThreshold"`
		SystemPrompt        *string  `json:"systemPrompt"`
		DryRun              *bool    `json:"dryRun"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	existing, err := s.gStore.GetAutoApprovalSettings(r.Context(), orgID)
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "failed to get current settings", "FIRESTORE_ERROR")
		return
	}

	if req.Enabled != nil {
		existing.Enabled = *req.Enabled
	}
	if req.ConfidenceThreshold != nil {
		if *req.ConfidenceThreshold < 0 || *req.ConfidenceThreshold > 1 {
			handler.RespondError(w, http.StatusBadRequest, "confidenceThreshold must be between 0 and 1", "BAD_REQUEST")
			return
		}
		existing.ConfidenceThreshold = *req.ConfidenceThreshold
	}
	if req.SystemPrompt != nil {
		existing.SystemPrompt = *req.SystemPrompt
	}
	if req.DryRun != nil {
		existing.DryRun = *req.DryRun
	}

	if err := s.gStore.SetAutoApprovalSettings(r.Context(), orgID, existing); err != nil {
		s.log.Error("update auto-approval settings", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to update settings", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, existing)
}

// ============================================================================
// Policies
// ============================================================================

func (s *governanceSvc) listPolicies(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	policies, err := s.gStore.ListPolicies(r.Context(), orgID)
	if err != nil {
		s.log.Error("list policies", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to list policies", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"policies": policies,
		"total":    len(policies),
	})
}

func (s *governanceSvc) createPolicy(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	userID := auth.UserID(r.Context())
	if orgID == "" || userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing auth", "UNAUTHORIZED")
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Rules       string `json:"rules"`
		Enforcement string `json:"enforcement"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Name == "" || req.Rules == "" {
		handler.RespondError(w, http.StatusBadRequest, "name and rules are required", "BAD_REQUEST")
		return
	}
	if req.Enforcement == "" {
		req.Enforcement = "advisory"
	}

	p := &domain.Policy{
		OrgID:       orgID,
		Name:        req.Name,
		Description: req.Description,
		Rules:       req.Rules,
		Enforcement: req.Enforcement,
		IsActive:    false,
		CreatedBy:   userID,
	}

	id, err := s.gStore.CreatePolicy(r.Context(), p)
	if err != nil {
		s.log.Error("create policy", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to create policy", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, map[string]any{
		"id":       id,
		"name":     p.Name,
		"isActive": p.IsActive,
	})
}

func (s *governanceSvc) getPolicy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	policy, err := s.gStore.GetPolicy(r.Context(), id)
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "policy not found", "NOT_FOUND")
		return
	}
	if policy.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}
	handler.RespondJSON(w, http.StatusOK, policy)
}

func (s *governanceSvc) updatePolicy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	existing, err := s.gStore.GetPolicy(r.Context(), id)
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "policy not found", "NOT_FOUND")
		return
	}
	if existing.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	var req struct {
		Name        *string `json:"name"`
		Description *string `json:"description"`
		Rules       *string `json:"rules"`
		Enforcement *string `json:"enforcement"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	updates := map[string]any{}
	if req.Name != nil {
		updates["name"] = *req.Name
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.Rules != nil {
		updates["rules"] = *req.Rules
	}
	if req.Enforcement != nil {
		updates["enforcement"] = *req.Enforcement
	}
	if len(updates) == 0 {
		handler.RespondError(w, http.StatusBadRequest, "no fields to update", "BAD_REQUEST")
		return
	}

	if err := s.gStore.UpdatePolicy(r.Context(), id, updates); err != nil {
		s.log.Error("update policy", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to update policy", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (s *governanceSvc) deletePolicy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	existing, err := s.gStore.GetPolicy(r.Context(), id)
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "policy not found", "NOT_FOUND")
		return
	}
	if existing.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	if err := s.gStore.DeletePolicy(r.Context(), id); err != nil {
		s.log.Error("delete policy", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to delete policy", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *governanceSvc) activatePolicy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	existing, err := s.gStore.GetPolicy(r.Context(), id)
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "policy not found", "NOT_FOUND")
		return
	}
	if existing.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	if err := s.gStore.ActivatePolicy(r.Context(), orgID, id); err != nil {
		s.log.Error("activate policy", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to activate policy", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "activated"})
}

// ============================================================================
// Compliance Status
// ============================================================================

func (s *governanceSvc) listComplianceStatus(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	statuses, err := s.gStore.GetComplianceStatus(r.Context(), orgID)
	if err != nil {
		s.log.Error("list compliance status", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to list compliance", "FIRESTORE_ERROR")
		return
	}

	summary := domain.ComplianceSummary{}
	for _, cs := range statuses {
		summary.Total++
		switch cs.Status {
		case "compliant":
			summary.Compliant++
		case "non_compliant":
			summary.NonCompliant++
		default:
			summary.Unknown++
		}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"repos":   statuses,
		"summary": summary,
	})
}

func (s *governanceSvc) getComplianceStatusForRepo(w http.ResponseWriter, r *http.Request) {
	repoID := chi.URLParam(r, "repoId")
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	cs, err := s.gStore.GetComplianceStatusForRepo(r.Context(), orgID, repoID)
	if err != nil {
		s.log.Error("get compliance status for repo", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to get compliance", "FIRESTORE_ERROR")
		return
	}
	if cs == nil {
		handler.RespondError(w, http.StatusNotFound, "compliance status not found", "NOT_FOUND")
		return
	}
	handler.RespondJSON(w, http.StatusOK, cs)
}

// ============================================================================
// Drift Status
// ============================================================================

func (s *governanceSvc) listDriftStatus(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	reports, err := s.gStore.GetDriftReports(r.Context(), orgID)
	if err != nil {
		s.log.Error("list drift reports", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to list drift", "FIRESTORE_ERROR")
		return
	}

	summary := domain.DriftSummary{}
	for _, dr := range reports {
		summary.Total++
		switch dr.Status {
		case "in-sync":
			summary.InSync++
		case "drifted":
			summary.Drifted++
		default:
			summary.Unknown++
		}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"reports": reports,
		"summary": summary,
	})
}

func (s *governanceSvc) getDriftStatusForApp(w http.ResponseWriter, r *http.Request) {
	appID := chi.URLParam(r, "appId")
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	dr, err := s.gStore.GetDriftReportForApp(r.Context(), orgID, appID)
	if err != nil {
		s.log.Error("get drift report for app", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to get drift", "FIRESTORE_ERROR")
		return
	}
	if dr == nil {
		handler.RespondError(w, http.StatusNotFound, "drift report not found", "NOT_FOUND")
		return
	}
	handler.RespondJSON(w, http.StatusOK, dr)
}

// ============================================================================
// Developer Compliance
// ============================================================================

func (s *governanceSvc) listDeveloperCompliance(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	records, err := s.gStore.ListDeveloperCompliance(r.Context(), orgID)
	if err != nil {
		s.log.Error("list developer compliance", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to list developer compliance", "FIRESTORE_ERROR")
		return
	}

	compliant := 0
	nonCompliant := 0
	for _, dc := range records {
		if dc.DriftDetected {
			nonCompliant++
		} else {
			compliant++
		}
	}

	compliancePct := 100.0
	if len(records) > 0 {
		compliancePct = float64(compliant) / float64(len(records)) * 100
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"organization":      orgID,
		"totalDevelopers":   len(records),
		"compliant":         compliant,
		"nonCompliant":      nonCompliant,
		"compliancePercent": compliancePct,
		"developers":        records,
		"lastUpdated":       time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *governanceSvc) reportDeveloperCompliance(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		DeveloperID   string `json:"developerId"`
		SettingsHash  string `json:"settingsHash"`
		OrgHash       string `json:"orgHash"`
		DriftDetected bool   `json:"driftDetected"`
		LastSyncTime  string `json:"lastSyncTime"`
		CliVersion    string `json:"cliVersion"`
		Hostname      string `json:"hostname"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.DeveloperID == "" {
		handler.RespondError(w, http.StatusBadRequest, "developerId is required", "BAD_REQUEST")
		return
	}

	dc := &domain.DeveloperCompliance{
		DeveloperID:   req.DeveloperID,
		OrgID:         orgID,
		SettingsHash:  req.SettingsHash,
		OrgHash:       req.OrgHash,
		DriftDetected: req.DriftDetected,
		LastSyncTime:  req.LastSyncTime,
		CliVersion:    req.CliVersion,
		Hostname:      req.Hostname,
		ReportCount:   1,
	}

	if err := s.gStore.ReportDeveloperCompliance(r.Context(), orgID, dc); err != nil {
		s.log.Error("report developer compliance", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to report compliance", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"ok":            true,
		"driftDetected": req.DriftDetected,
	})
}

// ============================================================================
// Tool Policies
// ============================================================================

func (s *governanceSvc) listToolPolicies(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	policies, err := s.gStore.ListToolPolicies(r.Context(), orgID)
	if err != nil {
		s.log.Error("list tool policies", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to list tool policies", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"policies": policies,
		"total":    len(policies),
	})
}

func (s *governanceSvc) createToolPolicy(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	userID := auth.UserID(r.Context())
	if orgID == "" || userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing auth", "UNAUTHORIZED")
		return
	}

	var req struct {
		Tool       string `json:"tool"`
		Action     string `json:"action"` // allow, deny, audit
		Conditions string `json:"conditions"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Tool == "" || req.Action == "" {
		handler.RespondError(w, http.StatusBadRequest, "tool and action are required", "BAD_REQUEST")
		return
	}

	tp := &domain.ToolPolicy{
		OrgID:      orgID,
		Tool:       req.Tool,
		Action:     req.Action,
		Conditions: req.Conditions,
		CreatedBy:  userID,
	}

	id, err := s.gStore.CreateToolPolicy(r.Context(), tp)
	if err != nil {
		s.log.Error("create tool policy", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to create tool policy", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (s *governanceSvc) deleteToolPolicy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	if err := s.gStore.DeleteToolPolicy(r.Context(), id); err != nil {
		s.log.Error("delete tool policy", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to delete tool policy", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ============================================================================
// Domain Audit
// ============================================================================

func (s *governanceSvc) listDomainAudit(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 500 {
		limit = l
	}

	entries, err := s.gStore.ListDomainAudit(r.Context(), orgID, limit)
	if err != nil {
		s.log.Error("list domain audit", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to list domain audit", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"entries": entries,
		"total":   len(entries),
	})
}

func (s *governanceSvc) queryDomainAudit(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		Domain string `json:"domain"`
		Tool   string `json:"tool"`
		Action string `json:"action"`
		Limit  int    `json:"limit"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Limit <= 0 || req.Limit > 500 {
		req.Limit = 100
	}

	entries, err := s.gStore.QueryDomainAudit(r.Context(), orgID, req.Domain, req.Tool, req.Action, req.Limit)
	if err != nil {
		s.log.Error("query domain audit", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to query domain audit", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"entries": entries,
		"total":   len(entries),
	})
}

// ============================================================================
// Enforcement
// ============================================================================

func (s *governanceSvc) enforcementCheck(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req domain.EnforcementCheckRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	// Find the active policy for this org.
	policies, err := s.gStore.ListPolicies(r.Context(), orgID)
	if err != nil {
		s.log.Error("enforcement check list policies", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "enforcement check failed", "FIRESTORE_ERROR")
		return
	}

	var activePolicy *domain.Policy
	for _, p := range policies {
		if p.IsActive {
			activePolicy = &p
			break
		}
	}

	if activePolicy == nil {
		// No active policy — allow by default.
		handler.RespondJSON(w, http.StatusOK, domain.EnforcementCheckResult{
			Allowed: true,
			Action:  "allowed",
			Reason:  "no active policy configured",
		})
		return
	}

	result := enforce.EvaluatePolicyDecision(*activePolicy, req)

	handler.RespondJSON(w, http.StatusOK, result)
}

func (s *governanceSvc) enforcementHooks(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	hooks, err := s.gStore.ListEnforcementWebhooks(r.Context(), orgID)
	if err != nil {
		s.log.Error("list enforcement hooks", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to list enforcement hooks", "FIRESTORE_ERROR")
		return
	}
	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"hooks": hooks,
		"total": len(hooks),
	})
}

// ============================================================================
// Utility
// ============================================================================

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
