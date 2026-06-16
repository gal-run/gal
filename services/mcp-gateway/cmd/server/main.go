//go:build cloud
// +build cloud

// mcp-gateway handles MCP (Model Context Protocol) Streamable HTTP transport,
// OAuth 2.0 authorization for MCP clients, gateway health/readiness, and feature flags.
// This is the entry point for AI agents connecting to GAL.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"

	"github.com/gal-run/gal/services/lib/firestore"
	"github.com/gal-run/gal/services/lib/telemetry"

	"github.com/gal-run/gal/services/mcp-gateway/internal/handler"
	"github.com/gal-run/gal/services/mcp-gateway/internal/store"
)

// buildVersion is set at compile time via -ldflags.
var buildVersion = "0.0.0"

func main() {
	ctx := context.Background()
	log := telemetry.Logger()

	tp, _ := telemetry.InitTracer(ctx, "mcp-gateway")
	defer func() {
		if tp != nil {
			tp.Shutdown(ctx)
		}
	}()

	port := envOrDefault("PORT", "8080")
	version := envOrDefault("GAL_VERSION", buildVersion)

	// --- Firestore ---
	fsClient, err := firestore.Client(ctx)
	if err != nil {
		log.Error("firestore unavailable", "error", err)
		os.Exit(1)
	}

	mcpStore := store.NewMcpStore(fsClient)

	// --- JWT auth (for features/admin routes only) ---
	ja := jwtauth.New("HS256", []byte(os.Getenv("JWT_SECRET")), nil)

	// --- Gateway service ---
	svc := &handler.GatewayService{
		Store:     mcpStore,
		Log:       log,
		JA:        ja,
		StartTime: time.Now(),
		Version:   version,
	}

	// --- Router ---
	r := chi.NewRouter()

	// Global middleware
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))

	// -------- Health & gateway (public) --------
	r.Get("/health", svc.HandleHealth)
	r.Get("/health/ready", svc.HandleReadiness)
	r.Get("/build-info", svc.HandleBuildInfo)
	r.Get("/gateway/status", svc.HandleGatewayStatus)

	// -------- Well-known OAuth endpoints (public) --------
	r.Get("/.well-known/oauth-authorization-server", svc.HandleWellKnownOAuth)
	r.Get("/.well-known/oauth-protected-resource/*", svc.HandleWellKnownProtectedResource)

	// -------- MCP OAuth 2.0 endpoints (no JWT — uses client credentials / PKCE) --------
	r.Get("/mcp/oauth/authorize", svc.HandleAuthorize)
	r.Post("/mcp/oauth/token", svc.HandleToken)
	r.Post("/mcp/oauth/revoke", svc.HandleRevoke)
	r.Post("/mcp/oauth/register", svc.HandleRegister)

	// -------- MCP Streamable HTTP endpoint --------
	// No JWT middleware. Uses MCP OAuth bearer tokens validated in the handler.
	r.Post("/mcp", svc.HandleMCP)
	r.Get("/mcp", svc.HandleMCP)
	r.Delete("/mcp", svc.HandleMCP)

	// -------- MCP discovery endpoints --------
	r.Get("/mcp/.well-known", svc.HandleMCPServerDiscovery)

	// -------- Feature flags (JWT auth required) --------
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(svc.JA))
		r.Use(jwtauth.Authenticator(svc.JA))

		r.Get("/features", svc.HandleGetFeatures)
		r.Get("/features/admin", svc.HandleGetAdminFeatures)
	})

	// -------- Server --------
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Info("shutting down mcp-gateway")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		if closeErr := firestore.Close(); closeErr != nil {
			log.Error("firestore close error", "error", closeErr)
		}

		if err := srv.Shutdown(shutdownCtx); err != nil {
			log.Error("server shutdown error", "error", err)
		}
	}()

	log.Info("mcp-gateway starting",
		"port", port,
		"version", version,
		"service", "mcp-gateway",
	)

	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server error", "error", err)
		os.Exit(1)
	}

	log.Info("mcp-gateway stopped")
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
