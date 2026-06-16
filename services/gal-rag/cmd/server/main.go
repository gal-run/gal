// gal-rag is the unified semantic retrieval layer for the GAL platform.
// It owns the gal_rag_chunks Qdrant collection and the Postgres-backed
// ingestion job queue, and exposes a hybrid search API plus a webhook
// surface for repo-svc ingest events.
//
// Module path: github.com/gal-run/gal/services/gal-rag
//
// This binary is a single Go process that runs:
//   - the HTTP server (chi mux, port 8090 by default)
//   - the ingestion worker pool (N=4 goroutines, draining gal_rag_jobs)
//   - the Qdrant collection lifecycle (ensure collection + indexes on boot)
//
// Architecture diagram: see TECH.md §4.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"

	"github.com/gal-run/gal/services/gal-rag/internal/api"
	"github.com/gal-run/gal/services/gal-rag/internal/embeddings"
	"github.com/gal-run/gal/services/gal-rag/internal/ingest"
	"github.com/gal-run/gal/services/gal-rag/internal/qdrant/httpsearch"
	"github.com/gal-run/gal/services/gal-rag/internal/store"
	"github.com/gal-run/gal/services/lib/githubapp"
	"github.com/gal-run/gal/services/lib/telemetry"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	log := telemetry.Logger()

	if tp, err := telemetry.InitTracer(ctx, "gal-rag"); err == nil {
		defer func() {
			shutdownCtx, c := context.WithTimeout(context.Background(), 5*time.Second)
			defer c()
			_ = tp.Shutdown(shutdownCtx)
		}()
	}

	// initCtx is used for startup I/O (Postgres ping, Qdrant bootstrap).
	// We intentionally do NOT use the shutdown context here so that a
	// SIGTERM delivered during the CrashLoopBackOff restart window doesn't
	// cancel these calls before the server is even listening.
	initCtx, initCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer initCancel()

	// ── Postgres ───────────────────────────────────────────────────────
	dsn := envOrDefault("DATABASE_URL", "postgres://localhost:5432/gal_rag?sslmode=disable")
	st, err := store.New(initCtx, dsn)
	if err != nil {
		log.Error("postgres unavailable", "error", err)
		os.Exit(1)
	}
	defer st.Close()
	if err := st.Ping(initCtx); err != nil {
		log.Warn("postgres ping failed; jobs will queue but worker will not consume", "error", err)
	}

	// ── Embeddings client (shared by worker and searcher) ───────────
	emb := embeddings.New()

	// ── Qdrant collection bootstrap ──────────────────────────────────
	qdrantURL := envOrDefault("QDRANT_URL", "http://localhost:6333")
	qdrantKey := os.Getenv("QDRANT_API_KEY")
	if err := ensureCollection(initCtx, qdrantURL, qdrantKey, log); err != nil {
		log.Warn("qdrant collection bootstrap failed; searches will fail until collection exists",
			"error", err)
	}

	// ── Searcher ─────────────────────────────────────────────────────
	// DefaultModel MUST match the model used at ingestion time — query and
	// document vectors have to come from the same embedder for cosine
	// similarity to mean anything. Both default to Gemini (512-dim, the
	// dense_voyage_512 slot).
	searcher := httpsearch.New(httpsearch.Config{
		BaseURL:      qdrantURL,
		APIKey:       qdrantKey,
		DefaultModel: embeddings.ModelGeminiEmbedding001512,
	}, emb)

	// ── Ingestion worker pool ────────────────────────────────────────
	upserter := ingest.NewQdrantHTTPUpserter(ingest.QdrantHTTPConfig{
		BaseURL: qdrantURL,
		APIKey:  qdrantKey,
	})
	worker := ingest.New(st, upserter, emb, log, ingest.DefaultConfig())

	// ── GitHub App content fetcher (optional) ─────────────────────────
	// When GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY are present, github_file
	// jobs that arrive with empty Content have their content fetched from
	// GitHub before chunking. When absent, those jobs no-op (legacy
	// behaviour) so local/dev runs without the secret still start cleanly.
	if appID := os.Getenv("GITHUB_APP_ID"); appID != "" && os.Getenv("GITHUB_APP_PRIVATE_KEY") != "" {
		gh, err := githubapp.LoadKey(os.Getenv("GITHUB_APP_PRIVATE_KEY"), appID)
		if err != nil {
			log.Warn("github app key load failed; content fetch disabled", "error", err)
		} else {
			worker.SetFetcher(gh)
			log.Info("github app content fetcher enabled", "appId", appID)
		}
	} else {
		log.Info("github app credentials absent; github_file content fetch disabled")
	}

	worker.Start(ctx)
	defer worker.Stop()

	// ── HTTP server ───────────────────────────────────────────────────
	ja := jwtauth.New("HS256", []byte(os.Getenv("JWT_SECRET")), nil)
	if os.Getenv("JWT_SECRET") == "" {
		log.Warn("JWT_SECRET is empty; signed tokens will be rejected")
	}

	router := chi.NewRouter()
	router.Use(chimw.RequestID)
	router.Use(chimw.Logger)
	router.Use(chimw.Recoverer)
	router.Use(chimw.Timeout(30 * time.Second))

	// Webhook + admin surface (Task #3 — ingestion side).
	router.Mount("/", api.NewServer(api.ServerOptions{
		JWTAuth: ja,
		Store:   st,
		Log:     log,
	}))

	// /rag/* search surface (Task #4 — search side). The search
	// sub-router is a single http.Handler that owns only the /rag/*
	// paths (it 404s everything else), so we can register it via
	// router.Handle rather than router.Mount — the latter would collide
	// with the ingest handler already mounted at "/".
	searchHandlers := api.NewSearchHandlers(searcher, log)
	router.Handle("/rag/*", searchHandlers.Routes(ja))
	router.Handle("/rag", searchHandlers.Routes(ja))

	port := envOrDefault("PORT", "8090")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      router,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		log.Info("gal-rag starting", "port", port, "qdrant", qdrantURL)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("server error", "error", err)
			cancel()
		}
	}()

	<-ctx.Done()
	log.Info("gal-rag shutting down")
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancelShutdown()
	_ = srv.Shutdown(shutdownCtx)
}

func envOrDefault(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

// ensureCollection creates the gal_rag_chunks Qdrant collection if it does
// not already exist. Idempotent: a 409 Conflict from Qdrant is treated as
// success. Non-fatal: the caller logs a warning and continues.
func ensureCollection(ctx context.Context, baseURL, apiKey string, log interface {
	Info(string, ...any)
	Warn(string, ...any)
}) error {
	body := map[string]any{
		"vectors": map[string]any{
			"dense_openai_256": map[string]any{"size": 256, "distance": "Cosine"},
			"dense_voyage_512": map[string]any{"size": 512, "distance": "Cosine"},
		},
		"optimizers_config": map[string]any{"default_segment_number": 2},
	}
	raw, _ := json.Marshal(body)
	url := fmt.Sprintf("%s/collections/gal_rag_chunks", baseURL)
	req, err := http.NewRequestWithContext(ctx, "PUT", url, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("api-key", apiKey)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("qdrant create collection: %w", err)
	}
	defer resp.Body.Close()
	// 200 = created, 409 = already exists — both are fine.
	if resp.StatusCode == http.StatusOK || resp.StatusCode == http.StatusConflict {
		log.Info("qdrant collection ready", "status", resp.StatusCode)
		return nil
	}
	buf, _ := io.ReadAll(resp.Body)
	return fmt.Errorf("qdrant create collection %d: %s", resp.StatusCode, string(buf))
}

