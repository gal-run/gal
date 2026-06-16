package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"
	"github.com/go-chi/jwtauth/v5"

	"github.com/gal-run/gal/services/lib/contracts"
	"github.com/gal-run/gal/services/lib/telemetry"
)

// serviceURLs holds the downstream service URLs resolved at startup.
type serviceURLs struct {
	auth, repo, governance, dispatch, sdlc, telemetry, team, mal string
	// monolith is the legacy TS gal-api, used as the strangler-fig fallthrough
	// for any path not yet migrated to a Go service.
	monolith string
}

// resolveServiceURLs reads service URLs from environment variables with defaults.
func resolveServiceURLs() serviceURLs {
	return serviceURLs{
		auth:       envOrDefault("AUTH_SVC_URL", "http://auth-svc:8080"),
		repo:       envOrDefault("REPO_SVC_URL", "http://repo-svc:8080"),
		governance: envOrDefault("GOVERNANCE_SVC_URL", "http://governance-svc:8080"),
		dispatch:   envOrDefault("DISPATCH_SVC_URL", "http://dispatch-svc:8080"),
		sdlc:       envOrDefault("SDLC_SVC_URL", "http://sdlc-svc:8080"),
		telemetry:  envOrDefault("TELEMETRY_SVC_URL", "http://telemetry-svc:8080"),
		team:       envOrDefault("TEAM_SVC_URL", "http://team-svc:8080"),
		mal:        envOrDefault("MAL_SVC_URL", "http://mal-svc:8080"),
		// Default to the legacy TS monolith Service in the apps namespace.
		monolith: envOrDefault("MONOLITH_UPSTREAM", "http://gal-api.apps.svc.cluster.local:80"),
	}
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func main() {
	ctx := context.Background()
	log := telemetry.Logger()
	svc := resolveServiceURLs()

	// Initialize tracing.
	tp, err := telemetry.InitTracer(ctx, "gal-gateway")
	if err != nil {
		log.Error("failed to init tracer", "error", err)
		os.Exit(1)
	}
	defer tp.Shutdown(ctx)

	// SEAM 2: verify the persistence backend is reachable before serving.
	// In the cloud build this checks Firestore connectivity; in the OSS build
	// (or when GOV_STORE=postgres) the gateway is a pure reverse proxy that
	// owns no Firestore data, so this is a no-op and the gateway boots GCP-free.
	if err := verifyBackend(ctx); err != nil {
		log.Error("backend unavailable", "error", err)
		os.Exit(1)
	}

	// JWT auth using Firebase public keys.
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Error("JWT_SECRET required")
		os.Exit(1)
	}
	ja := jwtauth.New("HS256", []byte(jwtSecret), nil)

	r := chi.NewRouter()

	// Global middleware.
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"https://app.gal.run", "https://admin.gal.run", "http://localhost:*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))
	r.Use(httprate.LimitByIP(100, time.Minute))

	// Health check (no auth).
	r.Get("/health", healthHandler)
	r.Get("/health/ready", readyHandler)

	// GAL model dashboard and inference (no auth).
	r.Route("/gal", func(r chi.Router) { mountProxy(r, "governance-svc", svc.governance) })

	// Metrics: aggregate health from all downstream services (no auth).
	r.Get("/metrics", metricsHandler(svc))

	// Public webhook endpoints (no auth, verified by signatures).
	r.Post("/webhooks/github", proxyTo("repo-svc", svc.repo))

	// Public OAuth callback — Google redirects here, no JWT.
	r.Get("/auth/oauth/callback", proxyTo("auth-svc", svc.auth))

	// NOTE (OSS): billing/entitlement webhook + proxy routes (Stripe, Brevo,
	// /billing, /entitlements, /rate-card, /token-spend, /token-budget, /seats)
	// are part of the proprietary managed control plane and are not registered
	// in this open distribution.

	// Organizations — passthrough to auth-svc (no JWT validation here;
	// auth-svc parses the token from the Authorization header directly).
	r.Get("/organizations", proxyTo("auth-svc", svc.auth))
	r.Post("/organizations/quick-sync", proxyTo("auth-svc", svc.auth))

	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))

		// Auth routes --> auth-svc.
		r.Route("/auth", func(r chi.Router) { mountProxy(r, "auth-svc", svc.auth) })
		r.Route("/users", func(r chi.Router) { mountProxy(r, "auth-svc", svc.auth) })
		r.Route("/credentials", func(r chi.Router) { mountProxy(r, "auth-svc", svc.auth) })
		r.Route("/sso", func(r chi.Router) { mountProxy(r, "auth-svc", svc.auth) })

		// Repo & discovery --> repo-svc.
		r.Route("/repos", func(r chi.Router) { mountProxy(r, "repo-svc", svc.repo) })
		r.Route("/discovery", func(r chi.Router) { mountProxy(r, "repo-svc", svc.repo) })
		r.Route("/config-repo", func(r chi.Router) { mountProxy(r, "repo-svc", svc.repo) })

		// Governance --> governance-svc.
		r.Route("/proposals", func(r chi.Router) { mountProxy(r, "governance-svc", svc.governance) })
		r.Route("/approved-config", func(r chi.Router) { mountProxy(r, "governance-svc", svc.governance) })
		r.Route("/policies", func(r chi.Router) { mountProxy(r, "governance-svc", svc.governance) })
		r.Route("/compliance-status", func(r chi.Router) { mountProxy(r, "governance-svc", svc.governance) })
		r.Route("/drift-status", func(r chi.Router) { mountProxy(r, "governance-svc", svc.governance) })
		r.Route("/tool-policy", func(r chi.Router) { mountProxy(r, "governance-svc", svc.governance) })
		r.Route("/domain-audit", func(r chi.Router) { mountProxy(r, "governance-svc", svc.governance) })
		r.Route("/enforcement", func(r chi.Router) { mountProxy(r, "governance-svc", svc.governance) })

		// Dispatch --> dispatch-svc.
		r.Route("/sessions", func(r chi.Router) { mountProxy(r, "dispatch-svc", svc.dispatch) })
		r.Route("/queue", func(r chi.Router) { mountProxy(r, "dispatch-svc", svc.dispatch) })
		r.Route("/work-items", func(r chi.Router) { mountProxy(r, "dispatch-svc", svc.dispatch) })
		r.Route("/dispatch", func(r chi.Router) { mountProxy(r, "dispatch-svc", svc.dispatch) })
		r.Route("/swarm", func(r chi.Router) { mountProxy(r, "dispatch-svc", svc.dispatch) })
		r.Route("/orchestration", func(r chi.Router) { mountProxy(r, "dispatch-svc", svc.dispatch) })
		r.Route("/supervisor", func(r chi.Router) { mountProxy(r, "dispatch-svc", svc.dispatch) })

		// SDLC --> sdlc-svc.
		r.Route("/sdlc", func(r chi.Router) { mountProxy(r, "sdlc-svc", svc.sdlc) })
		r.Route("/product-discipline", func(r chi.Router) { mountProxy(r, "sdlc-svc", svc.sdlc) })
		r.Route("/product-issue-gate", func(r chi.Router) { mountProxy(r, "sdlc-svc", svc.sdlc) })

		// Telemetry --> telemetry-svc.
		r.Route("/telemetry", func(r chi.Router) { mountProxy(r, "telemetry-svc", svc.telemetry) })
		r.Route("/audit-log", func(r chi.Router) { mountProxy(r, "telemetry-svc", svc.telemetry) })
		r.Route("/developer-status", func(r chi.Router) { mountProxy(r, "telemetry-svc", svc.telemetry) })

		// Teams --> team-svc.
		r.Route("/teams", func(r chi.Router) { mountProxy(r, "team-svc", svc.team) })
		r.Route("/workspaces", func(r chi.Router) { mountProxy(r, "team-svc", svc.team) })
		r.Route("/org-memory", func(r chi.Router) { mountProxy(r, "team-svc", svc.team) })
		r.Route("/invites", func(r chi.Router) { mountProxy(r, "team-svc", svc.team) })

		// MAL --> mal-svc.
		r.Route("/mal", func(r chi.Router) { mountProxy(r, "mal-svc", svc.mal) })
		r.Route("/agent-cards", func(r chi.Router) { mountProxy(r, "mal-svc", svc.mal) })
		r.Route("/memory", func(r chi.Router) { mountProxy(r, "mal-svc", svc.mal) })
		r.Route("/learning", func(r chi.Router) { mountProxy(r, "mal-svc", svc.mal) })

		// MCP gateway routes to mal-svc for now.
		r.Route("/mcp", func(r chi.Router) { mountProxy(r, "mal-svc", svc.mal) })
	})

	// Strangler-fig fallthrough: any path not matched by a Go route above
	// reverse-proxies to the legacy TS monolith (gal-api). This lets us flip a
	// host to the gateway and then cut routes over to Go one-at-a-time —
	// unmigrated paths transparently fall through to TS instead of 404ing.
	// Registered outside the JWT group: the monolith performs its own auth
	// (it reads the gal_session cookie / Authorization header itself).
	r.NotFound(proxyTo("ts-monolith", svc.monolith))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown.
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Info("shutting down...")
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
		closeBackend()
	}()

	log.Info("gateway starting", "port", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server error", "error", err)
		os.Exit(1)
	}
}

func healthHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ok"}`))
}

func readyHandler(w http.ResponseWriter, r *http.Request) {
	// SEAM 2: readiness checks the backend only in the cloud build; the OSS
	// gateway is a stateless proxy and is always ready once serving.
	if err := verifyBackend(r.Context()); err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"status":"not ready","reason":"backend unavailable"}`))
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"ready"}`))
}

// newProxy creates an httputil.ReverseProxy that forwards requests to targetURL.
// It preserves the request path and query string, copies request headers, sets
// X-Forwarded-For, X-Forwarded-Host, and X-Forwarded-Proto headers, logs each
// proxied request with response status, and returns a 502 Bad Gateway when the
// upstream service is unreachable.
func newProxy(serviceName, targetURL string) http.Handler {
	target, err := url.Parse(targetURL)
	if err != nil {
		slog.Error("invalid target URL for proxy", "service", serviceName, "url", targetURL, "error", err)
		os.Exit(1)
	}

	rp := httputil.NewSingleHostReverseProxy(target)

	// Wrap the default director to add forwarding headers and preserve auth.
	baseDirector := rp.Director
	rp.Director = func(r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		baseDirector(r)
		// Restore Authorization header stripped by ReverseProxy on cross-host requests.
		if authHeader != "" {
			r.Header.Set("Authorization", authHeader)
		}
		r.Header.Set("X-Forwarded-For", r.RemoteAddr)
		r.Header.Set("X-Forwarded-Host", r.Host)
		if r.TLS != nil {
			r.Header.Set("X-Forwarded-Proto", "https")
		} else {
			r.Header.Set("X-Forwarded-Proto", "http")
		}
	}

	// Strip upstream CORS headers — the gateway sets its own. Duplicate
	// Access-Control-* headers break CORS in browsers.
	rp.ModifyResponse = func(r *http.Response) error {
		r.Header.Del("Access-Control-Allow-Origin")
		r.Header.Del("Access-Control-Allow-Credentials")
		r.Header.Del("Access-Control-Allow-Methods")
		r.Header.Del("Access-Control-Allow-Headers")
		return nil
	}

	// Return 502 Bad Gateway when the upstream is unreachable.
	rp.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Error("upstream unreachable",
			"service", serviceName,
			"method", r.Method,
			"path", r.URL.Path,
			"error", err,
		)
		writeJSON(w, http.StatusBadGateway, contracts.APIError{
			Error: fmt.Sprintf("upstream %s unreachable", serviceName),
			Code:  "BAD_GATEWAY",
		})
	}

	// Wrap with request/response logging.
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		lrw := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}
		rp.ServeHTTP(lrw, r)
		slog.Info("proxy request",
			"service", serviceName,
			"method", r.Method,
			"path", r.URL.Path,
			"status", lrw.statusCode,
		)
	})
}

// proxyTo creates an http.HandlerFunc that reverse-proxies to targetURL.
// The incoming request path and query string are forwarded as-is.
func proxyTo(serviceName, targetURL string) http.HandlerFunc {
	return newProxy(serviceName, targetURL).ServeHTTP
}

// mountProxy registers a catch-all route on the given chi sub-router that
// reverse-proxies all requests to the downstream service at targetURL.
func mountProxy(r chi.Router, serviceName, targetURL string) {
	r.Handle("/*", newProxy(serviceName, targetURL))
}

// responseWriter wraps http.ResponseWriter to capture the status code written
// by the upstream handler.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

// WriteHeader captures the status code and delegates to the wrapped writer.
func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// writeJSON serializes v as JSON to the response with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		slog.Error("failed to encode JSON response", "error", err)
	}
}

// healthResult represents the health check result for a single downstream service.
type healthResult struct {
	Status  string `json:"status"`
	Latency string `json:"latency,omitempty"`
	Error   string `json:"error,omitempty"`
}

// metricsResponse is the JSON body returned by the /metrics endpoint.
type metricsResponse struct {
	Status    string                  `json:"status"`
	Services  map[string]healthResult `json:"services"`
	Timestamp time.Time               `json:"timestamp"`
}

// metricsHandler returns an http.HandlerFunc that queries the /health endpoint of
// every downstream service concurrently and returns an aggregate status.
func metricsHandler(svc serviceURLs) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		checks := []struct {
			name string
			url  string
		}{
			{"auth", svc.auth + "/health"},
			{"repo", svc.repo + "/health"},
			{"governance", svc.governance + "/health"},
			{"dispatch", svc.dispatch + "/health"},
			{"sdlc", svc.sdlc + "/health"},
			{"telemetry", svc.telemetry + "/health"},
			{"team", svc.team + "/health"},
			{"mal", svc.mal + "/health"},
		}

		results := make(map[string]healthResult, len(checks))
		var mu sync.Mutex
		var wg sync.WaitGroup

		for _, c := range checks {
			wg.Add(1)
			c := c
			go func() {
				defer wg.Done()
				start := time.Now()

				ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
				defer cancel()

				req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.url, nil)
				if err != nil {
					mu.Lock()
					results[c.name] = healthResult{
						Status:  "unhealthy",
						Latency: time.Since(start).Round(time.Millisecond).String(),
						Error:   err.Error(),
					}
					mu.Unlock()
					return
				}

				resp, err := http.DefaultClient.Do(req)
				latency := time.Since(start).Round(time.Millisecond).String()

				mu.Lock()
				defer mu.Unlock()

				if err != nil {
					results[c.name] = healthResult{
						Status:  "unhealthy",
						Latency: latency,
						Error:   err.Error(),
					}
					return
				}
				resp.Body.Close()

				status := "healthy"
				if resp.StatusCode >= 400 {
					status = "unhealthy"
				}
				results[c.name] = healthResult{
					Status:  status,
					Latency: latency,
				}
			}()
		}

		wg.Wait()

		overallStatus := "healthy"
		for _, res := range results {
			if res.Status == "unhealthy" {
				overallStatus = "degraded"
				break
			}
		}

		writeJSON(w, http.StatusOK, metricsResponse{
			Status:    overallStatus,
			Services:  results,
			Timestamp: time.Now().UTC(),
		})
	}
}
