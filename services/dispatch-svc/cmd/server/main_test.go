//go:build cloud
// +build cloud

package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"

	"github.com/gal-run/gal/services/lib/handler"
)

func testDispatchJWTAuth() *jwtauth.JWTAuth {
	return jwtauth.New("HS256", []byte("test-secret"), nil)
}

func generateDispatchTestToken(t *testing.T) string {
	t.Helper()
	_, token, err := testDispatchJWTAuth().Encode(map[string]interface{}{
		"user_id": "dispatch-user",
		"org_id":  "dispatch-org",
	})
	if err != nil {
		t.Fatalf("failed to generate test token: %v", err)
	}
	return token
}

func TestDispatchHealthEndpoint(t *testing.T) {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok"}`))
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

func TestDispatchAuthEndpointReturns401(t *testing.T) {
	ja := testDispatchJWTAuth()
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))

		r.Get("/sessions", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
	})

	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/sessions")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestDispatchProtectedEndpointWithValidJWT(t *testing.T) {
	ja := testDispatchJWTAuth()
	token := generateDispatchTestToken(t)
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))

		r.Post("/sessions", func(w http.ResponseWriter, r *http.Request) {
			_, claims, err := jwtauth.FromContext(r.Context())
			if err != nil || claims == nil {
				http.Error(w, "no claims", http.StatusUnauthorized)
				return
			}
			handler.RespondJSON(w, http.StatusCreated, map[string]interface{}{
				"user_id": claims["user_id"],
				"org_id":  claims["org_id"],
				"status":  "created",
			})
		})
	})

	ts := httptest.NewServer(r)
	defer ts.Close()

	payload := bytes.NewReader([]byte(`{"agentType":"claude"}`))
	req, err := http.NewRequest("POST", ts.URL+"/sessions", payload)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got %d", resp.StatusCode)
	}

	var body map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body["user_id"] != "dispatch-user" {
		t.Errorf("expected user_id dispatch-user, got %v", body["user_id"])
	}
	if body["org_id"] != "dispatch-org" {
		t.Errorf("expected org_id dispatch-org, got %v", body["org_id"])
	}
}
