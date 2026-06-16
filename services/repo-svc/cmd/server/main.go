//go:build cloud
// +build cloud

// repo-svc is the repository discovery and scanning microservice.
//
// It handles GitHub App webhooks, repository scanning via Octokit/Git Trees API,
// config discovery, security/quality/compliance scanning, and config repo PR workflows.
//
// Routes:
//
//	POST   /webhooks/github           — GitHub App webhook (HMAC-signed, no JWT)
//	GET    /repos                     — list org repos
//	GET    /repos/:owner/:repo        — get repo details
//	POST   /repos/scan                — trigger repo scan
//	GET    /repos/:owner/:repo/configs    — list discovered configs
//	GET    /repos/:owner/:repo/discovery  — AI-powered discovery results
//	GET    /repos/:owner/:repo/compliance — compliance scan results
//	GET    /repos/:owner/:repo/security   — security scan results
//	POST   /config-repo/sync          — trigger config repo PR sync
//	POST   /config-repo/sync/pull     — pull org's approved config (gal sync --pull)
//	GET    /config-repo/status        — get config repo sync status
//	GET    /health                    — health check (no auth)
package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"
	"github.com/google/uuid"
	gfs "cloud.google.com/go/firestore"

	"github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/firestore"
	"github.com/gal-run/gal/services/lib/handler"
	"github.com/gal-run/gal/services/lib/telemetry"
)

// ─────────────────────────────────────────────────────────────────────────────
// Domain types
// ─────────────────────────────────────────────────────────────────────────────

// Repository represents a discovered GitHub repository tracked by the service.
type Repository struct {
	ID             string    `json:"id" firestore:"id"`
	OrgID          string    `json:"orgId" firestore:"orgId"`
	FullName       string    `json:"fullName" firestore:"fullName"`
	Owner          string    `json:"owner" firestore:"owner"`
	Name           string    `json:"name" firestore:"name"`
	DefaultBranch  string    `json:"defaultBranch" firestore:"defaultBranch"`
	Description    string    `json:"description" firestore:"description"`
	Private        bool      `json:"private" firestore:"private"`
	Language       string    `json:"language" firestore:"language"`
	Topics         []string  `json:"topics" firestore:"topics"`
	InstallationID int64     `json:"installationId" firestore:"installationId"`
	LastScannedAt  time.Time `json:"lastScannedAt" firestore:"lastScannedAt"`
	ConfigCount    int       `json:"configCount" firestore:"configCount"`
	CreatedAt      time.Time `json:"createdAt" firestore:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt" firestore:"updatedAt"`
}

// DiscoveredConfig represents an AI agent configuration file discovered during scanning.
type DiscoveredConfig struct {
	ID           string    `json:"id" firestore:"id"`
	OrgID        string    `json:"orgId" firestore:"orgId"`
	RepoFullName string    `json:"repoFullName" firestore:"repoFullName"`
	Platform     string    `json:"platform" firestore:"platform"`
	ConfigType   string    `json:"configType" firestore:"configType"`
	Name         string    `json:"name" firestore:"name"`
	Path         string    `json:"path" firestore:"path"`
	Content      string    `json:"content,omitempty" firestore:"content,omitempty"`
	Hash         string    `json:"hash" firestore:"hash"`
	LastModified string    `json:"lastModified" firestore:"lastModified"`
	ScannedAt    time.Time `json:"scannedAt" firestore:"scannedAt"`
}

// ScanResult holds the output of a security, quality, or compliance scan.
type ScanResult struct {
	ID           string    `json:"id" firestore:"id"`
	OrgID        string    `json:"orgId" firestore:"orgId"`
	RepoFullName string    `json:"repoFullName" firestore:"repoFullName"`
	ScanType     string    `json:"scanType" firestore:"scanType"` // "security", "quality", "compliance"
	Results      string    `json:"results" firestore:"results"`   // JSON blob
	Passed       bool      `json:"passed" firestore:"passed"`
	IssueCount   int       `json:"issueCount" firestore:"issueCount"`
	ScannedAt    time.Time `json:"scannedAt" firestore:"scannedAt"`
}

// ConfigRepoSync tracks the state of a config repo PR sync workflow.
type ConfigRepoSync struct {
	ID          string    `json:"id" firestore:"id"`
	OrgID       string    `json:"orgId" firestore:"orgId"`
	Status      string    `json:"status" firestore:"status"` // pending, in_progress, completed, failed
	PRNumber    int       `json:"prNumber,omitempty" firestore:"prNumber,omitempty"`
	PRURL       string    `json:"prUrl,omitempty" firestore:"prUrl,omitempty"`
	ErrorMessage string   `json:"error,omitempty" firestore:"error,omitempty"`
	StartedAt   time.Time `json:"startedAt" firestore:"startedAt"`
	CompletedAt time.Time `json:"completedAt,omitempty" firestore:"completedAt,omitempty"`
	CreatedAt   time.Time `json:"createdAt" firestore:"createdAt"`
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub webhook event payload structs (partial — only fields we use)
// ─────────────────────────────────────────────────────────────────────────────

type githubWebhookPayload struct {
	Action      string             `json:"action"`
	Repository  *githubRepo        `json:"repository,omitempty"`
	Installation *githubInstallation `json:"installation,omitempty"`
	Sender      *githubSender      `json:"sender,omitempty"`
	Commits     []githubCommit     `json:"commits,omitempty"`
	Ref         string             `json:"ref,omitempty"`
}

type githubRepo struct {
	ID            int64    `json:"id"`
	Name          string   `json:"name"`
	FullName      string   `json:"full_name"`
	Owner         githubUser `json:"owner"`
	DefaultBranch string   `json:"default_branch"`
	Description   string   `json:"description"`
	Private       bool     `json:"private"`
	Language      string   `json:"language"`
	Topics        []string `json:"topics"`
	PushedAt      string   `json:"pushed_at"`
}

type githubUser struct {
	Login string `json:"login"`
	ID    int64  `json:"id"`
	Type  string `json:"type"`
}

// githubEnterprise holds the enterprise account info present in installation webhook payloads
// when a GitHub App is installed at the enterprise level or on an org belonging to an enterprise.
type githubEnterprise struct {
	ID   int64  `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}

type githubInstallation struct {
	ID int64 `json:"id"`
}

type githubSender struct {
	ID    int64  `json:"id"`
	Login string `json:"login"`
}

type githubCommit struct {
	ID       string   `json:"id"`
	Added    []string `json:"added"`
	Modified []string `json:"modified"`
	Removed  []string `json:"removed"`
}

// Agent config directories to watch for changes (matches TypeScript source).
var agentConfigDirPrefixes = []string{
	".claude/",
	".cursor/",
	".gemini/",
	".codex/",
	".windsurf/",
	".github/copilot-instructions.md",
	".github/instructions/",
	".github/agents/",
	".github/skills/",
	".github/prompts/",
}

// agentConfigFilePatterns are known agent config file names at repo root.
var agentConfigRootFiles = []string{
	"CLAUDE.md",
	"CLAUDE.local.md",
	"GEMINI.md",
	"AGENTS.md",     // Copilot/Codex
	"AGENT.md",      // Amp
	"AGENT.local.md",
	".cursorrules",
	".windsurfrules",
	".mcp.json",
	".codeiumignore",
	".geminiignore",
}

// ─────────────────────────────────────────────────────────────────────────────
// Service struct
// ─────────────────────────────────────────────────────────────────────────────

type repoService struct {
	store               *firestore.ServiceStore
	log                 *slog.Logger
	githubWebhookSecret string
	ragURL              string // base URL of the gal-rag service; empty = disabled
	governanceURL       string // base URL of governance-svc; empty = sync pull disabled
	httpClient          *http.Client
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

func main() {
	ctx := context.Background()
	log := telemetry.Logger()

	tp, _ := telemetry.InitTracer(ctx, "repo-svc")
	defer tp.Shutdown(ctx)

	fsClient, err := firestore.Client(ctx)
	if err != nil {
		log.Error("firestore unavailable", "error", err)
		os.Exit(1)
	}

	store := firestore.NewServiceStore(fsClient, map[string]string{
		"repositories":     "repositories",
		"discoveredConfigs": "discovered_configs",
		"scanResults":       "scan_results",
		"configRepoSyncs":   "config_repo_syncs",
	})

	svc := &repoService{
		store:               store,
		log:                 log,
		githubWebhookSecret: os.Getenv("GITHUB_WEBHOOK_SECRET"),
		ragURL:              os.Getenv("GAL_RAG_URL"),
		governanceURL:       os.Getenv("GAL_GOVERNANCE_URL"),
		httpClient:          &http.Client{Timeout: 5 * time.Second},
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

	// Webhook — no JWT auth, verified by HMAC signature.
	r.Post("/webhooks/github", svc.handleGitHubWebhook)

	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))
		r.Use(auth.Middleware(ja))

		r.Get("/repos", svc.listRepos)
		r.Get("/repos/{owner}/{repo}", svc.getRepo)
		r.Post("/repos/scan", svc.scanRepos)
		r.Get("/repos/{owner}/{repo}/configs", svc.listConfigs)
		r.Get("/repos/{owner}/{repo}/discovery", svc.getDiscovery)
		r.Get("/repos/{owner}/{repo}/compliance", svc.getCompliance)
		r.Get("/repos/{owner}/{repo}/security", svc.getSecurity)
		r.Post("/config-repo/sync", svc.triggerConfigRepoSync)
		r.Post("/config-repo/sync/pull", svc.syncPullConfig)
		r.Get("/config-repo/status", svc.getConfigRepoSyncStatus)
	})

	port := envOrDefault("PORT", "8083")
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

	log.Info("repo-svc starting", "port", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server error", "error", err)
		os.Exit(1)
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// GitHub Webhook handler
// ─────────────────────────────────────────────────────────────────────────────

func (s *repoService) handleGitHubWebhook(w http.ResponseWriter, r *http.Request) {
	deliveryID := r.Header.Get("X-GitHub-Delivery")
	eventName := r.Header.Get("X-GitHub-Event")
	signature := r.Header.Get("X-Hub-Signature-256")

	// Validate required webhook headers.
	if deliveryID == "" || eventName == "" || signature == "" {
		missing := []string{}
		if deliveryID == "" {
			missing = append(missing, "X-GitHub-Delivery")
		}
		if eventName == "" {
			missing = append(missing, "X-GitHub-Event")
		}
		if signature == "" {
			missing = append(missing, "X-Hub-Signature-256")
		}
		s.log.Warn("webhook rejected: missing headers", "missing", missing)
		handler.RespondError(w, http.StatusBadRequest, "missing required webhook headers", "BAD_REQUEST")
		return
	}

	// Read raw body for signature verification.
	payload, err := io.ReadAll(r.Body)
	if err != nil {
		s.log.Error("failed to read webhook body", "error", err)
		handler.RespondError(w, http.StatusBadRequest, "invalid body", "BAD_REQUEST")
		return
	}

	// Verify HMAC-SHA256 signature.
	if !s.verifyWebhookSignature(payload, signature) {
		s.log.Warn("webhook signature verification failed", "delivery", deliveryID, "event", eventName)
		handler.RespondError(w, http.StatusBadRequest, "signature verification failed", "INVALID_SIGNATURE")
		return
	}

	// Parse the payload envelope.
	var envelope struct {
		Action      string          `json:"action"`
		Installation json.RawMessage `json:"installation,omitempty"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		s.log.Error("failed to parse webhook payload", "error", err)
		handler.RespondError(w, http.StatusBadRequest, "invalid payload", "BAD_REQUEST")
		return
	}

	// Route by event name.
	switch eventName {
	case "push":
		s.handlePushWebhook(w, r, payload)
	case "installation":
		s.handleInstallationWebhook(w, r, payload, envelope.Action)
	case "installation_repositories":
		s.handleInstallationReposWebhook(w, r, payload, envelope.Action)
	case "repository":
		s.handleRepositoryWebhook(w, r, payload, envelope.Action)
	case "ping":
		handler.RespondJSON(w, http.StatusOK, map[string]string{"event": "ping"})
	default:
		s.log.Debug("unhandled webhook event", "event", eventName)
		handler.RespondJSON(w, http.StatusOK, map[string]string{"received": "true"})
	}
}

// verifyWebhookSignature checks the HMAC-SHA256 signature of a webhook payload.
func (s *repoService) verifyWebhookSignature(payload []byte, signatureHeader string) bool {
	if s.githubWebhookSecret == "" {
		s.log.Warn("GITHUB_WEBHOOK_SECRET not configured — skipping HMAC verification")
		return true
	}

	// Expected format: sha256=hexdigest
	const prefix = "sha256="
	if !strings.HasPrefix(signatureHeader, prefix) {
		return false
	}
	expectedSig, err := hex.DecodeString(signatureHeader[len(prefix):])
	if err != nil {
		return false
	}

	mac := hmac.New(sha256.New, []byte(s.githubWebhookSecret))
	mac.Write(payload)
	actualSig := mac.Sum(nil)

	return hmac.Equal(expectedSig, actualSig)
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook sub-handlers
// ─────────────────────────────────────────────────────────────────────────────

func (s *repoService) handlePushWebhook(w http.ResponseWriter, r *http.Request, payload []byte) {
	var push struct {
		Ref        string       `json:"ref"`
		Repository *githubRepo  `json:"repository"`
		Installation *githubInstallation `json:"installation"`
		Commits   []githubCommit `json:"commits"`
	}
	if err := json.Unmarshal(payload, &push); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid push payload", "BAD_REQUEST")
		return
	}

	if push.Repository == nil || push.Installation == nil {
		handler.RespondError(w, http.StatusBadRequest, "missing repo or installation", "BAD_REQUEST")
		return
	}

	repoFullName := push.Repository.FullName
	orgName := push.Repository.Owner.Login
	repoName := push.Repository.Name

	// Notify gal-rag of all file changes so the semantic index stays current.
	// Fire-and-forget: gal-rag failure must never block the webhook response.
	// The installation id lets gal-rag mint a token and fetch file content.
	// Detach from the request context (cancelled when the handler returns) so
	// the POST isn't killed mid-flight; keep its values via WithoutCancel.
	go s.notifyGalRag(context.WithoutCancel(r.Context()), orgName, push.Repository.Owner.Login, repoName, push.Ref, push.Installation.ID, push.Commits)

	// Check if any commit touches agent config directories.
	if !s.pushAffectsAgentConfig(push.Commits) {
		s.log.Info("push does not affect agent config dirs, skipping", "repo", repoFullName)
		handler.RespondJSON(w, http.StatusOK, map[string]string{"received": "true", "action": "skipped"})
		return
	}

	s.log.Info("push affects agent configs", "repo", repoFullName, "installation", push.Installation.ID)

	// Record or update the repository in Firestore.
	now := time.Now()
	repo := Repository{
		ID:             fmt.Sprintf("%s/%s", orgName, repoName),
		OrgID:          orgName,
		FullName:       repoFullName,
		Owner:          orgName,
		Name:           repoName,
		DefaultBranch:  push.Repository.DefaultBranch,
		Description:    push.Repository.Description,
		Private:        push.Repository.Private,
		Language:       push.Repository.Language,
		InstallationID: push.Installation.ID,
		LastScannedAt:  now,
		UpdatedAt:      now,
		CreatedAt:      now,
	}

	_, err := s.store.Doc("repositories", repo.ID).Set(r.Context(), repo)
	if err != nil {
		s.log.Error("failed to save repository", "repo", repoFullName, "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"received": true,
		"action":   "rescanned",
		"repo":     repoFullName,
	})
}

func (s *repoService) handleInstallationWebhook(w http.ResponseWriter, r *http.Request, payload []byte, action string) {
	var inst struct {
		Installation struct {
			ID         int64             `json:"id"`
			Account    *githubUser       `json:"account"`
			Enterprise *githubEnterprise `json:"enterprise"`
		} `json:"installation"`
		Sender *githubUser `json:"sender"`
	}
	if err := json.Unmarshal(payload, &inst); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid installation payload", "BAD_REQUEST")
		return
	}

	account := inst.Installation.Account
	if account == nil {
		handler.RespondError(w, http.StatusBadRequest, "missing account", "BAD_REQUEST")
		return
	}

	orgName := account.Login
	installationID := inst.Installation.ID

	s.log.Info("installation event", "action", action, "org", orgName, "installation", installationID)

	switch action {
	case "created":
		// Record the installation for this org.
		orgDoc := map[string]any{
			"orgName":        orgName,
			"installationId": installationID,
			"accountType":    account.Type,
			"installedBy":    inst.Sender.Login,
			"createdAt":      time.Now(),
		}
		if inst.Installation.Enterprise != nil && inst.Installation.Enterprise.Slug != "" {
			orgDoc["enterpriseSlug"] = inst.Installation.Enterprise.Slug
		}
		_, err := s.store.Doc("repositories", fmt.Sprintf("_org:%s", orgName)).Set(r.Context(), orgDoc)
		if err != nil {
			s.log.Error("failed to record installation", "org", orgName, "error", err)
		}

		// Also surface enterpriseSlug (+ accountType) on the canonical
		// organizations/{orgName} doc — that is what auth-svc
		// handleListOrganizations reads and the dashboard WorkspaceSwitcher
		// uses for enterprise grouping. Without this, a newly-onboarded org is
		// never grouped under its enterprise (the slug would only live in
		// repositories/_org:{org}, which the read path does not consult).
		// Merge-write so fields owned by other writers are never clobbered.
		if inst.Installation.Enterprise != nil && inst.Installation.Enterprise.Slug != "" {
			orgRecord := map[string]any{
				"name":           orgName,
				"enterpriseSlug": inst.Installation.Enterprise.Slug,
				"accountType":    account.Type,
				"installationId": installationID,
			}
			if _, err := s.store.Doc("organizations", orgName).Set(r.Context(), orgRecord, gfs.MergeAll); err != nil {
				s.log.Error("failed to record enterpriseSlug on organizations doc", "org", orgName, "error", err)
			}
		}
	case "deleted":
		// Cleanup: we could delete org repos here.
		s.log.Info("installation deleted", "org", orgName)
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"received":     true,
		"action":       action,
		"org":          orgName,
		"installation": installationID,
	})
}

func (s *repoService) handleInstallationReposWebhook(w http.ResponseWriter, r *http.Request, payload []byte, action string) {
	var repos struct {
		Installation struct {
			ID      int64      `json:"id"`
			Account *githubUser `json:"account"`
		} `json:"installation"`
		RepositoriesAdded   []struct{ Name string } `json:"repositories_added"`
		RepositoriesRemoved []struct{ Name string } `json:"repositories_removed"`
	}
	if err := json.Unmarshal(payload, &repos); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid payload", "BAD_REQUEST")
		return
	}

	account := repos.Installation.Account
	if account == nil {
		handler.RespondError(w, http.StatusBadRequest, "missing account", "BAD_REQUEST")
		return
	}

	orgName := account.Login
	added := len(repos.RepositoriesAdded)
	removed := len(repos.RepositoriesRemoved)
	s.log.Info("installation repos event", "action", action, "org", orgName, "added", added, "removed", removed)

	// For added repos, create repository records.
	now := time.Now()
	for _, ar := range repos.RepositoriesAdded {
		fullName := fmt.Sprintf("%s/%s", orgName, ar.Name)
		repo := Repository{
			ID:             fullName,
			OrgID:          orgName,
			FullName:       fullName,
			Owner:          orgName,
			Name:           ar.Name,
			InstallationID: repos.Installation.ID,
			LastScannedAt:  now,
			UpdatedAt:      now,
			CreatedAt:      now,
		}
		s.store.Doc("repositories", repo.ID).Set(r.Context(), repo)
	}

	// For removed repos, delete repository records.
	for _, rr := range repos.RepositoriesRemoved {
		fullName := fmt.Sprintf("%s/%s", orgName, rr.Name)
		s.store.Doc("repositories", fullName).Delete(r.Context())
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"received": true,
		"action":   action,
		"added":    added,
		"removed":  removed,
	})
}

func (s *repoService) handleRepositoryWebhook(w http.ResponseWriter, r *http.Request, payload []byte, action string) {
	var repoEvt struct {
		Repository   *githubRepo        `json:"repository"`
		Installation *githubInstallation `json:"installation"`
	}
	if err := json.Unmarshal(payload, &repoEvt); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid repository payload", "BAD_REQUEST")
		return
	}

	if repoEvt.Repository == nil {
		handler.RespondError(w, http.StatusBadRequest, "missing repository", "BAD_REQUEST")
		return
	}

	ghRepo := repoEvt.Repository
	fullName := ghRepo.FullName
	s.log.Info("repository event", "action", action, "repo", fullName)

	if action == "created" {
		// Add the new repo to our tracking.
		now := time.Now()
		repo := Repository{
			ID:             fullName,
			OrgID:          ghRepo.Owner.Login,
			FullName:       fullName,
			Owner:          ghRepo.Owner.Login,
			Name:           ghRepo.Name,
			DefaultBranch:  ghRepo.DefaultBranch,
			Description:    ghRepo.Description,
			Private:        ghRepo.Private,
			Language:       ghRepo.Language,
			InstallationID: repoEvt.Installation.ID,
			LastScannedAt:  now,
			UpdatedAt:      now,
			CreatedAt:      now,
		}
		s.store.Doc("repositories", repo.ID).Set(r.Context(), repo)
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{"received": true, "action": action, "repo": fullName})
}

// pushAffectsAgentConfig checks if any commit in a push touches agent config files.
func (s *repoService) pushAffectsAgentConfig(commits []githubCommit) bool {
	for _, c := range commits {
		allFiles := append(append(c.Added, c.Modified...), c.Removed...)
		for _, f := range allFiles {
			// Check directory prefixes.
			for _, prefix := range agentConfigDirPrefixes {
				if strings.HasPrefix(f, prefix) || f == prefix {
					return true
				}
			}
			// Check root-level config files.
			for _, rootFile := range agentConfigRootFiles {
				if f == rootFile {
					return true
				}
			}
		}
	}
	return false
}

// ─────────────────────────────────────────────────────────────────────────────
// REPOS: listRepos
// ─────────────────────────────────────────────────────────────────────────────

func (s *repoService) listRepos(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("repositories").Documents(r.Context())
	var repos []Repository
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		// Filter by org if the collection is shared.
		var repo Repository
		doc.DataTo(&repo)
		if repo.OrgID == orgID {
			repos = append(repos, repo)
		}
	}
	if repos == nil {
		repos = []Repository{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"repos": repos,
		"total": len(repos),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// REPOS: getRepo
// ─────────────────────────────────────────────────────────────────────────────

func (s *repoService) getRepo(w http.ResponseWriter, r *http.Request) {
	owner := chi.URLParam(r, "owner")
	repoName := chi.URLParam(r, "repo")
	fullName := fmt.Sprintf("%s/%s", owner, repoName)

	doc, err := s.store.Doc("repositories", fullName).Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "repository not found", "NOT_FOUND")
		return
	}

	var repo Repository
	doc.DataTo(&repo)
	handler.RespondJSON(w, http.StatusOK, repo)
}

// ─────────────────────────────────────────────────────────────────────────────
// REPOS: scanRepos (trigger)
// ─────────────────────────────────────────────────────────────────────────────

func (s *repoService) scanRepos(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		FullNames []string `json:"fullNames"`
	}
	// If body is provided, decode it; otherwise scan all repos for the org.
	if r.ContentLength > 0 {
		if err := handler.DecodeJSON(r, &req); err != nil {
			handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
			return
		}
	}

	s.log.Info("scan triggered", "org", orgID, "repos", req.FullNames)

	// In a real implementation, this would kick off async scanning via pub/sub or goroutine.
	// For now, we update lastScannedAt and return accepted.
	now := time.Now()
	if len(req.FullNames) > 0 {
		for _, fn := range req.FullNames {
			doc := s.store.Doc("repositories", fn)
			doc.Set(r.Context(), map[string]any{"lastScannedAt": now, "updatedAt": now}, gfs.MergeAll)
		}
	} else {
		// Update all repos for this org.
		iter := s.store.Collection("repositories").Where("orgId", "==", orgID).Documents(r.Context())
		for {
			d, err := iter.Next()
			if err != nil {
				break
			}
			d.Ref.Set(r.Context(), map[string]any{"lastScannedAt": now, "updatedAt": now}, gfs.MergeAll)
		}
	}

	handler.RespondJSON(w, http.StatusAccepted, map[string]any{
		"status":  "scan_triggered",
		"org":     orgID,
		"scannedAt": now,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIGS: listConfigs
// ─────────────────────────────────────────────────────────────────────────────

func (s *repoService) listConfigs(w http.ResponseWriter, r *http.Request) {
	owner := chi.URLParam(r, "owner")
	repoName := chi.URLParam(r, "repo")
	fullName := fmt.Sprintf("%s/%s", owner, repoName)

	iter := s.store.Collection("discoveredConfigs").
		Where("repoFullName", "==", fullName).
		Documents(r.Context())

	var configs []DiscoveredConfig
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var cfg DiscoveredConfig
		doc.DataTo(&cfg)
		configs = append(configs, cfg)
	}
	if configs == nil {
		configs = []DiscoveredConfig{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"repo":    fullName,
		"configs": configs,
		"total":   len(configs),
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// DISCOVERY
// ─────────────────────────────────────────────────────────────────────────────

func (s *repoService) getDiscovery(w http.ResponseWriter, r *http.Request) {
	owner := chi.URLParam(r, "owner")
	repoName := chi.URLParam(r, "repo")
	fullName := fmt.Sprintf("%s/%s", owner, repoName)

	// Return all discovered configs grouped by platform.
	iter := s.store.Collection("discoveredConfigs").
		Where("repoFullName", "==", fullName).
		Documents(r.Context())

	byPlatform := make(map[string][]DiscoveredConfig)
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var cfg DiscoveredConfig
		doc.DataTo(&cfg)
		byPlatform[cfg.Platform] = append(byPlatform[cfg.Platform], cfg)
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"repo":     fullName,
		"platforms": byPlatform,
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE: getCompliance
// ─────────────────────────────────────────────────────────────────────────────

func (s *repoService) getCompliance(w http.ResponseWriter, r *http.Request) {
	owner := chi.URLParam(r, "owner")
	repoName := chi.URLParam(r, "repo")
	fullName := fmt.Sprintf("%s/%s", owner, repoName)

	iter := s.store.Collection("scanResults").
		Where("repoFullName", "==", fullName).
		Where("scanType", "==", "compliance").
		OrderBy("scannedAt", gfs.Desc).
		Limit(1).
		Documents(r.Context())

	var results []ScanResult
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var sr ScanResult
		doc.DataTo(&sr)
		results = append(results, sr)
	}

	if len(results) == 0 {
		handler.RespondJSON(w, http.StatusOK, map[string]any{
			"repo":   fullName,
			"result": nil,
			"status": "not_scanned",
		})
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"repo":   fullName,
		"result": results[0],
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY: getSecurity
// ─────────────────────────────────────────────────────────────────────────────

func (s *repoService) getSecurity(w http.ResponseWriter, r *http.Request) {
	owner := chi.URLParam(r, "owner")
	repoName := chi.URLParam(r, "repo")
	fullName := fmt.Sprintf("%s/%s", owner, repoName)

	iter := s.store.Collection("scanResults").
		Where("repoFullName", "==", fullName).
		Where("scanType", "==", "security").
		OrderBy("scannedAt", gfs.Desc).
		Limit(1).
		Documents(r.Context())

	var results []ScanResult
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var sr ScanResult
		doc.DataTo(&sr)
		results = append(results, sr)
	}

	if len(results) == 0 {
		handler.RespondJSON(w, http.StatusOK, map[string]any{
			"repo":   fullName,
			"result": nil,
			"status": "not_scanned",
		})
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"repo":   fullName,
		"result": results[0],
	})
}

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG REPO SYNC
// ─────────────────────────────────────────────────────────────────────────────

func (s *repoService) triggerConfigRepoSync(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	var req struct {
		TargetRepo string `json:"targetRepo"`
	}
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	now := time.Now()
	syncID := uuid.New().String()
	sync := ConfigRepoSync{
		ID:        syncID,
		OrgID:     orgID,
		Status:    "pending",
		StartedAt: now,
		CreatedAt: now,
	}

	_, err := s.store.Doc("configRepoSyncs", syncID).Set(r.Context(), sync)
	if err != nil {
		s.log.Error("failed to create config repo sync record", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	s.log.Info("config repo sync triggered", "org", orgID, "syncId", syncID, "target", req.TargetRepo)

	handler.RespondJSON(w, http.StatusAccepted, map[string]any{
		"syncId": syncID,
		"status": "pending",
	})
}

func (s *repoService) getConfigRepoSyncStatus(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	// Return the most recent sync record for this org.
	iter := s.store.Collection("configRepoSyncs").
		Where("orgId", "==", orgID).
		OrderBy("createdAt", gfs.Desc).
		Limit(1).
		Documents(r.Context())

	var syncs []ConfigRepoSync
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		var sync ConfigRepoSync
		doc.DataTo(&sync)
		syncs = append(syncs, sync)
	}

	if len(syncs) == 0 {
		handler.RespondJSON(w, http.StatusOK, map[string]any{
			"status": "no_syncs",
			"org":    orgID,
		})
		return
	}

	handler.RespondJSON(w, http.StatusOK, syncs[0])
}

// notifyGalRag fires an async ingest webhook to gal-rag so changed files are
// re-embedded. Called fire-and-forget from handlePushWebhook; errors are only
// logged. GAL_RAG_URL must be set for this to do anything.
func (s *repoService) notifyGalRag(ctx context.Context, orgID, owner, repo, ref string, installID int64, commits []githubCommit) {
	if s.ragURL == "" {
		return
	}
	// Collect unique changed/added paths across all commits. Removed files
	// are intentionally excluded — the ingestion worker handles dedup at the
	// Qdrant level and we don't yet have a delete pipeline.
	seen := map[string]bool{}
	var paths []string
	var lastCommitSHA string
	for _, c := range commits {
		if c.ID != "" {
			lastCommitSHA = c.ID
		}
		for _, p := range append(c.Added, c.Modified...) {
			if !seen[p] {
				seen[p] = true
				paths = append(paths, p)
			}
		}
	}
	if len(paths) == 0 {
		return
	}
	// Prefer the head commit SHA over the branch ref for fetch exactness:
	// fetching by branch races against a later push, by SHA is the exact
	// pushed tree. Fall back to the branch ref if the payload had no commits.
	fetchRef := ref
	if lastCommitSHA != "" {
		fetchRef = lastCommitSHA
	}
	body := map[string]any{
		"eventId":        fmt.Sprintf("%s/%s/%s", orgID, repo, ref),
		"orgId":          orgID,
		"owner":          owner,
		"repo":           repo,
		"ref":            fetchRef,
		"installationId": installID,
		"pathsChanged":   paths,
	}
	raw, _ := json.Marshal(body)
	url := s.ragURL + "/webhooks/repo-svc"
	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(raw))
	if err != nil {
		s.log.Warn("gal-rag notify: build request failed", "error", err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := s.httpClient.Do(req)
	if err != nil {
		s.log.Warn("gal-rag notify: request failed", "error", err, "repo", repo)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		buf, _ := io.ReadAll(resp.Body)
		s.log.Warn("gal-rag notify: non-2xx", "status", resp.StatusCode, "body", string(buf))
	}
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility
// ─────────────────────────────────────────────────────────────────────────────

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
