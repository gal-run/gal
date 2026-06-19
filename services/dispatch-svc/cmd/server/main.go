//go:build cloud
// +build cloud

// dispatch-svc owns background agent session lifecycle, queue management,
// work item dispatch, swarm run planning, orchestration control, and
// supervisor directives. This is the core engine of the GAL platform.
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	gcpfirestore "cloud.google.com/go/firestore"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"
	"github.com/google/uuid"

	"github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/firestore"
	"github.com/gal-run/gal/services/lib/handler"
	"github.com/gal-run/gal/services/lib/telemetry"
)

func main() {
	ctx := context.Background()
	log := telemetry.Logger()

	tp, _ := telemetry.InitTracer(ctx, "dispatch-svc")
	defer tp.Shutdown(ctx)

	fsClient, err := firestore.Client(ctx)
	if err != nil {
		log.Error("firestore unavailable", "error", err)
		os.Exit(1)
	}

	store := firestore.NewServiceStore(fsClient, map[string]string{
		"sessions":            "sessions",
		"session_outputs":     "session_outputs",
		"work_items":          "work_items",
		"queue_state":         "queue_state",
		"dispatch_rules":      "dispatch_rules",
		"swarm_runs":          "swarm_runs",
		"orchestration_state": "orchestration_state",
		"agent_activity":      "agent_activity",
	})

	svc := &dispatchService{
		store: store,
		log:   log,
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

	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))
		r.Use(auth.Middleware(ja))

		// ── Sessions ──────────────────────────────────────────────────────
		r.Post("/sessions", svc.createSession)
		r.Get("/sessions", svc.listSessions)
		r.Get("/sessions/{id}", svc.getSession)
		r.Patch("/sessions/{id}", svc.updateSession)
		r.Delete("/sessions/{id}", svc.cancelSession)
		r.Post("/sessions/{id}/dispatch", svc.dispatchSession)
		r.Get("/sessions/{id}/stream", svc.streamSessionSSE)
		r.Get("/sessions/{id}/audit-log", svc.getSessionAuditLog)

		// ── Queue ─────────────────────────────────────────────────────────
		r.Get("/queue", svc.getQueueVisibility)
		r.Post("/queue", svc.enqueueWorkItem)
		r.Get("/queue/status", svc.getQueueStatus)
		r.Post("/queue/consumer/start", svc.startQueueConsumer)
		r.Post("/queue/consumer/stop", svc.stopQueueConsumer)
		r.Get("/queue/summary", svc.getQueueSummary)

		// ── Work Items ────────────────────────────────────────────────────
		r.Get("/work-items", svc.listWorkItems)
		r.Post("/work-items", svc.createWorkItem)
		r.Get("/work-items/{id}", svc.getWorkItem)
		r.Patch("/work-items/{id}", svc.updateWorkItem)
		r.Post("/work-items/{id}/claim", svc.claimWorkItem)
		r.Post("/work-items/{id}/release", svc.releaseWorkItem)

		// ── Dispatch Rules ────────────────────────────────────────────────
		r.Get("/dispatch-rules", svc.listDispatchRules)
		r.Post("/dispatch-rules", svc.createDispatchRule)
		r.Patch("/dispatch-rules/{id}", svc.updateDispatchRule)
		r.Delete("/dispatch-rules/{id}", svc.deleteDispatchRule)
		r.Get("/dispatch/health", svc.getDispatchHealth)

		// ── Swarm ─────────────────────────────────────────────────────────
		r.Post("/swarm/run", svc.startSwarmRun)
		r.Get("/swarm/run/{id}", svc.getSwarmRun)
		r.Get("/swarm/pool", svc.getSwarmPool)
		r.Post("/swarm/run/{id}/cancel", svc.cancelSwarmRun)
		r.Post("/swarm/run/{id}/closeout", svc.closeoutSwarmRun)

		// ── Orchestration ─────────────────────────────────────────────────
		r.Get("/orchestration/status", svc.getOrchestrationStatus)
		r.Post("/orchestration/directive", svc.sendOrchestrationDirective)
		r.Get("/orchestration/sessions", svc.listOrchestratedSessions)
		r.Get("/supervisor/directives", svc.listSupervisorDirectives)
		r.Post("/supervisor/directives/{id}/resolve", svc.resolveSupervisorDirective)

		// ── Agent Activity ────────────────────────────────────────────────
		r.Get("/agent-activity", svc.listAgentActivity)
		r.Get("/agent-activity/{agentId}", svc.getAgentActivity)
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

	log.Info("dispatch-svc starting", "port", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server error", "error", err)
		os.Exit(1)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Service struct
// ─────────────────────────────────────────────────────────────────────────────

type dispatchService struct {
	store *firestore.ServiceStore
	log   *slog.Logger
}

// ─────────────────────────────────────────────────────────────────────────────
// Session types
// ─────────────────────────────────────────────────────────────────────────────

type Session struct {
	ID             string    `json:"id" firestore:"id"`
	OrgID          string    `json:"orgId" firestore:"orgId"`
	UserID         string    `json:"userId" firestore:"userId"`
	Name           string    `json:"name" firestore:"name"`
	Agent          string    `json:"agent" firestore:"agent"`
	Prompt         string    `json:"prompt" firestore:"prompt"`
	ProjectContext string    `json:"projectContext" firestore:"projectContext"`
	Status         string    `json:"status" firestore:"status"` // pending, running, completed, failed, cancelled
	Branch         string    `json:"branch" firestore:"branch"`
	WorkflowRunID  string    `json:"workflowRunId" firestore:"workflowRunId"`
	RunnerLabel    string    `json:"runnerLabel" firestore:"runnerLabel"`
	Metadata       map[string]any `json:"metadata,omitempty" firestore:"metadata,omitempty"`
	ErrorMessage   string    `json:"errorMessage,omitempty" firestore:"errorMessage,omitempty"`
	CreatedAt      time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt" firestore:"updatedAt"`
}

type CreateSessionRequest struct {
	Org            string         `json:"org"`
	Name           string         `json:"name"`
	Agent          string         `json:"agent"`
	Prompt         string         `json:"prompt"`
	ProjectContext string         `json:"projectContext"`
	RunnerLabel    string         `json:"runnerLabel"`
	Branch         string         `json:"branch"`
	Model          string         `json:"model"`
	Metadata       map[string]any `json:"metadata"`
}

type UpdateSessionRequest struct {
	Name           string         `json:"name"`
	Status         string         `json:"status"`
	Branch         string         `json:"branch"`
	WorkflowRunID  string         `json:"workflowRunId"`
	ErrorMessage   string         `json:"errorMessage"`
	Metadata       map[string]any `json:"metadata"`
	RunnerLabel    string         `json:"runnerLabel"`
}

type AuditLogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Action    string    `json:"action"`
	ActorID   string    `json:"actorId"`
	Details   string    `json:"details"`
}

func auditLogDocID(sessionID string) string {
	return fmt.Sprintf("sessions/%s/audit", sessionID)
}

// ─────────────────────────────────────────────────────────────────────────────
// Session Handlers
// ─────────────────────────────────────────────────────────────────────────────

func (s *dispatchService) createSession(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	userID := auth.UserID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing user", "UNAUTHORIZED")
		return
	}

	var req CreateSessionRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	// If org param is provided in body, prefer it (dashboard workspace switcher support)
	if req.Org != "" {
		orgID = req.Org
	}

	agent := req.Agent
	if agent == "" {
		agent = "claude"
	}

	session := Session{
		ID:             uuid.New().String(),
		OrgID:          orgID,
		UserID:         userID,
		Name:           req.Name,
		Agent:          agent,
		Prompt:         req.Prompt,
		ProjectContext: req.ProjectContext,
		Status:         "pending",
		Branch:         req.Branch,
		RunnerLabel:    req.RunnerLabel,
		Metadata:       req.Metadata,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	if session.Name == "" {
		session.Name = fmt.Sprintf("Session %s", session.ID[:8])
	}

	// Use a fresh context so Firestore writes don't inherit the gateway proxy deadline.
	storeCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	start := time.Now()
	_, err := s.store.Doc("sessions", session.ID).Set(storeCtx, session)
	s.log.Info("firestore write", "collection", "sessions", "id", session.ID, "duration", time.Since(start).String())
	if err != nil {
		s.log.Error("failed to create session", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to create session", "FIRESTORE_ERROR")
		return
	}

	s.writeAuditLog(context.Background(), session.ID, "session.created", userID, fmt.Sprintf("Session created with agent=%s", agent))

	handler.RespondJSON(w, http.StatusCreated, session)
}

func (s *dispatchService) listSessions(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	statusFilter := r.URL.Query().Get("status")
	agentFilter := r.URL.Query().Get("agent")

	iter := s.store.Collection("sessions").Documents(r.Context())
	var sessions []Session
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var session Session
		doc.DataTo(&session)

		// Filter by org
		if session.OrgID != orgID {
			continue
		}
		// Filter by status
		if statusFilter != "" && session.Status != statusFilter {
			continue
		}
		// Filter by agent
		if agentFilter != "" && session.Agent != agentFilter {
			continue
		}

		sessions = append(sessions, session)
	}

	if sessions == nil {
		sessions = []Session{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"sessions": sessions,
		"count":    len(sessions),
	})
}

func (s *dispatchService) getSession(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	sessionID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("sessions", sessionID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "session not found", "NOT_FOUND")
		return
	}

	var session Session
	doc.DataTo(&session)

	if session.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	handler.RespondJSON(w, http.StatusOK, session)
}

func (s *dispatchService) updateSession(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	sessionID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("sessions", sessionID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "session not found", "NOT_FOUND")
		return
	}

	var session Session
	doc.DataTo(&session)
	if session.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	var req UpdateSessionRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	updates := map[string]any{}
	if req.Status != "" {
		// Validate status transition
		if !isValidStatusTransition(session.Status, req.Status) {
			handler.RespondError(w, http.StatusConflict,
				fmt.Sprintf("invalid status transition from %s to %s", session.Status, req.Status),
				"INVALID_TRANSITION")
			return
		}
		updates["status"] = req.Status
	}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Branch != "" {
		updates["branch"] = req.Branch
	}
	if req.WorkflowRunID != "" {
		updates["workflowRunId"] = req.WorkflowRunID
	}
	if req.ErrorMessage != "" {
		updates["errorMessage"] = req.ErrorMessage
	}
	if req.RunnerLabel != "" {
		updates["runnerLabel"] = req.RunnerLabel
	}
	if req.Metadata != nil {
		updates["metadata"] = req.Metadata
	}
	updates["updatedAt"] = time.Now()

	_, err = s.store.Doc("sessions", sessionID).Set(r.Context(), updates, gcpfirestore.MergeAll)
	if err != nil {
		s.log.Error("failed to update session", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to update session", "FIRESTORE_ERROR")
		return
	}

	// Re-read to return updated session
	doc, _ = s.store.Doc("sessions", sessionID).Get(r.Context())
	var updated Session
	doc.DataTo(&updated)

	s.writeAuditLog(r.Context(), sessionID, "session.updated", auth.UserID(r.Context()),
		fmt.Sprintf("Session updated: status=%s", req.Status))

	handler.RespondJSON(w, http.StatusOK, updated)
}

func (s *dispatchService) cancelSession(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	sessionID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("sessions", sessionID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "session not found", "NOT_FOUND")
		return
	}

	var session Session
	doc.DataTo(&session)
	if session.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	if session.Status == "completed" || session.Status == "cancelled" || session.Status == "failed" {
		handler.RespondError(w, http.StatusConflict, "session already in terminal state", "TERMINAL_STATE")
		return
	}

	_, err = s.store.Doc("sessions", sessionID).Set(r.Context(), map[string]any{
		"status":    "cancelled",
		"updatedAt": time.Now(),
	}, gcpfirestore.MergeAll)
	if err != nil {
		s.log.Error("failed to cancel session", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to cancel session", "FIRESTORE_ERROR")
		return
	}

	s.writeAuditLog(r.Context(), sessionID, "session.cancelled", auth.UserID(r.Context()), "Session cancelled by user")

	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "cancelled", "id": sessionID})
}

func (s *dispatchService) dispatchSession(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	sessionID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("sessions", sessionID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "session not found", "NOT_FOUND")
		return
	}

	var session Session
	doc.DataTo(&session)
	if session.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	if session.Status != "pending" {
		handler.RespondError(w, http.StatusConflict,
			fmt.Sprintf("cannot dispatch session in '%s' status", session.Status),
			"INVALID_STATE")
		return
	}

	var req struct {
		Agent       string `json:"agent"`
		RunnerLabel string `json:"runnerLabel"`
		Branch      string `json:"branch"`
	}
	if err := handler.DecodeJSON(r, &req); err == nil {
		if req.Agent != "" {
			session.Agent = req.Agent
		}
		if req.RunnerLabel != "" {
			session.RunnerLabel = req.RunnerLabel
		}
		if req.Branch != "" {
			session.Branch = req.Branch
		}
	}

	// Transition to dispatching
	_, err = s.store.Doc("sessions", sessionID).Set(r.Context(), map[string]any{
		"status":        "dispatching",
		"agent":         session.Agent,
		"runnerLabel":   session.RunnerLabel,
		"branch":        session.Branch,
		"updatedAt":     time.Now(),
	}, gcpfirestore.MergeAll)
	if err != nil {
		s.log.Error("failed to update session for dispatch", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "dispatch failed", "FIRESTORE_ERROR")
		return
	}

	// TODO: Integrate with Stratus dispatch service to trigger workflow
	s.log.Info("session dispatched", "sessionId", sessionID, "org", orgID, "agent", session.Agent)

	s.writeAuditLog(r.Context(), sessionID, "session.dispatched", auth.UserID(r.Context()),
		fmt.Sprintf("Agent dispatched: agent=%s runnerLabel=%s", session.Agent, session.RunnerLabel))

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"id":     sessionID,
		"status": "dispatching",
		"agent":  session.Agent,
	})
}

func (s *dispatchService) streamSessionSSE(w http.ResponseWriter, r *http.Request) {
	sessionID := chi.URLParam(r, "id")

	// SSE stream uses token-based auth (query param or header)
	// If the user is authenticated via JWT, use that; otherwise allow query token
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		token := r.URL.Query().Get("token")
		if token == "" {
			handler.RespondError(w, http.StatusUnauthorized, "authentication required", "AUTH_REQUIRED")
			return
		}
		// Validate stream token (simplified: accept non-empty tokens)
		if len(token) < 8 {
			handler.RespondError(w, http.StatusUnauthorized, "invalid token", "INVALID_TOKEN")
			return
		}
	}

	// Verify session exists
	doc, err := s.store.Doc("sessions", sessionID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "session not found", "NOT_FOUND")
		return
	}

	var session Session
	doc.DataTo(&session)
	if orgID != "" && session.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.(http.Flusher)
	if !ok {
		handler.RespondError(w, http.StatusInternalServerError, "streaming not supported", "STREAM_ERROR")
		return
	}

	// Send initial connected event
	sendSSE := func(event string, data map[string]any) {
		payload := map[string]any{"type": event}
		for k, v := range data {
			payload[k] = v
		}
		b, _ := json.Marshal(payload)
		fmt.Fprintf(w, "data: %s\n\n", string(b))
		flusher.Flush()
	}

	sendSSE("connected", map[string]any{
		"sessionId":      sessionID,
		"bufferedOutput": "",
	})

	// Heartbeat ticker
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	// Watch for context cancellation (client disconnect)
	notify := r.Context().Done()

	for {
		select {
		case <-notify:
			s.log.Info("SSE client disconnected", "sessionId", sessionID)
			return
		case <-ticker.C:
			sendSSE("heartbeat", map[string]any{"ts": time.Now().UnixMilli()})

			// Check if session has reached terminal state
			doc, err := s.store.Doc("sessions", sessionID).Get(r.Context())
			if err == nil {
				var current Session
				doc.DataTo(&current)
				if current.Status == "completed" || current.Status == "failed" || current.Status == "cancelled" {
					sendSSE("done", map[string]any{"reason": current.Status})
					return
				}
			}
		}
	}
}

func (s *dispatchService) getSessionAuditLog(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	sessionID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	// Verify session exists and belongs to org
	doc, err := s.store.Doc("sessions", sessionID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "session not found", "NOT_FOUND")
		return
	}
	var session Session
	doc.DataTo(&session)
	if session.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	// Read audit log entries from subcollection
	auditID := auditLogDocID(sessionID)
	auditRef := s.store.Doc("session_outputs", auditID)
	auditDoc, err := auditRef.Get(r.Context())
	if err != nil {
		// No audit log yet
		handler.RespondJSON(w, http.StatusOK, map[string]any{
			"sessionId": sessionID,
			"events":    []AuditLogEntry{},
		})
		return
	}

	var entries struct {
		Events []AuditLogEntry `json:"events"`
	}
	auditDoc.DataTo(&entries)
	if entries.Events == nil {
		entries.Events = []AuditLogEntry{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"sessionId": sessionID,
		"events":    entries.Events,
	})
}

func (s *dispatchService) writeAuditLog(ctx context.Context, sessionID, action, actorID, details string) {
	auditID := auditLogDocID(sessionID)
	entry := AuditLogEntry{
		Timestamp: time.Now(),
		Action:    action,
		ActorID:   actorID,
		Details:   details,
	}

	// Read existing entries, append new one
	auditRef := s.store.Doc("session_outputs", auditID)
	doc, err := auditRef.Get(ctx)
	var entries struct {
		Events []AuditLogEntry `json:"events"`
	}
	if err == nil {
		doc.DataTo(&entries)
	}
	if entries.Events == nil {
		entries.Events = []AuditLogEntry{}
	}
	entries.Events = append(entries.Events, entry)

	// Limit audit log size
	if len(entries.Events) > 1000 {
		entries.Events = entries.Events[len(entries.Events)-1000:]
	}

	auditRef.Set(ctx, entries, gcpfirestore.MergeAll)
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue Types
// ─────────────────────────────────────────────────────────────────────────────

type QueueItem struct {
	ID             string    `json:"id" firestore:"id"`
	OrgID          string    `json:"orgId" firestore:"orgId"`
	Type           string    `json:"type" firestore:"type"`
	Command        string    `json:"command" firestore:"command"`
	Source         any       `json:"source" firestore:"source"`
	Priority       int       `json:"priority" firestore:"priority"`
	Status         string    `json:"status" firestore:"status"` // pending, claimed, in_progress, completed, failed
	Context        string    `json:"context,omitempty" firestore:"context,omitempty"`
	ClaimedBy      string    `json:"claimedBy,omitempty" firestore:"claimedBy,omitempty"`
	ClaimedAt      *time.Time `json:"claimedAt,omitempty" firestore:"claimedAt,omitempty"`
	SessionID      string    `json:"sessionId,omitempty" firestore:"sessionId,omitempty"`
	PreferredAgent string    `json:"preferredAgent,omitempty" firestore:"preferredAgent,omitempty"`
	MaxRetries     int       `json:"maxRetries" firestore:"maxRetries"`
	RetryCount     int       `json:"retryCount" firestore:"retryCount"`
	CreatedAt      time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt" firestore:"updatedAt"`
	CompletedAt    *time.Time `json:"completedAt,omitempty" firestore:"completedAt,omitempty"`
	Result         any       `json:"result,omitempty" firestore:"result,omitempty"`
}

type QueueStatus struct {
	Pending          int        `json:"pending"`
	Active           int        `json:"active"`
	CompletedToday   int        `json:"completedToday"`
	FailedToday      int        `json:"failedToday"`
	ConsumerHealthy  bool       `json:"consumerHealthy"`
	LastDispatchAt   *time.Time `json:"lastDispatchAt,omitempty"`
	DailyCostUSD     float64    `json:"dailyCostUsd"`
	DailyBudgetUSD   float64    `json:"dailyBudgetUsd"`
	QueueDepth       int        `json:"queueDepth"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue Handlers
// ─────────────────────────────────────────────────────────────────────────────

func (s *dispatchService) getQueueVisibility(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("work_items").Documents(r.Context())
	var pending, active int

	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var item QueueItem
		doc.DataTo(&item)
		if item.OrgID != orgID {
			continue
		}
		switch item.Status {
		case "pending":
			pending++
		case "claimed", "in_progress":
			active++
		}
	}

	// Read queue consumer state
	var consumerHealthy bool = true
	stateDoc, err := s.store.Doc("queue_state", orgID).Get(r.Context())
	if err == nil {
		var qs struct {
			ConsumerHealthy bool `json:"consumerHealthy"`
		}
		stateDoc.DataTo(&qs)
		consumerHealthy = qs.ConsumerHealthy
	}

	handler.RespondJSON(w, http.StatusOK, QueueStatus{
		Pending:         pending,
		Active:          active,
		CompletedToday:  0,
		FailedToday:     0,
		ConsumerHealthy: consumerHealthy,
		QueueDepth:      pending + active,
	})
}

func (s *dispatchService) enqueueWorkItem(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		Type           string `json:"type"`
		Command        string `json:"command"`
		Source         any    `json:"source"`
		Priority       int    `json:"priority"`
		Context        string `json:"context"`
		PreferredAgent string `json:"preferredAgent"`
		MaxRetries     int    `json:"maxRetries"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.Command == "" {
		handler.RespondError(w, http.StatusBadRequest, "command is required", "BAD_REQUEST")
		return
	}

	item := QueueItem{
		ID:             uuid.New().String(),
		OrgID:          orgID,
		Type:           req.Type,
		Command:        req.Command,
		Source:         req.Source,
		Priority:       req.Priority,
		Status:         "pending",
		Context:        req.Context,
		PreferredAgent: req.PreferredAgent,
		MaxRetries:     req.MaxRetries,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}
	if item.Type == "" {
		item.Type = "implement"
	}
	if item.Priority < 0 || item.Priority > 3 {
		item.Priority = 3
	}

	_, err := s.store.Doc("work_items", item.ID).Set(r.Context(), item)
	if err != nil {
		s.log.Error("failed to create work item", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to enqueue work item", "FIRESTORE_ERROR")
		return
	}

	// Record in queue_state last dispatch tracking
	updateQueueState(s, r.Context(), orgID, "last_enqueued_at", time.Now())

	handler.RespondJSON(w, http.StatusCreated, item)
}

func (s *dispatchService) getQueueStatus(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("work_items").Documents(r.Context())
	var pending, active, completedToday, failedToday int
	var lastDispatchAt *time.Time
	var dailyCostUSD float64
	now := time.Now()
	todayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)

	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var item QueueItem
		doc.DataTo(&item)
		if item.OrgID != orgID {
			continue
		}

		switch item.Status {
		case "pending":
			pending++
		case "claimed", "in_progress":
			active++
			if item.ClaimedAt != nil && (lastDispatchAt == nil || item.ClaimedAt.After(*lastDispatchAt)) {
				lastDispatchAt = item.ClaimedAt
			}
		case "completed":
			if item.CompletedAt != nil && item.CompletedAt.After(todayStart) {
				completedToday++
				// Extract cost from result if available
				if item.Result != nil {
					if resultMap, ok := item.Result.(map[string]any); ok {
						if details, ok := resultMap["details"].(map[string]any); ok {
							if cost, ok := details["cost_usd"].(float64); ok {
								dailyCostUSD += cost
							}
						}
					}
				}
			}
		case "failed":
			if item.CompletedAt != nil && item.CompletedAt.After(todayStart) {
				failedToday++
			}
		}
	}

	// Read queue consumer state
	var consumerHealthy bool = true
	stateDoc, err := s.store.Doc("queue_state", orgID).Get(r.Context())
	if err == nil {
		var qs struct {
			ConsumerHealthy bool       `json:"consumerHealthy"`
			LastHeartbeatAt *time.Time `json:"lastHeartbeatAt"`
		}
		stateDoc.DataTo(&qs)
		consumerHealthy = qs.ConsumerHealthy
		if qs.LastHeartbeatAt != nil {
			staleThreshold := time.Now().Add(-30 * time.Minute)
			consumerHealthy = qs.LastHeartbeatAt.After(staleThreshold)
		}
	}

	handler.RespondJSON(w, http.StatusOK, QueueStatus{
		Pending:         pending,
		Active:          active,
		CompletedToday:  completedToday,
		FailedToday:     failedToday,
		ConsumerHealthy: consumerHealthy,
		LastDispatchAt:  lastDispatchAt,
		DailyCostUSD:    dailyCostUSD,
		QueueDepth:      pending + active,
	})
}

func (s *dispatchService) startQueueConsumer(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	// Update queue state to mark consumer as running
	updateQueueState(s, r.Context(), orgID, "consumer_running", true)
	updateQueueState(s, r.Context(), orgID, "consumer_started_at", time.Now())
	updateQueueState(s, r.Context(), orgID, "consumer_healthy", true)

	s.log.Info("queue consumer started", "org", orgID)
	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"status":  "started",
		"orgId":   orgID,
	})
}

func (s *dispatchService) stopQueueConsumer(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	updateQueueState(s, r.Context(), orgID, "consumer_running", false)

	s.log.Info("queue consumer stopped", "org", orgID)
	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"status":  "stopped",
		"orgId":   orgID,
	})
}

func (s *dispatchService) getQueueSummary(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	dateParam := r.URL.Query().Get("date")
	var dayStart time.Time
	if dateParam != "" {
		var err error
		dayStart, err = time.Parse("2006-01-02", dateParam)
		if err != nil {
			handler.RespondError(w, http.StatusBadRequest, "invalid date format, use YYYY-MM-DD", "BAD_REQUEST")
			return
		}
	} else {
		now := time.Now()
		dayStart = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	}
	dayEnd := dayStart.Add(24 * time.Hour)

	iter := s.store.Collection("work_items").Documents(r.Context())
	var completed, failed, pending, active int
	var totalCostUSD float64
	var items []map[string]any

	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var item QueueItem
		doc.DataTo(&item)
		if item.OrgID != orgID {
			continue
		}

		switch item.Status {
		case "pending":
			pending++
		case "claimed", "in_progress":
			active++
		case "completed":
			if item.CompletedAt != nil && item.CompletedAt.After(dayStart) && item.CompletedAt.Before(dayEnd) {
				completed++
				if item.Result != nil {
					if resultMap, ok := item.Result.(map[string]any); ok {
						if details, ok := resultMap["details"].(map[string]any); ok {
							if cost, ok := details["cost_usd"].(float64); ok {
								totalCostUSD += cost
							}
						}
					}
				}
				items = append(items, map[string]any{
					"id":           item.ID,
					"type":         item.Type,
					"status":       item.Status,
					"command":      item.Command,
					"completedAt":  item.CompletedAt,
				})
			}
		case "failed":
			if item.CompletedAt != nil && item.CompletedAt.After(dayStart) && item.CompletedAt.Before(dayEnd) {
				failed++
				items = append(items, map[string]any{
					"id":           item.ID,
					"type":         item.Type,
					"status":       item.Status,
					"command":      item.Command,
					"completedAt":  item.CompletedAt,
				})
			}
		}
	}

	budgetUSD := 100.0
	budgetUtilizationPct := 0.0
	if budgetUSD > 0 {
		budgetUtilizationPct = (totalCostUSD / budgetUSD) * 100
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"date":                dayStart.Format("2006-01-02"),
		"completed":           completed,
		"failed":              failed,
		"pending":             pending,
		"active":              active,
		"totalCostUsd":        totalCostUSD,
		"budgetUsd":           budgetUSD,
		"budgetUtilizationPct": budgetUtilizationPct,
		"items":               items,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Work Item Handlers
// ─────────────────────────────────────────────────────────────────────────────

func (s *dispatchService) listWorkItems(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	statusFilter := r.URL.Query().Get("status")
	iter := s.store.Collection("work_items").Documents(r.Context())
	var items []QueueItem

	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var item QueueItem
		doc.DataTo(&item)
		if item.OrgID != orgID {
			continue
		}
		if statusFilter != "" && item.Status != statusFilter {
			continue
		}
		items = append(items, item)
	}

	if items == nil {
		items = []QueueItem{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"workItems": items,
		"count":     len(items),
	})
}

func (s *dispatchService) createWorkItem(w http.ResponseWriter, r *http.Request) {
	// Reuses enqueueWorkItem logic — creates a work item
	s.enqueueWorkItem(w, r)
}

func (s *dispatchService) getWorkItem(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	itemID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("work_items", itemID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "work item not found", "NOT_FOUND")
		return
	}

	var item QueueItem
	doc.DataTo(&item)
	if item.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	handler.RespondJSON(w, http.StatusOK, item)
}

func (s *dispatchService) updateWorkItem(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	itemID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("work_items", itemID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "work item not found", "NOT_FOUND")
		return
	}

	var item QueueItem
	doc.DataTo(&item)
	if item.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	var req struct {
		Status         string `json:"status"`
		Command        string `json:"command"`
		Priority       *int   `json:"priority"`
		Context        string `json:"context"`
		PreferredAgent string `json:"preferredAgent"`
		Result         any    `json:"result"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	updates := map[string]any{}
	if req.Status != "" {
		if !isValidWorkItemStatusTransition(item.Status, req.Status) {
			handler.RespondError(w, http.StatusConflict,
				fmt.Sprintf("invalid status transition from %s to %s", item.Status, req.Status),
				"INVALID_TRANSITION")
			return
		}
		updates["status"] = req.Status
	}
	if req.Command != "" {
		updates["command"] = req.Command
	}
	if req.Priority != nil {
		p := *req.Priority
		if p < 0 || p > 3 {
			handler.RespondError(w, http.StatusBadRequest, "priority must be 0-3", "BAD_REQUEST")
			return
		}
		updates["priority"] = p
	}
	if req.Context != "" {
		updates["context"] = req.Context
	}
	if req.PreferredAgent != "" {
		updates["preferredAgent"] = req.PreferredAgent
	}
	if req.Result != nil {
		updates["result"] = req.Result
	}
	if req.Status == "completed" || req.Status == "failed" {
		now := time.Now()
		updates["completedAt"] = now
	}
	updates["updatedAt"] = time.Now()

	_, err = s.store.Doc("work_items", itemID).Set(r.Context(), updates, gcpfirestore.MergeAll)
	if err != nil {
		s.log.Error("failed to update work item", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to update work item", "FIRESTORE_ERROR")
		return
	}

	// Re-read
	doc, _ = s.store.Doc("work_items", itemID).Get(r.Context())
	var updated QueueItem
	doc.DataTo(&updated)

	handler.RespondJSON(w, http.StatusOK, updated)
}

func (s *dispatchService) claimWorkItem(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	userID := auth.UserID(r.Context())
	itemID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		AgentID string `json:"agentId"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	agentID := req.AgentID
	if agentID == "" {
		agentID = userID
	}

	// Atomic claim using Firestore transaction
	err := s.store.RunTx(r.Context(), func(ctx context.Context, tx *gcpfirestore.Transaction) error {
		docRef := s.store.Doc("work_items", itemID)
		doc, err := tx.Get(docRef)
		if err != nil {
			return fmt.Errorf("work item not found")
		}

		var item QueueItem
		doc.DataTo(&item)
		if item.OrgID != orgID {
			return fmt.Errorf("access denied")
		}
		if item.Status != "pending" {
			return fmt.Errorf("work item is not pending (status=%s)", item.Status)
		}

		now := time.Now()
		return tx.Set(docRef, map[string]any{
			"status":    "claimed",
			"claimedBy": agentID,
			"claimedAt": now,
			"updatedAt": now,
		}, gcpfirestore.MergeAll)
	})

	if err != nil {
		errMsg := err.Error()
		if strings.Contains(errMsg, "not found") {
			handler.RespondError(w, http.StatusNotFound, errMsg, "NOT_FOUND")
		} else if strings.Contains(errMsg, "access denied") {
			handler.RespondError(w, http.StatusForbidden, errMsg, "FORBIDDEN")
		} else if strings.Contains(errMsg, "not pending") {
			handler.RespondError(w, http.StatusConflict, errMsg, "CONFLICT")
		} else {
			s.log.Error("transaction failed", "error", err)
			handler.RespondError(w, http.StatusInternalServerError, "claim failed", "TRANSACTION_ERROR")
		}
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"id":      itemID,
		"status":  "claimed",
	})
}

func (s *dispatchService) releaseWorkItem(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	itemID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("work_items", itemID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "work item not found", "NOT_FOUND")
		return
	}

	var item QueueItem
	doc.DataTo(&item)
	if item.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	if item.Status != "claimed" && item.Status != "in_progress" {
		handler.RespondError(w, http.StatusConflict,
			fmt.Sprintf("cannot release work item in '%s' status", item.Status),
			"INVALID_STATE")
		return
	}

	now := time.Now()
	_, err = s.store.Doc("work_items", itemID).Set(r.Context(), map[string]any{
		"status":     "pending",
		"claimedBy":  "",
		"claimedAt":  nil,
		"updatedAt":  now,
	}, gcpfirestore.MergeAll)
	if err != nil {
		s.log.Error("failed to release work item", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "release failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"id":      itemID,
		"status":  "released",
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch Rules Types
// ─────────────────────────────────────────────────────────────────────────────

type DispatchRule struct {
	ID        string    `json:"id" firestore:"id"`
	OrgID     string    `json:"orgId" firestore:"orgId"`
	Category  string    `json:"category" firestore:"category"`
	Enabled   bool      `json:"enabled" firestore:"enabled"`
	Backend   string    `json:"backend,omitempty" firestore:"backend,omitempty"`
	Agent     string    `json:"agent,omitempty" firestore:"agent,omitempty"`
	Note      string    `json:"note,omitempty" firestore:"note,omitempty"`
	Priority  int       `json:"priority" firestore:"priority"`
	CreatedAt time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt" firestore:"updatedAt"`
}

type DispatchRulesConfig struct {
	OrgID                  string   `json:"orgId" firestore:"orgId"`
	Enabled                bool     `json:"enabled" firestore:"enabled"`
	MaxConcurrentAgents    int      `json:"maxConcurrentAgents" firestore:"maxConcurrentAgents"`
	MaxPendingQueueItems   int      `json:"maxPendingQueueItems" firestore:"maxPendingQueueItems"`
	PreferredProvider      string   `json:"preferredProvider" firestore:"preferredProvider"`
	CustomInstructions     string   `json:"customInstructions" firestore:"customInstructions"`
	EnabledCredentialOwners []string `json:"enabledCredentialOwners" firestore:"enabledCredentialOwners"`
	UpdatedAt              time.Time `json:"updatedAt" firestore:"updatedAt"`
	UpdatedBy              string   `json:"updatedBy" firestore:"updatedBy"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch Rules Handlers
// ─────────────────────────────────────────────────────────────────────────────

func (s *dispatchService) listDispatchRules(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("dispatch_rules", orgID).Get(r.Context())
	if err != nil {
		// Return defaults
		handler.RespondJSON(w, http.StatusOK, DispatchRulesConfig{
			OrgID:                orgID,
			Enabled:              false,
			MaxConcurrentAgents:  4,
			MaxPendingQueueItems: 10,
			PreferredProvider:    "codex",
			EnabledCredentialOwners: []string{},
		})
		return
	}

	var config DispatchRulesConfig
	doc.DataTo(&config)
	config.OrgID = orgID

	// Also list individual rules
	iter := s.store.Collection("dispatch_rules").Doc(orgID).Collection("rules").Documents(r.Context())
	var rules []DispatchRule
	for {
		ruleDoc, err := iter.Next()
		if err != nil {
			break
		}
		var rule DispatchRule
		ruleDoc.DataTo(&rule)
		rules = append(rules, rule)
	}
	if rules == nil {
		rules = []DispatchRule{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"config": config,
		"rules":  rules,
	})
}

func (s *dispatchService) createDispatchRule(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		Category string `json:"category"`
		Backend  string `json:"backend"`
		Agent    string `json:"agent"`
		Note     string `json:"note"`
		Priority int    `json:"priority"`
		Enabled  *bool  `json:"enabled"`
		Config   struct {
			MaxConcurrentAgents    int      `json:"maxConcurrentAgents"`
			MaxPendingQueueItems   int      `json:"maxPendingQueueItems"`
			PreferredProvider      string   `json:"preferredProvider"`
			CustomInstructions     string   `json:"customInstructions"`
			EnabledCredentialOwners []string `json:"enabledCredentialOwners"`
		} `json:"config"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	now := time.Now()

	// Update config
	config := DispatchRulesConfig{
		OrgID:                  orgID,
		MaxConcurrentAgents:    req.Config.MaxConcurrentAgents,
		MaxPendingQueueItems:   req.Config.MaxPendingQueueItems,
		PreferredProvider:      req.Config.PreferredProvider,
		CustomInstructions:     req.Config.CustomInstructions,
		EnabledCredentialOwners: req.Config.EnabledCredentialOwners,
		UpdatedAt:              now,
		UpdatedBy:              auth.UserID(r.Context()),
	}
	if config.MaxConcurrentAgents == 0 {
		config.MaxConcurrentAgents = 4
	}
	if config.MaxPendingQueueItems == 0 {
		config.MaxPendingQueueItems = 10
	}
	if config.PreferredProvider == "" {
		config.PreferredProvider = "codex"
	}
	if req.Enabled != nil {
		config.Enabled = *req.Enabled
	}

	_, err := s.store.Doc("dispatch_rules", orgID).Set(r.Context(), config)
	if err != nil {
		s.log.Error("failed to save dispatch rules config", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to save config", "FIRESTORE_ERROR")
		return
	}

	// Create individual rule if category is provided
	if req.Category != "" {
		rule := DispatchRule{
			ID:        uuid.New().String(),
			OrgID:     orgID,
			Category:  req.Category,
			Enabled:   req.Enabled == nil || *req.Enabled,
			Backend:   req.Backend,
			Agent:     req.Agent,
			Note:      req.Note,
			Priority:  req.Priority,
			CreatedAt: now,
			UpdatedAt: now,
		}
		_, err := s.store.Doc("dispatch_rules", orgID).Collection("rules").Doc(rule.ID).Set(r.Context(), rule)
		if err != nil {
			s.log.Error("failed to create dispatch rule", "error", err)
			handler.RespondError(w, http.StatusInternalServerError, "failed to create rule", "FIRESTORE_ERROR")
			return
		}
		handler.RespondJSON(w, http.StatusCreated, rule)
		return
	}

	handler.RespondJSON(w, http.StatusCreated, map[string]any{
		"config": config,
	})
}

func (s *dispatchService) updateDispatchRule(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	ruleID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("dispatch_rules", orgID).Collection("rules").Doc(ruleID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "dispatch rule not found", "NOT_FOUND")
		return
	}

	var req struct {
		Category string `json:"category"`
		Enabled  *bool  `json:"enabled"`
		Backend  string `json:"backend"`
		Agent    string `json:"agent"`
		Note     string `json:"note"`
		Priority int    `json:"priority"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	updates := map[string]any{"updatedAt": time.Now()}
	if req.Category != "" {
		updates["category"] = req.Category
	}
	if req.Enabled != nil {
		updates["enabled"] = *req.Enabled
	}
	if req.Backend != "" {
		updates["backend"] = req.Backend
	}
	if req.Agent != "" {
		updates["agent"] = req.Agent
	}
	if req.Note != "" {
		updates["note"] = req.Note
	}
	if req.Priority != 0 {
		updates["priority"] = req.Priority
	}

	_, err = s.store.Doc("dispatch_rules", orgID).Collection("rules").Doc(ruleID).Set(r.Context(), updates, gcpfirestore.MergeAll)
	if err != nil {
		s.log.Error("failed to update dispatch rule", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "update failed", "FIRESTORE_ERROR")
		return
	}

	doc, _ = s.store.Doc("dispatch_rules", orgID).Collection("rules").Doc(ruleID).Get(r.Context())
	var rule DispatchRule
	doc.DataTo(&rule)

	handler.RespondJSON(w, http.StatusOK, rule)
}

func (s *dispatchService) deleteDispatchRule(w http.ResponseWriter, r *http.Request) {
	ruleID := chi.URLParam(r, "id")
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	_, err := s.store.Doc("dispatch_rules", orgID).Collection("rules").Doc(ruleID).Delete(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "dispatch rule not found", "NOT_FOUND")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "deleted", "id": ruleID})
}

func (s *dispatchService) getDispatchHealth(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	// Check dispatch rules exist
	rulesHealthy := true
	_, err := s.store.Doc("dispatch_rules", orgID).Get(r.Context())
	if err != nil {
		rulesHealthy = false
	}

	// Check queue state
	queueHealthy := true
	stateDoc, err := s.store.Doc("queue_state", orgID).Get(r.Context())
	if err != nil {
		queueHealthy = false
	} else {
		var qs struct {
			ConsumerHealthy bool `json:"consumerHealthy"`
		}
		stateDoc.DataTo(&qs)
		queueHealthy = qs.ConsumerHealthy
	}

	overall := rulesHealthy && queueHealthy

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"status":       "ok",
		"healthy":      overall,
		"rulesHealthy": rulesHealthy,
		"queueHealthy": queueHealthy,
		"orgId":        orgID,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Swarm Types
// ─────────────────────────────────────────────────────────────────────────────

type SwarmRun struct {
	ID             string    `json:"id" firestore:"id"`
	OrgID          string    `json:"orgId" firestore:"orgId"`
	Name           string    `json:"name" firestore:"name"`
	Status         string    `json:"status" firestore:"status"` // planning, running, completed, failed, cancelled
	Mode           string    `json:"mode" firestore:"mode"`     // plan, apply
	Provider       string    `json:"provider" firestore:"provider"`
	SandboxCount   int       `json:"sandboxCount" firestore:"sandboxCount"`
	TargetProvider string    `json:"targetProvider" firestore:"targetProvider"`
	Workload       any       `json:"workload" firestore:"workload"`
	Issues         []SwarmIssue `json:"issues" firestore:"issues"`
	WorkerDispatch any       `json:"workerDispatch" firestore:"workerDispatch,omitempty"`
	Error          string    `json:"error,omitempty" firestore:"error,omitempty"`
	CreatedBy      string    `json:"createdBy" firestore:"createdBy"`
	CreatedAt      time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt" firestore:"updatedAt"`
	CompletedAt    *time.Time `json:"completedAt,omitempty" firestore:"completedAt,omitempty"`
}

type SwarmIssue struct {
	Number     int    `json:"number"`
	Title      string `json:"title"`
	Repository string `json:"repository"`
	URL        string `json:"url"`
}

type SwarmPoolSnapshot struct {
	OrgID        string `json:"orgId"`
	TotalSlots   int    `json:"totalSlots"`
	UsedSlots    int    `json:"usedSlots"`
	AvailableSlots int  `json:"availableSlots"`
	Provider     string `json:"provider"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Swarm Handlers
// ─────────────────────────────────────────────────────────────────────────────

func (s *dispatchService) startSwarmRun(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	userID := auth.UserID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		Name           string       `json:"name"`
		Mode           string       `json:"mode"`
		Provider       string       `json:"provider"`
		SandboxCount   int          `json:"sandboxCount"`
		TargetProvider string       `json:"targetProvider"`
		Workload       any          `json:"workload"`
		Issues         []SwarmIssue `json:"issues"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.Mode != "plan" && req.Mode != "apply" {
		req.Mode = "plan"
	}

	run := SwarmRun{
		ID:             uuid.New().String(),
		OrgID:          orgID,
		Name:           req.Name,
		Status:         "planning",
		Mode:           req.Mode,
		Provider:       req.Provider,
		SandboxCount:   req.SandboxCount,
		TargetProvider: req.TargetProvider,
		Workload:       req.Workload,
		Issues:         req.Issues,
		CreatedBy:      userID,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	if run.Provider == "" {
		run.Provider = "stratus"
	}
	if run.SandboxCount == 0 {
		run.SandboxCount = 1
	}

	// Preflight validation: ensure issues are provided when applying
	if run.Mode == "apply" && len(run.Issues) == 0 {
		handler.RespondError(w, http.StatusBadRequest, "issues required for apply mode", "VALIDATION_ERROR")
		return
	}
	if run.SandboxCount < 1 || run.SandboxCount > 64 {
		handler.RespondError(w, http.StatusBadRequest, "sandboxCount must be between 1 and 64", "VALIDATION_ERROR")
		return
	}

	_, err := s.store.Doc("swarm_runs", run.ID).Set(r.Context(), run)
	if err != nil {
		s.log.Error("failed to create swarm run", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to create swarm run", "FIRESTORE_ERROR")
		return
	}

	// Transition to running immediately if in apply mode
	if run.Mode == "apply" {
		run.Status = "running"
		s.store.Doc("swarm_runs", run.ID).Set(r.Context(), map[string]any{
			"status":    "running",
			"updatedAt": time.Now(),
		}, gcpfirestore.MergeAll)
	}

	s.log.Info("swarm run created", "runId", run.ID, "org", orgID, "mode", run.Mode, "sandboxes", run.SandboxCount)

	statusCode := http.StatusCreated
	if run.Mode == "apply" {
		statusCode = http.StatusAccepted
	}

	handler.RespondJSON(w, statusCode, run)
}

func (s *dispatchService) getSwarmRun(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	runID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("swarm_runs", runID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "swarm run not found", "NOT_FOUND")
		return
	}

	var run SwarmRun
	doc.DataTo(&run)
	if run.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	handler.RespondJSON(w, http.StatusOK, run)
}

func (s *dispatchService) getSwarmPool(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	// Count active swarm runs to estimate pool usage
	iter := s.store.Collection("swarm_runs").Documents(r.Context())
	var usedSlots int
	totalSlots := 100

	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var run SwarmRun
		doc.DataTo(&run)
		if run.OrgID == orgID && run.Status == "running" {
			usedSlots += run.SandboxCount
		}
	}

	handler.RespondJSON(w, http.StatusOK, SwarmPoolSnapshot{
		OrgID:          orgID,
		TotalSlots:     totalSlots,
		UsedSlots:      usedSlots,
		AvailableSlots: totalSlots - usedSlots,
		Provider:       "stratus",
	})
}

func (s *dispatchService) cancelSwarmRun(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	runID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("swarm_runs", runID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "swarm run not found", "NOT_FOUND")
		return
	}

	var run SwarmRun
	doc.DataTo(&run)
	if run.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	if run.Status == "completed" || run.Status == "cancelled" || run.Status == "failed" {
		handler.RespondError(w, http.StatusConflict, "swarm run already in terminal state", "TERMINAL_STATE")
		return
	}

	now := time.Now()
	_, err = s.store.Doc("swarm_runs", runID).Set(r.Context(), map[string]any{
		"status":      "cancelled",
		"updatedAt":   now,
		"completedAt": now,
	}, gcpfirestore.MergeAll)
	if err != nil {
		s.log.Error("failed to cancel swarm run", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "cancel failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]string{
		"status": "cancelled",
		"id":     runID,
	})
}

func (s *dispatchService) closeoutSwarmRun(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	runID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("swarm_runs", runID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "swarm run not found", "NOT_FOUND")
		return
	}

	var run SwarmRun
	doc.DataTo(&run)
	if run.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	var req struct {
		Result  any    `json:"result"`
		Error   string `json:"error"`
		Summary string `json:"summary"`
	}
	handler.DecodeJSON(r, &req) // Best-effort parse

	now := time.Now()
	updates := map[string]any{
		"status":      "completed",
		"updatedAt":   now,
		"completedAt": now,
	}
	if req.Result != nil {
		updates["result"] = req.Result
	}
	if req.Error != "" {
		updates["error"] = req.Error
		updates["status"] = "failed"
	}

	_, err = s.store.Doc("swarm_runs", runID).Set(r.Context(), updates, gcpfirestore.MergeAll)
	if err != nil {
		s.log.Error("failed to closeout swarm run", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "closeout failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]string{
		"status": updates["status"].(string),
		"id":     runID,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration Types
// ─────────────────────────────────────────────────────────────────────────────

type OrchestrationStatus struct {
	IsRunning      bool   `json:"isRunning"`
	IsPaused       bool   `json:"isPaused"`
	ActiveSessions int    `json:"activeSessions"`
	OrgID          string `json:"orgId"`
}

type OrchestrationDirective struct {
	ID          string    `json:"id" firestore:"id"`
	SessionID   string    `json:"sessionId" firestore:"sessionId"`
	OrgID       string    `json:"orgId" firestore:"orgId"`
	Type        string    `json:"type" firestore:"type"` // pause, resume, cancel, priority_adjust, reroute
	Reason      string    `json:"reason" firestore:"reason"`
	IssuedBy    string    `json:"issuedBy" firestore:"issuedBy"`
	Status      string    `json:"status" firestore:"status"` // pending, delivered, resolved, failed
	Payload     any       `json:"payload,omitempty" firestore:"payload,omitempty"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
	DeliveredAt *time.Time `json:"deliveredAt,omitempty" firestore:"deliveredAt,omitempty"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Orchestration Handlers
// ─────────────────────────────────────────────────────────────────────────────

func (s *dispatchService) getOrchestrationStatus(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	// Count active orchestrated sessions
	iter := s.store.Collection("orchestration_state").Documents(r.Context())
	var activeSessions int
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var state struct {
			OrgID     string `json:"orgId"`
			IsRunning bool   `json:"isRunning"`
		}
		doc.DataTo(&state)
		if state.OrgID == orgID && state.IsRunning {
			activeSessions++
		}
	}

	handler.RespondJSON(w, http.StatusOK, OrchestrationStatus{
		IsRunning:      activeSessions > 0,
		IsPaused:       false,
		ActiveSessions: activeSessions,
		OrgID:          orgID,
	})
}

func (s *dispatchService) sendOrchestrationDirective(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	userID := auth.UserID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		SessionID string `json:"sessionId"`
		Type      string `json:"type"`
		Reason    string `json:"reason"`
		Payload   any    `json:"payload"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.SessionID == "" || req.Type == "" {
		handler.RespondError(w, http.StatusBadRequest, "sessionId and type are required", "BAD_REQUEST")
		return
	}

	validTypes := map[string]bool{"pause": true, "resume": true, "cancel": true, "priority_adjust": true, "reroute": true}
	if !validTypes[req.Type] {
		handler.RespondError(w, http.StatusBadRequest,
			"type must be one of: pause, resume, cancel, priority_adjust, reroute", "BAD_REQUEST")
		return
	}

	directive := OrchestrationDirective{
		ID:        uuid.New().String(),
		SessionID: req.SessionID,
		OrgID:     orgID,
		Type:      req.Type,
		Reason:    req.Reason,
		IssuedBy:  userID,
		Status:    "pending",
		Payload:   req.Payload,
		CreatedAt: time.Now(),
	}

	_, err := s.store.Doc("orchestration_state", directive.ID).Set(r.Context(), directive)
	if err != nil {
		s.log.Error("failed to create orchestration directive", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to create directive", "FIRESTORE_ERROR")
		return
	}

	s.log.Info("orchestration directive sent", "sessionId", req.SessionID, "type", req.Type, "org", orgID)
	handler.RespondJSON(w, http.StatusCreated, directive)
}

func (s *dispatchService) listOrchestratedSessions(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	// Find sessions with orchestration directives
	iter := s.store.Collection("orchestration_state").Documents(r.Context())
	var sessionIDs []string
	seen := map[string]bool{}

	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var directive OrchestrationDirective
		doc.DataTo(&directive)
		if directive.OrgID == orgID && !seen[directive.SessionID] {
			seen[directive.SessionID] = true
			sessionIDs = append(sessionIDs, directive.SessionID)
		}
	}

	// Fetch session details
	var sessions []Session
	for _, sid := range sessionIDs {
		sDoc, err := s.store.Doc("sessions", sid).Get(r.Context())
		if err != nil {
			continue
		}
		var session Session
		sDoc.DataTo(&session)
		if session.OrgID == orgID {
			sessions = append(sessions, session)
		}
	}

	if sessions == nil {
		sessions = []Session{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"sessions": sessions,
		"count":    len(sessions),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Supervisor Directive Types
// ─────────────────────────────────────────────────────────────────────────────

type SupervisorDirective struct {
	ID              string    `json:"id" firestore:"id"`
	OrgID           string    `json:"orgId" firestore:"orgId"`
	SessionID       string    `json:"sessionId" firestore:"sessionId"`
	Type            string    `json:"type" firestore:"type"`
	Priority        int       `json:"priority" firestore:"priority"`
	Status          string    `json:"status" firestore:"status"` // pending, in_progress, resolved, failed
	Directive       string    `json:"directive" firestore:"directive"`
	Rationale       string    `json:"rationale" firestore:"rationale"`
	IssuedBy        string    `json:"issuedBy" firestore:"issuedBy"`
	ResolvedBy      string    `json:"resolvedBy,omitempty" firestore:"resolvedBy,omitempty"`
	Resolution      string    `json:"resolution,omitempty" firestore:"resolution,omitempty"`
	CreatedAt       time.Time `json:"createdAt" firestore:"createdAt"`
	ResolvedAt      *time.Time `json:"resolvedAt,omitempty" firestore:"resolvedAt,omitempty"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Supervisor Directive Handlers
// ─────────────────────────────────────────────────────────────────────────────

func (s *dispatchService) listSupervisorDirectives(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	statusFilter := r.URL.Query().Get("status")
	iter := s.store.Collection("orchestration_state").Documents(r.Context())
	var directives []SupervisorDirective

	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var directive SupervisorDirective
		doc.DataTo(&directive)
		if directive.OrgID != orgID {
			continue
		}
		if statusFilter != "" && directive.Status != statusFilter {
			continue
		}
		directives = append(directives, directive)
	}

	if directives == nil {
		directives = []SupervisorDirective{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"directives": directives,
		"count":      len(directives),
	})
}

func (s *dispatchService) resolveSupervisorDirective(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	userID := auth.UserID(r.Context())
	directiveID := chi.URLParam(r, "id")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	doc, err := s.store.Doc("orchestration_state", directiveID).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "directive not found", "NOT_FOUND")
		return
	}

	var directive SupervisorDirective
	doc.DataTo(&directive)
	if directive.OrgID != orgID {
		handler.RespondError(w, http.StatusForbidden, "access denied", "FORBIDDEN")
		return
	}

	if directive.Status == "resolved" {
		handler.RespondError(w, http.StatusConflict, "directive already resolved", "ALREADY_RESOLVED")
		return
	}

	var req struct {
		Resolution string `json:"resolution"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.Resolution == "" {
		handler.RespondError(w, http.StatusBadRequest, "resolution is required", "BAD_REQUEST")
		return
	}

	now := time.Now()
	_, err = s.store.Doc("orchestration_state", directiveID).Set(r.Context(), map[string]any{
		"status":     "resolved",
		"resolvedBy": userID,
		"resolution": req.Resolution,
		"resolvedAt": now,
	}, gcpfirestore.MergeAll)
	if err != nil {
		s.log.Error("failed to resolve directive", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "resolve failed", "FIRESTORE_ERROR")
		return
	}

	s.log.Info("supervisor directive resolved", "directiveId", directiveID, "org", orgID)
	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"status":     "resolved",
		"id":         directiveID,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Activity Types
// ─────────────────────────────────────────────────────────────────────────────

type AgentActivity struct {
	SessionID    string    `json:"sessionId" firestore:"sessionId"`
	OrgID        string    `json:"orgId" firestore:"orgId"`
	Agent        string    `json:"agent" firestore:"agent"`
	Status       string    `json:"status" firestore:"status"` // active, idle, completed
	IssueNumber  int       `json:"issueNumber,omitempty" firestore:"issueNumber,omitempty"`
	Repository   string    `json:"repository,omitempty" firestore:"repository,omitempty"`
	Branch       string    `json:"branch,omitempty" firestore:"branch,omitempty"`
	WorkItemID   string    `json:"workItemId,omitempty" firestore:"workItemId,omitempty"`
	CurrentTask  string    `json:"currentTask,omitempty" firestore:"currentTask,omitempty"`
	Files        []any     `json:"files,omitempty" firestore:"files,omitempty"`
	LastHeartbeat time.Time `json:"lastHeartbeat" firestore:"lastHeartbeat"`
	CreatedAt    time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Activity Handlers
// ─────────────────────────────────────────────────────────────────────────────

func (s *dispatchService) listAgentActivity(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	statusFilter := r.URL.Query().Get("status")
	iter := s.store.Collection("agent_activity").Documents(r.Context())
	var activities []AgentActivity

	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var activity AgentActivity
		doc.DataTo(&activity)
		if activity.OrgID != orgID {
			continue
		}
		if statusFilter != "" && activity.Status != statusFilter {
			continue
		}
		activities = append(activities, activity)
	}

	if activities == nil {
		activities = []AgentActivity{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"activities": activities,
		"count":      len(activities),
	})
}

func (s *dispatchService) getAgentActivity(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	agentID := chi.URLParam(r, "agentId")
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("agent_activity").Documents(r.Context())
	var activities []AgentActivity

	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var activity AgentActivity
		doc.DataTo(&activity)
		if activity.OrgID != orgID || activity.Agent != agentID {
			continue
		}
		activities = append(activities, activity)
	}

	if activities == nil {
		activities = []AgentActivity{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"agentId":    agentID,
		"activities": activities,
		"count":      len(activities),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

// isValidStatusTransition validates session status transitions.
func isValidStatusTransition(current, next string) bool {
	validTransitions := map[string]map[string]bool{
		"pending":     {"initializing": true, "dispatching": true, "cancelled": true, "failed": true},
		"initializing": {"running": true, "failed": true, "cancelled": true},
		"dispatching":  {"running": true, "failed": true, "cancelled": true},
		"running":      {"completed": true, "failed": true, "cancelled": true},
		"completed":    {},
		"failed":       {},
		"cancelled":    {},
	}

	if states, ok := validTransitions[current]; ok {
		return states[next]
	}
	return false
}

// isValidWorkItemStatusTransition validates work item status transitions.
func isValidWorkItemStatusTransition(current, next string) bool {
	validTransitions := map[string]map[string]bool{
		"pending":     {"claimed": true, "cancelled": true, "failed": true},
		"claimed":     {"in_progress": true, "pending": true, "failed": true, "cancelled": true},
		"in_progress": {"completed": true, "failed": true, "cancelled": true},
		"completed":   {},
		"failed":      {"pending": true}, // retry
		"cancelled":   {},
	}

	if states, ok := validTransitions[current]; ok {
		return states[next]
	}
	return false
}

// updateQueueState updates a field in the queue_state document for an org.
func updateQueueState(s *dispatchService, ctx context.Context, orgID string, field string, value any) {
	s.store.Doc("queue_state", orgID).Set(ctx, map[string]any{
		field:      value,
		"updatedAt": time.Now(),
	}, gcpfirestore.MergeAll)
}

