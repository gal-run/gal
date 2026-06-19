//go:build cloud
// +build cloud

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/golang-jwt/jwt/v5"

	"github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/handler"
)

func TestTeamHealthEndpoint(t *testing.T) {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "team-svc"})
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

func TestTeamAuthEndpointReturns401(t *testing.T) {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Group(func(r chi.Router) {
		r.Use(jwtClaimsMiddleware)

		r.Get("/teams", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
	})

	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/teams")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestTeamProtectedEndpointWithValidJWT(t *testing.T) {
	// team-svc uses a custom jwtClaimsMiddleware that doesn't verify signatures.
	// It uses jwt.WithoutClaimsValidation(), so any properly structured JWT works.
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Group(func(r chi.Router) {
		r.Use(jwtClaimsMiddleware)

		r.Post("/teams", func(w http.ResponseWriter, r *http.Request) {
			userID := auth.UserID(r.Context())
			orgID := auth.OrgID(r.Context())
			if orgID == "" {
				handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
				return
			}
			handler.RespondJSON(w, http.StatusCreated, map[string]interface{}{
				"user_id": userID,
				"org_id":  orgID,
			})
		})
	})

	// Create an unsigned JWT with claims (signature not required by team-svc middleware).
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"user_id": "team-user",
		"org_id":  "team-org",
	})
	tokenStr, err := token.SignedString([]byte("any-key"))
	if err != nil {
		t.Fatal(err)
	}

	ts := httptest.NewServer(r)
	defer ts.Close()

	body := strings.NewReader(`{"name":"test-team"}`)
	req, err := http.NewRequest("POST", ts.URL+"/teams", body)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		t.Errorf("expected 201, got %d", resp.StatusCode)
	}

	var respBody map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&respBody); err != nil {
		t.Fatal(err)
	}
	if respBody["org_id"] != "team-org" {
		t.Errorf("expected org_id team-org, got %v", respBody["org_id"])
	}
}
