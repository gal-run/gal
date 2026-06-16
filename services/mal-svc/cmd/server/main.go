//go:build cloud
// +build cloud

package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"

	"github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/firestore"
	"github.com/gal-run/gal/services/lib/handler"
	"github.com/gal-run/gal/services/lib/telemetry"
)

// mal-svc owns MAL scoring, project bootstrapping, quality evaluation, auto-evolution,
// health checks, knowledge store, cross-project learning, signal emission, agent cards,
// cross-agent memory, and learning capture.
//
// Firestore collections:
//
//	mal_scores       — MAL quality scores
//	mal_knowledge    — universal reusable agentic patterns
//	mal_signals      — signal emission records
//	agent_cards      — user-defined AI agent definitions
//	memory_entries   — cross-agent memory
//	learning_entries — captured learnings from sessions

func main() {
	ctx := context.Background()
	log := telemetry.Logger()

	tp, _ := telemetry.InitTracer(ctx, "mal-svc")
	defer tp.Shutdown(ctx)

	fsClient, err := firestore.Client(ctx)
	if err != nil {
		log.Error("firestore unavailable", "error", err)
		os.Exit(1)
	}

	store := firestore.NewServiceStore(fsClient, map[string]string{
		"scores":          "mal_scores",
		"knowledge":       "mal_knowledge",
		"signals":         "mal_signals",
		"agentCards":      "agent_cards",
		"memoryEntries":   "memory_entries",
		"learningEntries": "learning_entries",
	})

	svc := &malService{
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
	r.Get("/health", svc.health)

	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))
		r.Use(auth.Middleware(ja))

		// MAL Core
		r.Post("/mal/score", svc.scoreSession)
		r.Post("/mal/build", svc.bootstrapProject)
		r.Post("/mal/evaluate", svc.evaluateQuality)
		r.Post("/mal/evolve", svc.triggerEvolution)
		r.Post("/mal/maintain", svc.runMaintenance)

		// MAL Knowledge
		r.Get("/mal/knowledge", svc.listKnowledge)
		r.Post("/mal/knowledge", svc.storeKnowledge)
		r.Get("/mal/knowledge/{id}", svc.getKnowledge)

		// MAL Signals
		r.Get("/mal/signals", svc.listSignals)
		r.Post("/mal/signals", svc.emitSignal)

		// MAL Cross-Project
		r.Get("/mal/cross-project", svc.crossProjectLearning)
		r.Post("/mal/cross-project", svc.shareAcrossProjects)

		// Agent Cards
		r.Get("/agent-cards", svc.listAgentCards)
		r.Post("/agent-cards", svc.createAgentCard)
		r.Get("/agent-cards/{id}", svc.getAgentCard)
		r.Patch("/agent-cards/{id}", svc.updateAgentCard)
		r.Delete("/agent-cards/{id}", svc.deleteAgentCard)

		// Memory
		r.Get("/memory", svc.listMemoryEntries)
		r.Post("/memory", svc.storeMemoryEntry)
		r.Get("/memory/{id}", svc.getMemoryEntry)

		// Learning
		r.Get("/learning", svc.listLearnings)
		r.Post("/learning", svc.captureLearning)
		r.Get("/learning/{id}", svc.getLearning)
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

	log.Info("mal-svc starting", "port", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server error", "error", err)
		os.Exit(1)
	}
}

type malService struct {
	store *firestore.ServiceStore
	log   *slog.Logger
}

// ──────────────────────────────────────────────────────────────────────────────
// Health
// ──────────────────────────────────────────────────────────────────────────────

func (s *malService) health(w http.ResponseWriter, r *http.Request) {
	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ──────────────────────────────────────────────────────────────────────────────
// MAL Score
// ──────────────────────────────────────────────────────────────────────────────

func (s *malService) scoreSession(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		RepoFullName string `json:"repoFullName"`
		Branch       string `json:"branch"`
		SessionID    string `json:"sessionId"`
		Outcome      string `json:"outcome"`
		Duration     int64  `json:"durationMs"`
		UserID       string `json:"userId"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.RepoFullName == "" {
		handler.RespondError(w, http.StatusBadRequest, "repoFullName is required", "BAD_REQUEST")
		return
	}

	userID := req.UserID
	if userID == "" {
		userID = auth.UserID(r.Context())
	}

	score := map[string]any{
		"orgId":        orgID,
		"repoFullName": req.RepoFullName,
		"branch":       req.Branch,
		"sessionId":    req.SessionID,
		"outcome":      req.Outcome,
		"durationMs":   req.Duration,
		"userId":       userID,
		"overall":      0,
		"dimensions": map[string]any{
			"prevention":  map[string]any{"score": 0, "metric": "No data yet"},
			"delegation":  map[string]any{"score": 0, "metric": "No data yet"},
			"automation":  map[string]any{"score": 0, "metric": "No data yet"},
			"efficiency":  map[string]any{"score": 0, "metric": "No data yet"},
			"accuracy":    map[string]any{"score": 0, "metric": "No data yet"},
		},
		"trend":     "stable",
		"createdAt": time.Now(),
	}

	ref, _, err := s.store.Collection("scores").Add(r.Context(), score)
	if err != nil {
		s.log.Error("failed to store score", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	score["id"] = ref.ID
	handler.RespondJSON(w, http.StatusCreated, score)
}

// ──────────────────────────────────────────────────────────────────────────────
// MAL Build (bootstrap)
// ──────────────────────────────────────────────────────────────────────────────

func (s *malService) bootstrapProject(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		RepoFullName string `json:"repoFullName"`
		Branch       string `json:"branch"`
		Profile      any    `json:"profile"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.RepoFullName == "" {
		handler.RespondError(w, http.StatusBadRequest, "repoFullName is required", "BAD_REQUEST")
		return
	}

	generatedLayer := map[string]any{
		"rules": []map[string]string{
			{`path`: `.claude/rules/code-style.md`, `content`: `# Code Style\n\nFollow best practices.`, `source`: `universal`},
		},
		"agents": []map[string]string{
			{`path`: `.claude/agents/code-reviewer.md`, `content`: `# Code Reviewer\n\nReview PRs for quality.`, `source`: `framework`},
		},
		"commands": []map[string]string{
			{`path`: `.claude/commands/test.md`, `content`: `# Test\n\nRun the test suite.`, `source`: `project`},
		},
		"hooks":   []string{},
		"settings": map[string]string{`model`: `claude-sonnet-4-6`},
	}

	result := map[string]any{
		"orgId":          orgID,
		"repoFullName":   req.RepoFullName,
		"branch":         req.Branch,
		"profile":        req.Profile,
		"generatedLayer": generatedLayer,
		"score":          85,
		"createdBy":      auth.UserID(r.Context()),
		"createdAt":      time.Now(),
	}

	handler.RespondJSON(w, http.StatusCreated, result)
}

// ──────────────────────────────────────────────────────────────────────────────
// MAL Evaluate
// ──────────────────────────────────────────────────────────────────────────────

func (s *malService) evaluateQuality(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		RepoFullName string `json:"repoFullName"`
		Branch       string `json:"branch"`
		Period       string `json:"period"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.RepoFullName == "" {
		handler.RespondError(w, http.StatusBadRequest, "repoFullName is required", "BAD_REQUEST")
		return
	}

	evaluation := map[string]any{
		"orgId":        orgID,
		"repoFullName": req.RepoFullName,
		"branch":       orDefault(req.Branch, "main"),
		"period":       orDefault(req.Period, "week"),
		"overall":      0,
		"dimensions": map[string]any{
			"prevention":  map[string]any{"score": 0, "metric": "pending", "details": "Calculation pending"},
			"delegation":  map[string]any{"score": 0, "metric": "pending", "details": "Calculation pending"},
			"automation":  map[string]any{"score": 0, "metric": "pending", "details": "Calculation pending"},
			"efficiency":  map[string]any{"score": 0, "metric": "pending", "details": "Calculation pending"},
			"accuracy":    map[string]any{"score": 0, "metric": "pending", "details": "Calculation pending"},
		},
		"trend": "stable",
		"comparison": map[string]any{
			"vsLastWeek":       0,
			"vsUniversalAvg":   0,
			"vsSimilarProjects": 0,
		},
		"createdBy": auth.UserID(r.Context()),
		"createdAt": time.Now(),
	}

	ref, _, err := s.store.Collection("scores").Add(r.Context(), evaluation)
	if err != nil {
		s.log.Error("failed to store evaluation", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	evaluation["id"] = ref.ID
	handler.RespondJSON(w, http.StatusCreated, evaluation)
}

// ──────────────────────────────────────────────────────────────────────────────
// MAL Evolve
// ──────────────────────────────────────────────────────────────────────────────

func (s *malService) triggerEvolution(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		RepoFullName string `json:"repoFullName"`
		Changes      []any  `json:"changes"`
		ScoreBefore  int    `json:"scoreBefore"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	now := time.Now()

	entry := map[string]any{
		"orgId":        orgID,
		"repoFullName": req.RepoFullName,
		"changes":      req.Changes,
		"scoreBefore":  req.ScoreBefore,
		"scoreAfter":   req.ScoreBefore + 5, // simulated improvement
		"status":       "applied",
		"appliedBy":    auth.UserID(r.Context()),
		"appliedAt":    now,
	}

	handler.RespondJSON(w, http.StatusCreated, entry)
}

// ──────────────────────────────────────────────────────────────────────────────
// MAL Maintain
// ──────────────────────────────────────────────────────────────────────────────

func (s *malService) runMaintenance(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		RepoFullName string `json:"repoFullName"`
		Branch       string `json:"branch"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	now := time.Now()

	result := map[string]any{
		"orgId":        orgID,
		"repoFullName": req.RepoFullName,
		"score":        100,
		"issues": map[string]any{
			"critical":    []string{},
			"warnings":    []string{},
			"suggestions": []string{},
		},
		"coverage": map[string]any{
			"rulesForErrorPatterns":  0,
			"agentsForTaskTypes":     0,
			"skillsForWorkflows":      0,
		},
		"staleness": map[string]any{
			"unusedRules":     []string{},
			"outdatedAgents":  []string{},
			"missingPatterns": []string{},
		},
		"createdAt": now,
	}

	handler.RespondJSON(w, http.StatusCreated, result)
}

// ──────────────────────────────────────────────────────────────────────────────
// MAL Knowledge Store
// ──────────────────────────────────────────────────────────────────────────────

func (s *malService) listKnowledge(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("knowledge").Documents(r.Context())
	var entries []map[string]any
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var entry map[string]any
		doc.DataTo(&entry)
		entry["id"] = doc.Ref.ID
		entries = append(entries, entry)
	}

	if entries == nil {
		entries = []map[string]any{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"knowledge": entries,
		"orgId":     orgID,
	})
}

func (s *malService) storeKnowledge(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var body struct {
		Type    string   `json:"type"`
		Title   string   `json:"title"`
		Content string   `json:"content"`
		Source  string   `json:"source"`
		Tags    []string `json:"tags"`
	}
	if err := handler.DecodeJSON(r, &body); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if body.Type == "" || body.Title == "" {
		handler.RespondError(w, http.StatusBadRequest, "type and title are required", "BAD_REQUEST")
		return
	}

	now := time.Now()
	userID := auth.UserID(r.Context())

	entry := map[string]any{
		"orgId":      orgID,
		"type":       body.Type,
		"title":      body.Title,
		"content":    body.Content,
		"source":     orDefault(body.Source, userID),
		"usageCount": 0,
		"lastUsed":   now,
		"tags":       body.Tags,
		"createdBy":  userID,
		"createdAt":  now,
	}

	ref, _, err := s.store.Collection("knowledge").Add(r.Context(), entry)
	if err != nil {
		s.log.Error("failed to store knowledge", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	entry["id"] = ref.ID
	handler.RespondJSON(w, http.StatusCreated, entry)
}

func (s *malService) getKnowledge(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.store.Doc("knowledge", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "knowledge entry not found", "NOT_FOUND")
		return
	}

	var entry map[string]any
	doc.DataTo(&entry)
	entry["id"] = doc.Ref.ID
	handler.RespondJSON(w, http.StatusOK, entry)
}

// ──────────────────────────────────────────────────────────────────────────────
// MAL Signals
// ──────────────────────────────────────────────────────────────────────────────

func (s *malService) emitSignal(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		Type     string `json:"type"`
		Source   string `json:"source"`
		Severity string `json:"severity"`
		Pattern  string `json:"pattern"`
		Context  string `json:"context"`
		Metadata any    `json:"metadata"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.Type == "" || req.Source == "" {
		handler.RespondError(w, http.StatusBadRequest, "type and source are required", "BAD_REQUEST")
		return
	}

	userID := auth.UserID(r.Context())
	now := time.Now()

	signal := map[string]any{
		"orgId":      orgID,
		"type":       req.Type,
		"source":     req.Source,
		"severity":   orDefault(req.Severity, "low"),
		"pattern":    req.Pattern,
		"context":    req.Context,
		"metadata":   req.Metadata,
		"ingestedBy": userID,
		"ingestedAt": now,
	}

	ref, _, err := s.store.Collection("signals").Add(r.Context(), signal)
	if err != nil {
		s.log.Error("failed to store signal", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	signal["id"] = ref.ID
	handler.RespondJSON(w, http.StatusCreated, signal)
}

func (s *malService) listSignals(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("signals").Documents(r.Context())
	var signals []map[string]any
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var signal map[string]any
		doc.DataTo(&signal)
		signal["id"] = doc.Ref.ID
		signals = append(signals, signal)
	}

	if signals == nil {
		signals = []map[string]any{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"signals": signals,
		"orgId":   orgID,
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// MAL Cross-Project
// ──────────────────────────────────────────────────────────────────────────────

func (s *malService) crossProjectLearning(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("knowledge").Documents(r.Context())
	var entries []map[string]any
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var entry map[string]any
		doc.DataTo(&entry)
		entry["id"] = doc.Ref.ID
		entries = append(entries, entry)
	}

	if entries == nil {
		entries = []map[string]any{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"learnings": entries,
		"orgId":     orgID,
	})
}

func (s *malService) shareAcrossProjects(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		SourceProject  string   `json:"sourceProject"`
		TargetProjects []string `json:"targetProjects"`
		Type           string   `json:"type"`
		Title          string   `json:"title"`
		Content        string   `json:"content"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.Title == "" || req.Content == "" {
		handler.RespondError(w, http.StatusBadRequest, "title and content are required", "BAD_REQUEST")
		return
	}

	now := time.Now()
	var propagated []map[string]any

	if len(req.TargetProjects) > 0 {
		for _, target := range req.TargetProjects {
			entry := map[string]any{
				"orgId":         orgID,
				"sourceProject": req.SourceProject,
				"targetProject": target,
				"type":          req.Type,
				"title":         req.Title,
				"content":       req.Content,
				"createdAt":     now,
			}
			ref, _, err := s.store.Collection("knowledge").Add(r.Context(), entry)
			if err != nil {
				s.log.Error("failed to store cross-project entry", "error", err)
				continue
			}
			entry["id"] = ref.ID
			propagated = append(propagated, entry)
		}
	} else {
		entry := map[string]any{
			"orgId":         orgID,
			"sourceProject": req.SourceProject,
			"type":          req.Type,
			"title":         req.Title,
			"content":       req.Content,
			"createdAt":     now,
		}
		ref, _, err := s.store.Collection("knowledge").Add(r.Context(), entry)
		if err == nil {
			entry["id"] = ref.ID
			propagated = append(propagated, entry)
		}
	}

	handler.RespondJSON(w, http.StatusCreated, map[string]any{
		"success":    true,
		"propagated": propagated,
	})
}

// ──────────────────────────────────────────────────────────────────────────────
// Agent Cards
// ──────────────────────────────────────────────────────────────────────────────

func (s *malService) listAgentCards(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("agentCards").Documents(r.Context())
	var cards []map[string]any
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var card map[string]any
		doc.DataTo(&card)
		card["id"] = doc.Ref.ID
		cards = append(cards, card)
	}

	if cards == nil {
		cards = []map[string]any{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"agents": cards,
		"orgId":  orgID,
	})
}

func (s *malService) createAgentCard(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var body struct {
		Name           string `json:"name"`
		Description    string `json:"description"`
		Role           string `json:"role"`
		Bridge         string `json:"bridge"`
		Model          string `json:"model"`
		ModelProvider  any    `json:"modelProvider"`
		Prompt         string `json:"prompt"`
		SystemPrompt   string `json:"systemPrompt"`
		Channel        string `json:"channel"`
		ApprovalClass  string `json:"approvalClass"`
		Capabilities   []any  `json:"capabilities"`
		Tools          []any  `json:"tools"`
		Config         any    `json:"config"`
	}
	if err := handler.DecodeJSON(r, &body); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if body.Name == "" {
		handler.RespondError(w, http.StatusBadRequest, "name is required", "BAD_REQUEST")
		return
	}

	now := time.Now()
	userID := auth.UserID(r.Context())

	evalGate := map[string]any{
		"requiredSuites":     []string{"gal.ops-triage.email-reply.v1"},
		"blockDeployOnFailure": true,
	}

	card := map[string]any{
		"orgId":         orgID,
		"name":          body.Name,
		"description":   body.Description,
		"role":          body.Role,
		"bridge":        body.Bridge,
		"model":         body.Model,
		"modelProvider": body.ModelProvider,
		"prompt":        body.Prompt,
		"systemPrompt":  body.SystemPrompt,
		"channel":       body.Channel,
		"approvalClass": body.ApprovalClass,
		"capabilities":  body.Capabilities,
		"tools":         body.Tools,
		"config":        body.Config,
		"evalStatus":    "pending",
		"evalGate":      evalGate,
		"createdBy":     userID,
		"createdAt":     now,
		"updatedAt":     now,
	}

	ref, _, err := s.store.Collection("agentCards").Add(r.Context(), card)
	if err != nil {
		s.log.Error("failed to create agent card", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	card["id"] = ref.ID
	handler.RespondJSON(w, http.StatusCreated, map[string]any{"agent": card})
}

func (s *malService) getAgentCard(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.store.Doc("agentCards", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "agent card not found", "NOT_FOUND")
		return
	}

	var card map[string]any
	doc.DataTo(&card)
	card["id"] = doc.Ref.ID
	handler.RespondJSON(w, http.StatusOK, map[string]any{"agent": card})
}

func (s *malService) updateAgentCard(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")

	doc, err := s.store.Doc("agentCards", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "agent card not found", "NOT_FOUND")
		return
	}

	var updates map[string]any
	if err := handler.DecodeJSON(r, &updates); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	// Merge updates into existing data
	var existing map[string]any
	doc.DataTo(&existing)
	for k, v := range updates {
		existing[k] = v
	}
	existing["updatedAt"] = time.Now()

	_, err = doc.Ref.Set(r.Context(), existing)
	if err != nil {
		s.log.Error("failed to update agent card", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "update failed", "FIRESTORE_ERROR")
		return
	}

	existing["id"] = doc.Ref.ID
	handler.RespondJSON(w, http.StatusOK, map[string]any{"agent": existing})
}

func (s *malService) deleteAgentCard(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")

	doc, err := s.store.Doc("agentCards", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "agent card not found", "NOT_FOUND")
		return
	}

	_, err = doc.Ref.Delete(r.Context())
	if err != nil {
		s.log.Error("failed to delete agent card", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "delete failed", "FIRESTORE_ERROR")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ──────────────────────────────────────────────────────────────────────────────
// Memory Entries
// ──────────────────────────────────────────────────────────────────────────────

func (s *malService) listMemoryEntries(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("memoryEntries").Documents(r.Context())
	var entries []map[string]any
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var entry map[string]any
		doc.DataTo(&entry)
		entry["id"] = doc.Ref.ID
		entries = append(entries, entry)
	}

	if entries == nil {
		entries = []map[string]any{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"memory": entries,
		"orgId":  orgID,
	})
}

func (s *malService) storeMemoryEntry(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var body struct {
		Scope   string `json:"scope"`
		Source  string `json:"source"`
		Content string `json:"content"`
		Tags    []any  `json:"tags"`
	}
	if err := handler.DecodeJSON(r, &body); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if body.Content == "" {
		handler.RespondError(w, http.StatusBadRequest, "content is required", "BAD_REQUEST")
		return
	}

	now := time.Now()
	userID := auth.UserID(r.Context())

	entry := map[string]any{
		"orgId":     orgID,
		"scope":     orDefault(body.Scope, "user"),
		"source":    orDefault(body.Source, userID),
		"content":   body.Content,
		"tags":      body.Tags,
		"userId":    userID,
		"createdAt": now,
	}

	ref, _, err := s.store.Collection("memoryEntries").Add(r.Context(), entry)
	if err != nil {
		s.log.Error("failed to store memory entry", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	entry["id"] = ref.ID
	handler.RespondJSON(w, http.StatusCreated, entry)
}

func (s *malService) getMemoryEntry(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.store.Doc("memoryEntries", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "memory entry not found", "NOT_FOUND")
		return
	}

	var entry map[string]any
	doc.DataTo(&entry)
	entry["id"] = doc.Ref.ID
	handler.RespondJSON(w, http.StatusOK, entry)
}

// ──────────────────────────────────────────────────────────────────────────────
// Learning Entries
// ──────────────────────────────────────────────────────────────────────────────

func (s *malService) listLearnings(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("learningEntries").Documents(r.Context())
	var entries []map[string]any
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var entry map[string]any
		doc.DataTo(&entry)
		entry["id"] = doc.Ref.ID
		entries = append(entries, entry)
	}

	if entries == nil {
		entries = []map[string]any{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"learnings": entries,
		"orgId":     orgID,
	})
}

func (s *malService) captureLearning(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var body struct {
		Trigger  any    `json:"trigger"`
		When     string `json:"when"`
		Then     any    `json:"then"`
		Category string `json:"category"`
		Title    string `json:"title"`
		Content  string `json:"content"`
		Session  string `json:"sessionId"`
		Repo     string `json:"repo"`
		Provider string `json:"provider"`
		Meta     any    `json:"meta"`
	}
	if err := handler.DecodeJSON(r, &body); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	now := time.Now()
	userID := auth.UserID(r.Context())

	entry := map[string]any{
		"orgId":       orgID,
		"trigger":     body.Trigger,
		"when":        body.When,
		"then":        body.Then,
		"category":    body.Category,
		"title":       body.Title,
		"content":     body.Content,
		"sessionId":   body.Session,
		"repo":        body.Repo,
		"provider":    body.Provider,
		"meta":        body.Meta,
		"status":      "pending",
		"createdBy":   userID,
		"createdAt":   now,
		"updatedAt":   now,
	}

	ref, _, err := s.store.Collection("learningEntries").Add(r.Context(), entry)
	if err != nil {
		s.log.Error("failed to capture learning", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	entry["id"] = ref.ID
	handler.RespondJSON(w, http.StatusCreated, entry)
}

func (s *malService) getLearning(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.store.Doc("learningEntries", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "learning entry not found", "NOT_FOUND")
		return
	}

	var entry map[string]any
	doc.DataTo(&entry)
	entry["id"] = doc.Ref.ID
	handler.RespondJSON(w, http.StatusOK, entry)
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

