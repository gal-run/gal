package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"
)

// TestProxyChain validates the full request flow: client -> gateway -> downstream -> response.
func TestProxyChain(t *testing.T) {
	// Spin up a fake downstream service.
	downstream := httptest.NewServer(downstreamHandler())
	defer downstream.Close()

	// Set env vars BEFORE resolving URLs (resolveServiceURLs reads at call time).
	os.Setenv("JWT_SECRET", "test-secret")
	os.Setenv("AUTH_SVC_URL", downstream.URL)
	os.Setenv("REPO_SVC_URL", downstream.URL)
	os.Setenv("GOVERNANCE_SVC_URL", downstream.URL)
	os.Setenv("DISPATCH_SVC_URL", downstream.URL)
	os.Setenv("SDLC_SVC_URL", downstream.URL)
	os.Setenv("TELEMETRY_SVC_URL", downstream.URL)
	os.Setenv("TEAM_SVC_URL", downstream.URL)
	os.Setenv("MAL_SVC_URL", downstream.URL)
	defer os.Unsetenv("JWT_SECRET")

	svc := resolveServiceURLs()
	ja := jwtauth.New("HS256", []byte("test-secret"), nil)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Timeout(10 * time.Second))

	r.Get("/health", healthHandler)

	// Public webhook endpoints. (OSS: the Stripe/billing webhook lives in the
	// proprietary gal-cloud control plane; the GitHub webhook is the OSS
	// public, signature-verified webhook surface.)
	r.Post("/webhooks/github", proxyTo("repo-svc", svc.repo))

	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))

		r.Route("/auth", func(r chi.Router) { mountProxy(r, "auth-svc", svc.auth) })
		r.Route("/sessions", func(r chi.Router) { mountProxy(r, "dispatch-svc", svc.dispatch) })
		r.Route("/repos", func(r chi.Router) { mountProxy(r, "repo-svc", svc.repo) })
	})

	gateway := httptest.NewServer(r)
	defer gateway.Close()

	// Generate a test JWT.
	_, tokenStr, _ := ja.Encode(map[string]any{
		"user_id": "test-user",
		"org_id":  "test-org",
		"email":   "test@gal.run",
	})

	t.Run("health endpoint", func(t *testing.T) {
		body, status := doReq(t, http.MethodGet, gateway.URL+"/health", "")
		if status != 200 {
			t.Fatalf("expected 200, got %d: %s", status, body)
		}
		var m map[string]string
		json.Unmarshal(body, &m)
		if m["status"] != "ok" {
			t.Fatalf("expected ok, got %q", body)
		}
	})

	t.Run("proxy GET with valid JWT", func(t *testing.T) {
		body, status := doReq(t, http.MethodGet, gateway.URL+"/auth/login", tokenStr)
		if status != 200 {
			t.Fatalf("expected 200, got %d: %s", status, body)
		}
		var m map[string]string
		json.Unmarshal(body, &m)
		if m["handler"] != "auth/login" {
			t.Fatalf("expected downstream handler 'login', got %q", body)
		}
	})

	t.Run("proxy POST with valid JWT", func(t *testing.T) {
		body, status := doReq(t, http.MethodPost, gateway.URL+"/sessions", tokenStr)
		if status != 200 {
			t.Fatalf("expected 200, got %d: %s", status, body)
		}
		var m map[string]string
		json.Unmarshal(body, &m)
		if m["method"] != "POST" {
			t.Fatalf("expected POST forwarded, got %q", body)
		}
	})

	t.Run("proxy without JWT returns 401", func(t *testing.T) {
		_, status := doReq(t, http.MethodGet, gateway.URL+"/repos/list", "")
		if status != 401 {
			t.Fatalf("expected 401, got %d", status)
		}
	})

	t.Run("webhook without JWT is forwarded", func(t *testing.T) {
		body, status := doReq(t, http.MethodPost, gateway.URL+"/webhooks/github", "")
		if status != 200 {
			t.Fatalf("expected 200, got %d: %s", status, body)
		}
		var m map[string]string
		json.Unmarshal(body, &m)
		if m["handler"] != "webhooks/github" {
			t.Fatalf("expected webhooks/github handler, got %q", body)
		}
	})

	t.Run("502 when downstream unreachable", func(t *testing.T) {
		// Point to a dead port.
		os.Setenv("REPO_SVC_URL", "http://127.0.0.1:19999")
		deadSvc := resolveServiceURLs()
		// Re-register a repo route with the dead URL.
		r.Group(func(r chi.Router) {
			r.Use(jwtauth.Verifier(ja))
			r.Use(jwtauth.Authenticator(ja))
			r.Route("/repos-dead", func(r chi.Router) { mountProxy(r, "repo-svc", deadSvc.repo) })
		})

		body, status := doReq(t, http.MethodGet, gateway.URL+"/repos-dead/subscription", tokenStr)
		if status != 502 {
			t.Fatalf("expected 502, got %d: %s", status, body)
		}
		var apiErr map[string]string
		json.Unmarshal(body, &apiErr)
		if apiErr["code"] != "BAD_GATEWAY" {
			t.Fatalf("expected BAD_GATEWAY, got %q", body)
		}
	})

	t.Run("JWT propagated to downstream", func(t *testing.T) {
		body, status := doReq(t, http.MethodGet, gateway.URL+"/auth/login", tokenStr)
		if status != 200 {
			t.Fatalf("expected 200, got %d: %s", status, body)
		}
		var m map[string]string
		json.Unmarshal(body, &m)
		if !strings.Contains(m["authorization"], "Bearer ") {
			t.Fatalf("expected Bearer token propagated, got %q", body)
		}
	})
}

// downstreamHandler returns a chi router that echoes back request info for testing.
func downstreamHandler() http.Handler {
	r := chi.NewRouter()

	r.HandleFunc("/*", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"handler":       strings.TrimPrefix(r.URL.Path, "/"),
			"method":        r.Method,
			"authorization": r.Header.Get("Authorization"),
		})
	})

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	return r
}

// doReq makes an HTTP request and returns the response body and status code.
func doReq(t *testing.T, method, url, token string) ([]byte, int) {
	t.Helper()
	req, err := http.NewRequest(method, url, strings.NewReader(`{"test":"data"}`))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do request: %v", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	_ = fmt.Sprintf
	return body, resp.StatusCode
}
