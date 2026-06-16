//go:build cloud
// +build cloud

package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
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
	golangjwt "github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/gal-run/gal/services/lib/auth"
	galcfs "github.com/gal-run/gal/services/lib/firestore"
	"github.com/gal-run/gal/services/lib/handler"
	"github.com/gal-run/gal/services/lib/telemetry"
)

// team-svc owns team management, workspace permissions, org memory pool, and invite management.
// Firestore collections: teams, workspaces, org_memory, invites
// All routes behind JWT auth. Health check at GET /health.

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

// Team represents a named group of users within an org.
type Team struct {
	ID          string       `json:"id" firestore:"id"`
	OrgID       string       `json:"orgId" firestore:"orgId"`
	Name        string       `json:"name" firestore:"name"`
	Description string       `json:"description,omitempty" firestore:"description,omitempty"`
	Members     []TeamMember `json:"members" firestore:"members"`
	CreatedAt   time.Time    `json:"createdAt" firestore:"createdAt"`
	UpdatedAt   time.Time    `json:"updatedAt" firestore:"updatedAt"`
}

// TeamMember represents a single user within a team.
type TeamMember struct {
	UserID   string    `json:"userId" firestore:"userId"`
	Email    string    `json:"email,omitempty" firestore:"email,omitempty"`
	Role     string    `json:"role" firestore:"role"` // owner, admin, developer
	GitHubID int64     `json:"githubId,omitempty" firestore:"githubId,omitempty"`
	AddedAt  time.Time `json:"addedAt" firestore:"addedAt"`
}

// Workspace represents a GitHub org or personal workspace scoped to an org.
type Workspace struct {
	ID            string                         `json:"id" firestore:"id"`
	OrgID         string                         `json:"orgId" firestore:"orgId"`
	Name          string                         `json:"name" firestore:"name"`
	Slug          string                         `json:"slug" firestore:"slug"`
	WorkspaceType string                         `json:"type" firestore:"type"` // organization, personal
	OwnerID       string                         `json:"ownerId" firestore:"ownerId"`
	AvatarURL     string                         `json:"avatarUrl,omitempty" firestore:"avatarUrl,omitempty"`
	Permissions   map[string]WorkspacePermission `json:"permissions,omitempty" firestore:"permissions,omitempty"`
	CreatedAt     time.Time                      `json:"createdAt" firestore:"createdAt"`
	UpdatedAt     time.Time                      `json:"updatedAt" firestore:"updatedAt"`
}

// WorkspacePermission defines a user's role within a workspace.
type WorkspacePermission struct {
	Role string `json:"role" firestore:"role"` // admin, member
}

// OrgMemoryEntry is a collaborative memory entry in the org memory pool.
type OrgMemoryEntry struct {
	ID         string    `json:"id" firestore:"id"`
	OrgID      string    `json:"orgId" firestore:"orgId"`
	Content    string    `json:"content" firestore:"content"`
	Source     string    `json:"source" firestore:"source"` // agent, developer, governance
	SessionID  string    `json:"sessionId" firestore:"sessionId"`
	RepoScope  string    `json:"repoScope,omitempty" firestore:"repoScope,omitempty"`
	Tags       []string  `json:"tags" firestore:"tags"`
	Confidence float64   `json:"confidence" firestore:"confidence"`
	Status     string    `json:"status" firestore:"status"` // active, archived
	CreatedAt  time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// orgMemoryCompact is a compact response form (no content body, just title/metadata).
type orgMemoryCompact struct {
	ID         string   `json:"id"`
	OrgID      string   `json:"orgId"`
	RepoScope  string   `json:"repoScope"`
	Title      string   `json:"title"`
	Source     string   `json:"source"`
	SessionID  string   `json:"sessionId"`
	Confidence float64  `json:"confidence"`
	Status     string   `json:"status"`
	Tags       []string `json:"tags"`
	CreatedAt  string   `json:"createdAt"`
	UpdatedAt  string   `json:"updatedAt"`
}

// Invite represents a pending or consumed invitation to join an org.
type Invite struct {
	ID        string    `json:"id" firestore:"id"`
	OrgID     string    `json:"orgId" firestore:"orgId"`
	Code      string    `json:"code" firestore:"code"`
	CreatedBy string    `json:"createdBy" firestore:"createdBy"`
	MaxUses   int       `json:"maxUses" firestore:"maxUses"`
	UsedCount int       `json:"usedCount" firestore:"usedCount"`
	Status    string    `json:"status" firestore:"status"` // pending, revoked, consumed
	ExpiresAt time.Time `json:"expiresAt" firestore:"expiresAt"`
	CreatedAt time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// ---------------------------------------------------------------------------
// Service struct
// ---------------------------------------------------------------------------

type teamService struct {
	store *galcfs.ServiceStore
	log   *slog.Logger
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

func main() {
	ctx := context.Background()
	log := telemetry.Logger()

	tp, _ := telemetry.InitTracer(ctx, "team-svc")
	defer tp.Shutdown(ctx)

	fsClient, err := galcfs.Client(ctx)
	if err != nil {
		log.Error("firestore unavailable", "error", err)
		os.Exit(1)
	}

	store := galcfs.NewServiceStore(fsClient, map[string]string{
		"teams":      "teams",
		"workspaces": "workspaces",
		"orgMemory":  "org_memory",
		"invites":    "invites",
	})

	svc := &teamService{
		store: store,
		log:   log,
	}

	ja := jwtauth.New("HS256", []byte(os.Getenv("JWT_SECRET")), nil)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))

	// Public.
	r.Get("/health", svc.health)

	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))
		r.Use(auth.Middleware(ja))

		// Teams.
		r.Get("/teams", svc.listTeams)
		r.Post("/teams", svc.createTeam)
		r.Get("/teams/{id}", svc.getTeam)
		r.Patch("/teams/{id}", svc.updateTeam)
		r.Delete("/teams/{id}", svc.deleteTeam)

		// Team members (static "members" segment must be registered before
		// parameterized routes that could collide — chi handles this via
		// trie matching, but the ordering makes intent explicit).
		r.Get("/teams/{id}/members", svc.listTeamMembers)
		r.Post("/teams/{id}/members", svc.addTeamMember)
		r.Delete("/teams/{id}/members/{uid}", svc.removeTeamMember)

		// Workspaces.
		r.Get("/workspaces", svc.listWorkspaces)
		r.Post("/workspaces", svc.createWorkspace)
		r.Get("/workspaces/{id}", svc.getWorkspace)
		r.Patch("/workspaces/{id}", svc.updateWorkspace)

		// Org memory pool.
		r.Get("/org-memory", svc.listOrgMemory)
		r.Post("/org-memory", svc.storeOrgMemory)
		r.Get("/org-memory/{id}", svc.getOrgMemory)

		// Invites.
		r.Post("/invites", svc.createInvite)
		r.Post("/invites/{id}/accept", svc.acceptInvite)
		r.Get("/invites/pending", svc.listPendingInvites)
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

	log.Info("team-svc starting", "port", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server error", "error", err)
		os.Exit(1)
	}
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

func (s *teamService) health(w http.ResponseWriter, r *http.Request) {
	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "team-svc"})
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

// GET /teams — list teams for the authenticated org.
func (s *teamService) listTeams(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("teams").Where("orgId", "==", orgID).Documents(r.Context())
	var teams []Team
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var t Team
		doc.DataTo(&t)
		t.ID = doc.Ref.ID
		teams = append(teams, t)
	}
	if teams == nil {
		teams = []Team{}
	}
	handler.RespondJSON(w, http.StatusOK, map[string]any{"teams": teams})
}

// POST /teams — create a new team.
func (s *teamService) createTeam(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	userID := auth.UserID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description,omitempty"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Name == "" {
		handler.RespondError(w, http.StatusBadRequest, "name is required", "BAD_REQUEST")
		return
	}

	now := time.Now()
	team := Team{
		ID:          uuid.New().String(),
		OrgID:       orgID,
		Name:        req.Name,
		Description: req.Description,
		Members: []TeamMember{
			{
				UserID:  userID,
				Role:    "owner",
				AddedAt: now,
			},
		},
		CreatedAt: now,
		UpdatedAt: now,
	}

	_, err := s.store.Doc("teams", team.ID).Set(r.Context(), team)
	if err != nil {
		s.log.Error("failed to create team", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to create team", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, team)
}

// GET /teams/{id} — get a team by ID.
func (s *teamService) getTeam(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.store.Doc("teams", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "team not found", "NOT_FOUND")
		return
	}

	var team Team
	doc.DataTo(&team)
	team.ID = doc.Ref.ID

	if team.OrgID != orgID {
		handler.RespondError(w, http.StatusNotFound, "team not found", "NOT_FOUND")
		return
	}

	handler.RespondJSON(w, http.StatusOK, team)
}

// PATCH /teams/{id} — update team name/description.
func (s *teamService) updateTeam(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.store.Doc("teams", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "team not found", "NOT_FOUND")
		return
	}

	var team Team
	doc.DataTo(&team)
	if team.OrgID != orgID {
		handler.RespondError(w, http.StatusNotFound, "team not found", "NOT_FOUND")
		return
	}

	var req struct {
		Name        *string `json:"name,omitempty"`
		Description *string `json:"description,omitempty"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.Name != nil {
		team.Name = *req.Name
	}
	if req.Description != nil {
		team.Description = *req.Description
	}
	team.UpdatedAt = time.Now()

	_, err = s.store.Doc("teams", id).Set(r.Context(), map[string]any{
		"name":        team.Name,
		"description": team.Description,
		"updatedAt":   team.UpdatedAt,
	}, gcpfirestore.MergeAll)
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "failed to update team", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, team)
}

// DELETE /teams/{id} — delete a team.
func (s *teamService) deleteTeam(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.store.Doc("teams", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "team not found", "NOT_FOUND")
		return
	}

	var team Team
	doc.DataTo(&team)
	if team.OrgID != orgID {
		handler.RespondError(w, http.StatusNotFound, "team not found", "NOT_FOUND")
		return
	}

	_, err = s.store.Doc("teams", id).Delete(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "failed to delete team", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// ---------------------------------------------------------------------------
// Team Members
// ---------------------------------------------------------------------------

// GET /teams/{id}/members — list members of a team.
func (s *teamService) listTeamMembers(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.store.Doc("teams", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "team not found", "NOT_FOUND")
		return
	}

	var team Team
	doc.DataTo(&team)
	if team.OrgID != orgID {
		handler.RespondError(w, http.StatusNotFound, "team not found", "NOT_FOUND")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{"members": team.Members})
}

// POST /teams/{id}/members — add a member to a team.
func (s *teamService) addTeamMember(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.store.Doc("teams", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "team not found", "NOT_FOUND")
		return
	}

	var team Team
	doc.DataTo(&team)
	if team.OrgID != orgID {
		handler.RespondError(w, http.StatusNotFound, "team not found", "NOT_FOUND")
		return
	}

	var req struct {
		UserID   string `json:"userId"`
		Email    string `json:"email,omitempty"`
		Role     string `json:"role"`
		GitHubID int64  `json:"githubId,omitempty"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.UserID == "" {
		handler.RespondError(w, http.StatusBadRequest, "userId is required", "BAD_REQUEST")
		return
	}
	if req.Role == "" {
		req.Role = "developer"
	}

	// Check for duplicates.
	for _, m := range team.Members {
		if m.UserID == req.UserID {
			handler.RespondError(w, http.StatusConflict, "member already exists in team", "CONFLICT")
			return
		}
	}

	member := TeamMember{
		UserID:   req.UserID,
		Email:    req.Email,
		Role:     req.Role,
		GitHubID: req.GitHubID,
		AddedAt:  time.Now(),
	}
	team.Members = append(team.Members, member)
	team.UpdatedAt = time.Now()

	_, err = s.store.Doc("teams", id).Set(r.Context(), map[string]any{
		"members":   team.Members,
		"updatedAt": team.UpdatedAt,
	}, gcpfirestore.MergeAll)
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "failed to add member", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, member)
}

// DELETE /teams/{id}/members/{uid} — remove a member from a team.
func (s *teamService) removeTeamMember(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	uid := chi.URLParam(r, "uid")

	doc, err := s.store.Doc("teams", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "team not found", "NOT_FOUND")
		return
	}

	var team Team
	doc.DataTo(&team)
	if team.OrgID != orgID {
		handler.RespondError(w, http.StatusNotFound, "team not found", "NOT_FOUND")
		return
	}

	found := false
	var updated []TeamMember
	for _, m := range team.Members {
		if m.UserID == uid {
			found = true
			continue
		}
		updated = append(updated, m)
	}
	if !found {
		handler.RespondError(w, http.StatusNotFound, "member not found", "NOT_FOUND")
		return
	}

	team.Members = updated
	team.UpdatedAt = time.Now()

	_, err = s.store.Doc("teams", id).Set(r.Context(), map[string]any{
		"members":   team.Members,
		"updatedAt": team.UpdatedAt,
	}, gcpfirestore.MergeAll)
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "failed to remove member", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}

// ---------------------------------------------------------------------------
// Workspaces
// ---------------------------------------------------------------------------

// GET /workspaces — list workspaces for the org.
func (s *teamService) listWorkspaces(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("workspaces").Where("orgId", "==", orgID).Documents(r.Context())
	var workspaces []Workspace
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var ws Workspace
		doc.DataTo(&ws)
		ws.ID = doc.Ref.ID
		workspaces = append(workspaces, ws)
	}
	if workspaces == nil {
		workspaces = []Workspace{}
	}
	handler.RespondJSON(w, http.StatusOK, map[string]any{"workspaces": workspaces})
}

// POST /workspaces — create a workspace.
func (s *teamService) createWorkspace(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		Name    string `json:"name"`
		Slug    string `json:"slug"`
		Type    string `json:"type"`
		OwnerID string `json:"ownerId"`
		Avatar  string `json:"avatarUrl,omitempty"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Name == "" || req.Slug == "" {
		handler.RespondError(w, http.StatusBadRequest, "name and slug are required", "BAD_REQUEST")
		return
	}
	if req.Type == "" {
		req.Type = "organization"
	}

	now := time.Now()
	ws := Workspace{
		ID:            uuid.New().String(),
		OrgID:         orgID,
		Name:          req.Name,
		Slug:          req.Slug,
		WorkspaceType: req.Type,
		OwnerID:       req.OwnerID,
		AvatarURL:     req.Avatar,
		Permissions:   map[string]WorkspacePermission{},
		CreatedAt:     now,
		UpdatedAt:     now,
	}

	_, err := s.store.Doc("workspaces", ws.ID).Set(r.Context(), ws)
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "failed to create workspace", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, ws)
}

// GET /workspaces/{id} — get a workspace by ID.
func (s *teamService) getWorkspace(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.store.Doc("workspaces", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "workspace not found", "NOT_FOUND")
		return
	}

	var ws Workspace
	doc.DataTo(&ws)
	ws.ID = doc.Ref.ID

	if ws.OrgID != orgID {
		handler.RespondError(w, http.StatusNotFound, "workspace not found", "NOT_FOUND")
		return
	}

	handler.RespondJSON(w, http.StatusOK, ws)
}

// PATCH /workspaces/{id} — update workspace permissions and metadata.
func (s *teamService) updateWorkspace(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.store.Doc("workspaces", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "workspace not found", "NOT_FOUND")
		return
	}

	var ws Workspace
	doc.DataTo(&ws)
	if ws.OrgID != orgID {
		handler.RespondError(w, http.StatusNotFound, "workspace not found", "NOT_FOUND")
		return
	}

	var req struct {
		Name        string                         `json:"name,omitempty"`
		AvatarURL   string                         `json:"avatarUrl,omitempty"`
		Permissions map[string]WorkspacePermission `json:"permissions,omitempty"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	updates := map[string]any{
		"updatedAt": time.Now(),
	}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.AvatarURL != "" {
		updates["avatarUrl"] = req.AvatarURL
	}
	if req.Permissions != nil {
		// Merge permissions: replace the entire map.
		if ws.Permissions == nil {
			ws.Permissions = make(map[string]WorkspacePermission)
		}
		for k, v := range req.Permissions {
			ws.Permissions[k] = v
		}
		updates["permissions"] = ws.Permissions
	}

	_, err = s.store.Doc("workspaces", id).Set(r.Context(), updates, gcpfirestore.MergeAll)
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "failed to update workspace", "FIRESTORE_ERROR")
		return
	}

	ws.UpdatedAt = time.Now()
	if req.Name != "" {
		ws.Name = req.Name
	}
	if req.AvatarURL != "" {
		ws.AvatarURL = req.AvatarURL
	}

	handler.RespondJSON(w, http.StatusOK, ws)
}

// ---------------------------------------------------------------------------
// Org Memory Pool
// ---------------------------------------------------------------------------

// GET /org-memory — query org memory pool with optional filtering.
func (s *teamService) listOrgMemory(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	q := s.store.Collection("orgMemory").Where("orgId", "==", orgID)

	if repoScope := r.URL.Query().Get("repoScope"); repoScope != "" {
		q = q.Where("repoScope", "==", repoScope)
	}
	if sessionID := r.URL.Query().Get("sessionId"); sessionID != "" {
		q = q.Where("sessionId", "==", sessionID)
	}

	limit := parseLimit(r.URL.Query().Get("limit"))
	q = q.Limit(limit)

	iter := q.Documents(r.Context())
	var entries []OrgMemoryEntry
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var e OrgMemoryEntry
		doc.DataTo(&e)
		e.ID = doc.Ref.ID
		entries = append(entries, e)
	}
	if entries == nil {
		entries = []OrgMemoryEntry{}
	}

	compact := r.URL.Query().Get("compact") == "true"
	if compact {
		compacted := make([]orgMemoryCompact, len(entries))
		for i, e := range entries {
			compacted[i] = orgMemoryCompact{
				ID:         e.ID,
				OrgID:      e.OrgID,
				RepoScope:  e.RepoScope,
				Title:      extractTitle(e.Content),
				Source:     e.Source,
				SessionID:  e.SessionID,
				Confidence: e.Confidence,
				Status:     e.Status,
				Tags:       e.Tags,
				CreatedAt:  e.CreatedAt.Format(time.RFC3339),
				UpdatedAt:  e.UpdatedAt.Format(time.RFC3339),
			}
		}
		handler.RespondJSON(w, http.StatusOK, map[string]any{
			"entries": compacted,
			"count":   len(compacted),
		})
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"entries": entries,
		"count":   len(entries),
	})
}

// POST /org-memory — store a new memory entry.
func (s *teamService) storeOrgMemory(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	userID := auth.UserID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		Content   string   `json:"content"`
		Source    string   `json:"source"`
		SessionID string   `json:"sessionId"`
		RepoScope string   `json:"repoScope,omitempty"`
		Tags      []string `json:"tags,omitempty"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Content == "" {
		handler.RespondError(w, http.StatusBadRequest, "content is required", "BAD_REQUEST")
		return
	}
	if len(req.Content) > 50000 {
		handler.RespondError(w, http.StatusBadRequest, "content must be 50,000 characters or fewer", "BAD_REQUEST")
		return
	}
	if req.Source == "" {
		req.Source = "developer"
	}
	if req.SessionID == "" {
		req.SessionID = userID
	}
	if req.Tags == nil {
		req.Tags = []string{}
	}

	now := time.Now()
	entry := OrgMemoryEntry{
		ID:         uuid.New().String(),
		OrgID:      orgID,
		Content:    req.Content,
		Source:     req.Source,
		SessionID:  req.SessionID,
		RepoScope:  req.RepoScope,
		Tags:       req.Tags,
		Confidence: 1.0,
		Status:     "active",
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	_, err := s.store.Doc("orgMemory", entry.ID).Set(r.Context(), entry)
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "failed to store memory entry", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, map[string]any{"entry": entry})
}

// GET /org-memory/{id} — get a specific memory entry.
func (s *teamService) getOrgMemory(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	id := chi.URLParam(r, "id")
	doc, err := s.store.Doc("orgMemory", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "memory entry not found", "NOT_FOUND")
		return
	}

	var entry OrgMemoryEntry
	doc.DataTo(&entry)
	entry.ID = doc.Ref.ID

	if entry.OrgID != orgID {
		handler.RespondError(w, http.StatusNotFound, "memory entry not found", "NOT_FOUND")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{"entry": entry})
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

// POST /invites — create an invite for the org.
func (s *teamService) createInvite(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	userEmail := auth.UserEmail(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		MaxUses       int `json:"maxUses"`
		ExpiresInDays int `json:"expiresInDays"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.MaxUses <= 0 {
		req.MaxUses = 1
	}
	if req.ExpiresInDays <= 0 {
		req.ExpiresInDays = 30
	}

	now := time.Now()
	code, err := generateInviteCode()
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "failed to generate invite code", "INTERNAL")
		return
	}

	invite := Invite{
		ID:        uuid.New().String(),
		OrgID:     orgID,
		Code:      code,
		CreatedBy: userEmail,
		MaxUses:   req.MaxUses,
		UsedCount: 0,
		Status:    "pending",
		ExpiresAt: now.AddDate(0, 0, req.ExpiresInDays),
		CreatedAt: now,
		UpdatedAt: now,
	}

	_, err = s.store.Doc("invites", invite.ID).Set(r.Context(), invite)
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "failed to create invite", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, map[string]any{
		"invite": map[string]any{
			"id":        invite.ID,
			"code":      invite.Code,
			"inviteUrl": "https://gal.dev/join/" + invite.Code,
			"expiresAt": invite.ExpiresAt,
			"maxUses":   invite.MaxUses,
		},
	})
}

// POST /invites/{id}/accept — accept an invite, claiming a seat.
func (s *teamService) acceptInvite(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	doc, err := s.store.Doc("invites", id).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "invite not found", "NOT_FOUND")
		return
	}

	var invite Invite
	doc.DataTo(&invite)
	invite.ID = doc.Ref.ID

	if invite.Status != "pending" {
		handler.RespondError(w, http.StatusGone, "invite is no longer valid", "INVITE_EXPIRED")
		return
	}
	if time.Now().After(invite.ExpiresAt) {
		invite.Status = "revoked"
		s.store.Doc("invites", id).Set(r.Context(), map[string]any{
			"status":    "revoked",
			"updatedAt": time.Now(),
		}, gcpfirestore.MergeAll)
		handler.RespondError(w, http.StatusGone, "invite has expired", "INVITE_EXPIRED")
		return
	}
	if invite.UsedCount >= invite.MaxUses {
		handler.RespondError(w, http.StatusGone, "invite has reached max uses", "INVITE_EXHAUSTED")
		return
	}

	var req struct {
		UserID string `json:"userId,omitempty"`
	}
	handler.DecodeJSON(r, &req) // body is optional
	acceptingUser := req.UserID
	if acceptingUser == "" {
		acceptingUser = auth.UserID(r.Context())
	}
	if acceptingUser == "" {
		handler.RespondError(w, http.StatusBadRequest, "userId is required", "BAD_REQUEST")
		return
	}

	invite.UsedCount++
	invite.UpdatedAt = time.Now()
	if invite.UsedCount >= invite.MaxUses {
		invite.Status = "consumed"
	}

	_, err = s.store.Doc("invites", id).Set(r.Context(), map[string]any{
		"usedCount": invite.UsedCount,
		"status":    invite.Status,
		"updatedAt": invite.UpdatedAt,
	}, gcpfirestore.MergeAll)
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "failed to accept invite", "FIRESTORE_ERROR")
		return
	}

	s.log.Info("invite accepted", "invite", id, "org", invite.OrgID, "user", acceptingUser)

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"success": true,
		"orgId":   invite.OrgID,
	})
}

// GET /invites/pending — list pending invites for the authenticated org.
func (s *teamService) listPendingInvites(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("invites").
		Where("orgId", "==", orgID).
		Where("status", "==", "pending").
		Documents(r.Context())

	var invites []Invite
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var inv Invite
		doc.DataTo(&inv)
		inv.ID = doc.Ref.ID
		invites = append(invites, inv)
	}
	if invites == nil {
		invites = []Invite{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{"invites": invites})
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// jwtClaimsMiddleware parses the JWT token without signature verification
// and extracts user_id, org_id, and email claims into the request context.
// Used by tests.
func jwtClaimsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

		// Parse without signature verification.
		parsed, err := golangjwt.Parse(tokenStr, func(token *golangjwt.Token) (interface{}, error) {
			return []byte("any-key"), nil
		})
		if err != nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		cclaims, ok := parsed.Claims.(golangjwt.MapClaims)
		if !ok || cclaims == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		ctx := r.Context()
		if sub, ok := cclaims["user_id"].(string); ok {
			ctx = auth.SetUserID(ctx, sub)
		}
		if org, ok := cclaims["org_id"].(string); ok {
			ctx = auth.SetOrgID(ctx, org)
		}
		if email, ok := cclaims["email"].(string); ok {
			ctx = auth.SetUserEmail(ctx, email)
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func parseLimit(raw string) int {
	if raw == "" {
		return 20
	}
	var n int
	if _, err := fmt.Sscanf(raw, "%d", &n); err != nil || n < 1 {
		return 20
	}
	if n > 100 {
		return 100
	}
	return n
}

func extractTitle(content string) string {
	firstLine := content
	if idx := strings.Index(content, "\n"); idx >= 0 {
		firstLine = strings.TrimSpace(content[:idx])
	}
	if firstLine == "" {
		firstLine = strings.TrimSpace(content)
	}
	if len(firstLine) > 120 {
		return firstLine[:117] + "..."
	}
	return firstLine
}

func generateInviteCode() (string, error) {
	b := make([]byte, 4)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
