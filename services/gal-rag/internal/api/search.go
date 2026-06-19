package api

import (
	"log/slog"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/jwtauth/v5"
	galauth "github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/handler"

	"github.com/gal-run/gal/services/gal-rag/internal/auth"
	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
	"github.com/gal-run/gal/services/gal-rag/internal/search"
)

// SearchHandlers bundles the dependencies shared by every /rag/* handler.
type SearchHandlers struct {
	Searcher     search.Searcher
	Log          *slog.Logger
	requestCount int64
}

// NewSearchHandlers returns a SearchHandlers.
func NewSearchHandlers(s search.Searcher, log *slog.Logger) *SearchHandlers {
	return &SearchHandlers{Searcher: s, Log: log}
}

// MountSearchRoutes wires the five search endpoints behind the standard
// auth chain. Health and metrics are registered by api.NewServer.
func MountSearchRoutes(r chi.Router, ja *jwtauth.JWTAuth, h *SearchHandlers) {
	r.Group(func(r chi.Router) {
		r.Use(auth.Chain(ja, h.Log))
		r.Post("/rag/search", h.search)
		r.Post("/rag/get", h.get)
		r.Post("/rag/graph", h.graph)
		r.Post("/rag/timeline", h.timeline)
		r.Post("/rag/evaluate", h.evaluate)
	})
}

// Routes returns an http.Handler that exposes the /rag/* endpoints
// behind the standard auth chain. The returned handler can be safely
// used with `router.Mount("/", h.Routes(ja))` even when another
// handler is also mounted at "/" — it dispatches by URL path and 404s
// on anything outside /rag/*. This avoids the "attempting to Mount() a
// handler on an existing path" chi error in cmd/server/main.go where
// the ingest handler is also mounted at "/".
func (h *SearchHandlers) Routes(ja *jwtauth.JWTAuth) http.Handler {
	// Build the auth-protected inner router. We do NOT return it
	// directly because chi.Mount("/", x) only allows one mount at "/".
	// Instead we wrap it in a dispatcher that only routes /rag/*
	// requests through it.
	inner := chi.NewRouter()
	MountSearchRoutes(inner, ja, h)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Only the five /rag/* paths are owned by this handler; let
		// every other path fall through to the parent's mux.
		if !strings.HasPrefix(r.URL.Path, "/rag/") {
			http.NotFound(w, r)
			return
		}
		inner.ServeHTTP(w, r)
	})
}

func (h *SearchHandlers) search(w http.ResponseWriter, r *http.Request) {
	atomic.AddInt64(&h.requestCount, 1)
	orgID := galauth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org claim", "UNAUTHORIZED")
		return
	}
	var req contracts.SearchRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Query == "" {
		handler.RespondError(w, http.StatusBadRequest, "query is required", "BAD_REQUEST")
		return
	}
	if req.TopK <= 0 {
		req.TopK = 20
	}
	if req.Filter == nil {
		req.Filter = &contracts.Filter{}
	}
	req.Filter.OrgID = orgID

	ranking := contracts.DefaultRanking()
	// Ranking is a *Ranking pointer in Task #3's contract; nil → defaults.
	if req.Ranking != nil {
		ranking = *req.Ranking
	}
	_ = ranking

	resp, err := search.Search(r.Context(), h.Searcher, contracts.SearchParams{
		Query:       req.Query,
		Filter:      req.Filter,
		TopK:        req.TopK,
		Now:         time.Now(),
		QueryTokens: nil,
	})
	if err != nil {
		h.logErr("search", err)
		handler.RespondError(w, http.StatusBadGateway, "search failed", "RAG_QDRANT_UNAVAILABLE")
		return
	}
	if req.IncludeContent {
		ids := make([]string, 0, len(resp.Results))
		for _, hit := range resp.Results {
			ids = append(ids, hit.ID)
		}
		chunks, _ := h.Searcher.GetByIDs(r.Context(), orgID, ids)
		byID := make(map[string]contracts.Chunk, len(chunks))
		for _, c := range chunks {
			byID[c.ID] = c
		}
		for i := range resp.Results {
			if c, ok := byID[resp.Results[i].ID]; ok {
				resp.Results[i].Snippet = snippet(c.Content, 240)
			}
		}
	}
	handler.RespondJSON(w, http.StatusOK, resp)
}

func (h *SearchHandlers) get(w http.ResponseWriter, r *http.Request) {
	atomic.AddInt64(&h.requestCount, 1)
	orgID := galauth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org claim", "UNAUTHORIZED")
		return
	}
	var req contracts.GetRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if len(req.IDs) == 0 {
		handler.RespondError(w, http.StatusBadRequest, "ids is required", "BAD_REQUEST")
		return
	}
	if len(req.IDs) > 200 {
		handler.RespondError(w, http.StatusBadRequest, "ids: max 200 per request", "BAD_REQUEST")
		return
	}
	chunks, err := h.Searcher.GetByIDs(r.Context(), orgID, req.IDs)
	if err != nil {
		h.logErr("get", err)
		handler.RespondError(w, http.StatusBadGateway, "get failed", "RAG_QDRANT_UNAVAILABLE")
		return
	}
	handler.RespondJSON(w, http.StatusOK, contracts.GetResponse{Chunks: chunks})
}

func (h *SearchHandlers) graph(w http.ResponseWriter, r *http.Request) {
	atomic.AddInt64(&h.requestCount, 1)
	orgID := galauth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org claim", "UNAUTHORIZED")
		return
	}
	var req contracts.GraphRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if len(req.SeedIDs) == 0 {
		handler.RespondError(w, http.StatusBadRequest, "seedIds is required", "BAD_REQUEST")
		return
	}
	if req.Hops < 0 || req.Hops > 5 {
		handler.RespondError(w, http.StatusBadRequest, "hops: must be 0..5", "BAD_REQUEST")
		return
	}
	resp, err := search.GraphExpand(r.Context(), h.Searcher, orgID, req)
	if err != nil {
		h.logErr("graph", err)
		handler.RespondError(w, http.StatusBadGateway, "graph failed", "RAG_QDRANT_UNAVAILABLE")
		return
	}
	handler.RespondJSON(w, http.StatusOK, resp)
}

func (h *SearchHandlers) timeline(w http.ResponseWriter, r *http.Request) {
	atomic.AddInt64(&h.requestCount, 1)
	orgID := galauth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org claim", "UNAUTHORIZED")
		return
	}
	var req contracts.TimelineRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Filter == nil {
		req.Filter = &contracts.Filter{}
	}
	req.Filter.OrgID = orgID

	resp, err := search.Timeline(r.Context(), h.Searcher, orgID, req)
	if err != nil {
		h.logErr("timeline", err)
		handler.RespondError(w, http.StatusBadGateway, "timeline failed", "RAG_QDRANT_UNAVAILABLE")
		return
	}
	handler.RespondJSON(w, http.StatusOK, resp)
}

func (h *SearchHandlers) evaluate(w http.ResponseWriter, r *http.Request) {
	atomic.AddInt64(&h.requestCount, 1)
	orgID := galauth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org claim", "UNAUTHORIZED")
		return
	}
	var req contracts.EvaluateRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Query == "" {
		handler.RespondError(w, http.StatusBadRequest, "query is required", "BAD_REQUEST")
		return
	}
	if len(req.ResultIDs) == 0 {
		handler.RespondError(w, http.StatusBadRequest, "resultIds is required", "BAD_REQUEST")
		return
	}
	chunks, err := h.Searcher.GetByIDs(r.Context(), orgID, req.ResultIDs)
	if err != nil {
		h.logErr("evaluate", err)
		handler.RespondError(w, http.StatusBadGateway, "evaluate failed", "RAG_QDRANT_UNAVAILABLE")
		return
	}
	hits := make([]contracts.Hit, 0, len(chunks))
	for _, c := range chunks {
		hits = append(hits, contracts.Hit{ID: c.ID, CreatedAt: c.CreatedAt})
	}
	resp := search.Evaluate(req.Query, hits, chunks, req.Criteria, time.Now())
	handler.RespondJSON(w, http.StatusOK, resp)
}

func (h *SearchHandlers) logErr(op string, err error) {
	if h.Log != nil {
		h.Log.Error("rag handler failed", "op", op, "error", err)
	}
}

func snippet(content string, max int) string {
	if len(content) <= max {
		return content
	}
	return content[:max]
}
