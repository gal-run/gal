// Package api wires the gal-rag HTTP handlers onto a chi router. The
// handlers cover the GitHub-style ingest webhook plus minimal
// health/metrics endpoints. Search endpoints (Task #4) hang off the
// same router once the Searcher implementation lands.
package api

import (
	"log/slog"
	"net/http"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
	"github.com/gal-run/gal/services/gal-rag/internal/ingest"
	"github.com/gal-run/gal/services/gal-rag/internal/store"
	"github.com/gal-run/gal/services/lib/handler"
)

// WebhookHandlers wires the repo-svc → gal-rag ingest webhook. It only
// enqueues jobs — the actual chunking/embedding happens in the
// ingestion worker pool.
type WebhookHandlers struct {
	store *store.Store
	log   *slog.Logger
}

// NewWebhookHandlers constructs the webhook handler set.
func NewWebhookHandlers(s *store.Store, log *slog.Logger) *WebhookHandlers {
	return &WebhookHandlers{store: s, log: log}
}

// HandleIngestEvent is POST /webhooks/repo-svc. Body shape is the
// `repo_svc.events.ingest` message from TECH.md 6.5.
func (h *WebhookHandlers) HandleIngestEvent(w http.ResponseWriter, r *http.Request) {
	var evt contracts.IngestWebhook
	if err := handler.DecodeJSON(r, &evt); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid webhook body", "BAD_REQUEST")
		return
	}
	if evt.OrgID == "" {
		handler.RespondError(w, http.StatusBadRequest, "orgId is required", "BAD_REQUEST")
		return
	}
	if evt.Owner == "" || evt.Repo == "" {
		handler.RespondError(w, http.StatusBadRequest, "owner and repo are required", "BAD_REQUEST")
		return
	}
	repoScope := evt.Owner + "/" + evt.Repo

	// One job per changed path. For empty PathsChanged (full re-index),
	// enqueue a single "scan-all" placeholder job.
	jobIDs := make([]string, 0, len(evt.PathsChanged))
	if len(evt.PathsChanged) == 0 {
		jobID, err := ingest.Enqueue(r.Context(), h.store, ingest.EnqueueRequest{
			OrgID:          evt.OrgID,
			RepoScope:      repoScope,
			SourceKind:     "github_file",
			SourceType:     "go",
			Owner:          evt.Owner,
			Repo:           evt.Repo,
			Ref:            evt.Ref,
			InstallationID: evt.InstallationID,
			Content:        "",
		})
		if err != nil {
			h.log.Error("enqueue failed", "error", err, "repo", repoScope)
			handler.RespondError(w, http.StatusInternalServerError, "enqueue failed", "ENQUEUE_FAILED")
			return
		}
		jobIDs = append(jobIDs, jobID)
	} else {
		for _, p := range evt.PathsChanged {
			sourceType := inferSourceTypeFromPath(p)
			// Empty content — the ingestion worker fetches the file from
			// GitHub (via the App installation token) before chunking. The
			// installation id is carried on the SourceRef so the worker can
			// mint that token.
			jobID, err := ingest.Enqueue(r.Context(), h.store, ingest.EnqueueRequest{
				OrgID:          evt.OrgID,
				RepoScope:      repoScope,
				SourceKind:     "github_file",
				SourceType:     sourceType,
				Owner:          evt.Owner,
				Repo:           evt.Repo,
				Path:           p,
				Ref:            evt.Ref,
				InstallationID: evt.InstallationID,
				Content:        "",
			})
			if err != nil {
				h.log.Error("enqueue failed", "error", err, "path", p)
				continue
			}
			jobIDs = append(jobIDs, jobID)
		}
	}

	handler.RespondJSON(w, http.StatusAccepted, contracts.IngestAck{
		Received: true,
		JobIDs:   jobIDs,
	})
}

// HandleEnqueueMemory is POST /webhooks/memory. Used by
// gal_write_memory and ADR uploads to schedule a semantic-ingest job
// without a git fetch step.
func (h *WebhookHandlers) HandleEnqueueMemory(w http.ResponseWriter, r *http.Request) {
	var req ingest.EnqueueRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.OrgID == "" {
		handler.RespondError(w, http.StatusBadRequest, "orgId is required", "BAD_REQUEST")
		return
	}
	jobID, err := ingest.Enqueue(r.Context(), h.store, req)
	if err != nil {
		h.log.Error("enqueue memory failed", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "enqueue failed", "ENQUEUE_FAILED")
		return
	}
	handler.RespondJSON(w, http.StatusAccepted, contracts.IngestAck{
		Received: true,
		JobIDs:   []string{jobID},
	})
}

// inferSourceTypeFromPath picks a default sourceType from the file
// extension. Falls back to "md" for unknown extensions so the markdown
// chunker handles them.
func inferSourceTypeFromPath(p string) string {
	switch ext := extLower(p); ext {
	case ".go":
		return "go"
	case ".rs":
		return "rust"
	case ".ts", ".tsx":
		return "ts"
	case ".js", ".jsx":
		return "ts"
	case ".py":
		return "py"
	case ".md", ".markdown":
		return "md"
	default:
		return "md"
	}
}

func extLower(p string) string {
	for i := len(p) - 1; i >= 0 && p[i] != '/'; i-- {
		if p[i] == '.' {
			return lower(p[i:])
		}
	}
	return ""
}

func lower(s string) string {
	b := []byte(s)
	for i, c := range b {
		if c >= 'A' && c <= 'Z' {
			b[i] = c + 32
		}
	}
	return string(b)
}
