//go:build cloud
// +build cloud

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"

	"github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/handler"
)

func testSDLCJWTAuth() *jwtauth.JWTAuth {
	return jwtauth.New("HS256", []byte("test-secret"), nil)
}

func generateSDLCTestToken(t *testing.T) string {
	t.Helper()
	_, token, err := testSDLCJWTAuth().Encode(map[string]interface{}{
		"user_id": "sdlc-user",
		"org_id":  "sdlc-org",
	})
	if err != nil {
		t.Fatalf("failed to generate test token: %v", err)
	}
	return token
}

func TestSDLCHealthEndpoint(t *testing.T) {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

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

func TestSDLCAuthEndpointReturns401(t *testing.T) {
	ja := testSDLCJWTAuth()
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(auth.Middleware(ja))

		r.Get("/sdlc/status/123", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
	})

	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/sdlc/status/123")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestSDLCProtectedEndpointWithValidJWT(t *testing.T) {
	ja := testSDLCJWTAuth()
	token := generateSDLCTestToken(t)
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(auth.Middleware(ja))

		// ListTemplates does not require Firestore access (returns static data).
		r.Get("/sdlc/templates", func(w http.ResponseWriter, r *http.Request) {
			userID := auth.UserID(r.Context())
			orgID := auth.OrgID(r.Context())
			if userID == "" || orgID == "" {
				http.Error(w, "missing claims", http.StatusUnauthorized)
				return
			}
			handler.RespondJSON(w, http.StatusOK, map[string]interface{}{
				"templates": []map[string]string{
					{"id": "default", "name": "Default SDLC Template"},
				},
				"user_id": userID,
				"org_id":  orgID,
			})
		})
	})

	ts := httptest.NewServer(r)
	defer ts.Close()

	req, err := http.NewRequest("GET", ts.URL+"/sdlc/templates", nil)
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
	if body["user_id"] != "sdlc-user" {
		t.Errorf("expected user_id sdlc-user, got %v", body["user_id"])
	}
	if body["org_id"] != "sdlc-org" {
		t.Errorf("expected org_id sdlc-org, got %v", body["org_id"])
	}
}
