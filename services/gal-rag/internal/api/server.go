package api

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/gal-run/gal/services/gal-rag/internal/store"
	"github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/handler"
)

// ServerOptions configures NewServer.
type ServerOptions struct {
	JWTAuth     *jwtauth.JWTAuth
	Store       *store.Store
	Log         *slog.Logger
	ReadTimeout time.Duration
}

// NewServer returns a chi router with the gal-rag surface mounted:
//
//	GET  /health                    — liveness
//	GET  /metrics                   — prometheus
//	POST /webhooks/repo-svc         — repo-svc ingest events
//	POST /webhooks/memory           — memory / ADR enqueue
//	GET  /admin/dlq/depth           — DLQ depth (gated by JWT + orgId)
//
// Search routes (/rag/*) are registered by the caller once Task #4
// has added the Searcher implementation. The router is exposed via
// the returned http.Handler so the main package can mount it.
func NewServer(opts ServerOptions) http.Handler {
	if opts.ReadTimeout == 0 {
		opts.ReadTimeout = 30 * time.Second
	}
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(opts.ReadTimeout))

	// Health + metrics — no auth.
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Method("GET", "/metrics", promhttp.Handler())

	// Webhooks — repo-svc fan-out. Verified by service-to-service auth
	// (the gateway adds an internal JWT before forwarding).
	wh := NewWebhookHandlers(opts.Store, opts.Log)
	if opts.JWTAuth != nil {
		r.Group(func(r chi.Router) {
			r.Use(jwtauth.Verifier(opts.JWTAuth))
			r.Use(jwtauth.Authenticator(opts.JWTAuth))
			r.Use(auth.Middleware(opts.JWTAuth))
			r.Post("/webhooks/repo-svc", wh.HandleIngestEvent)
			r.Post("/webhooks/memory", wh.HandleEnqueueMemory)
			r.Get("/admin/dlq/depth", dlqDepth(opts.Store))
		})
	} else {
		// Dev mode: no auth.
		r.Post("/webhooks/repo-svc", wh.HandleIngestEvent)
		r.Post("/webhooks/memory", wh.HandleEnqueueMemory)
		r.Get("/admin/dlq/depth", dlqDepth(opts.Store))
	}
	return r
}

// dlqDepth returns the current DLQ row count for the caller's org.
// Implements the DLQ depth metric described in TECH.md 9.4.2.
func dlqDepth(s *store.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		orgID := auth.OrgID(r.Context())
		if orgID == "" {
			handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
			return
		}
		n, err := s.DLQDepth(r.Context(), orgID)
		if err != nil {
			handler.RespondError(w, http.StatusInternalServerError, "dlq depth lookup failed", "DB_ERROR")
			return
		}
		handler.RespondJSON(w, http.StatusOK, map[string]any{
			"orgId":  orgID,
			"depth":  n,
		})
	}
}
