//go:build cloud
// +build cloud

package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"

	"github.com/gal-run/gal/services/mcp-gateway/internal/handler"
)

func testMCPJWTAuth() *jwtauth.JWTAuth {
	return jwtauth.New("HS256", []byte("test-secret"), nil)
}

func generateMCPTestToken(t *testing.T) string {
	t.Helper()
	_, token, err := testMCPJWTAuth().Encode(map[string]interface{}{
		"user_id": "mcp-user",
		"org_id":  "mcp-org",
	})
	if err != nil {
		t.Fatalf("failed to generate test token: %v", err)
	}
	return token
}

func newTestGatewayService() *handler.GatewayService {
	ja := testMCPJWTAuth()
	return &handler.GatewayService{
		Store:     nil, // Store-dependent handlers will panic; only test store-free routes.
		Log:       slog.New(slog.NewJSONHandler(os.Stdout, nil)),
		JA:        ja,
		StartTime: time.Now(),
		Version:   "test",
	}
}

func TestMCPGatewayHealthEndpoint(t *testing.T) {
	svc := newTestGatewayService()
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Get("/health", svc.HandleHealth)

	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/health")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	var body map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["status"] != "ok" {
		t.Errorf("expected status ok, got %s", body["status"])
	}
}

func TestMCPGatewayWellKnownOAuth(t *testing.T) {
	svc := newTestGatewayService()
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Get("/.well-known/oauth-authorization-server", svc.HandleWellKnownOAuth)

	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/.well-known/oauth-authorization-server")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["issuer"] == nil {
		t.Error("expected issuer in response")
	}
	if body["authorization_endpoint"] == nil {
		t.Error("expected authorization_endpoint in response")
	}
}

func TestMCPGatewayPostMCPNoAuthReturns401(t *testing.T) {
	svc := newTestGatewayService()
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	// POST /mcp requires MCP OAuth bearer token (validated in handler before store access).
	r.Post("/mcp", svc.HandleMCP)

	ts := httptest.NewServer(r)
	defer ts.Close()

	jsonBody := `{"jsonrpc":"2.0","method":"tools/list","id":1}`
	req, err := http.NewRequest("POST", ts.URL+"/mcp", strings.NewReader(jsonBody))
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	// Without a Bearer token, HandleMCP should return 401 before accessing the store.
	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}

	// Verify the response is an MCP JSON-RPC error response.
	var mcpResp map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&mcpResp); err != nil {
		t.Fatal(err)
	}
	if mcpResp["jsonrpc"] != "2.0" {
		t.Error("expected jsonrpc 2.0")
	}
	if mcpResp["error"] == nil {
		t.Error("expected error in MCP response")
	}
}

func TestMCPGatewayFeaturesWithValidJWT(t *testing.T) {
	ja := testMCPJWTAuth()
	token := generateMCPTestToken(t)
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	// JWT-protected features route (same auth pattern as mcp-gateway).
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))

		r.Get("/features", func(w http.ResponseWriter, r *http.Request) {
			_, claims, err := jwtauth.FromContext(r.Context())
			if err != nil || claims == nil {
				http.Error(w, "no claims", http.StatusUnauthorized)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			json.NewEncoder(w).Encode(map[string]interface{}{
				"user_id": claims["user_id"],
				"org_id":  claims["org_id"],
				"features": []string{},
			})
		})
	})

	ts := httptest.NewServer(r)
	defer ts.Close()

	req, err := http.NewRequest("GET", ts.URL+"/features", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("expected 200, got %d", resp.StatusCode)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["user_id"] != "mcp-user" {
		t.Errorf("expected user_id mcp-user, got %v", body["user_id"])
	}
	if body["org_id"] != "mcp-org" {
		t.Errorf("expected org_id mcp-org, got %v", body["org_id"])
	}
}
