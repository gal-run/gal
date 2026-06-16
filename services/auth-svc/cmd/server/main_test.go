//go:build cloud
// +build cloud

package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"
	"github.com/golang-jwt/jwt/v5"

	"github.com/gal-run/gal/services/lib/handler"
)

func testAuthJWTAuth() *jwtauth.JWTAuth {
	return jwtauth.New("HS256", []byte("test-secret"), nil)
}

func generateAuthTestToken(t *testing.T) string {
	t.Helper()
	_, token, err := testAuthJWTAuth().Encode(map[string]interface{}{
		"user_id": "auth-user",
		"org_id":  "auth-org",
	})
	if err != nil {
		t.Fatalf("failed to generate test token: %v", err)
	}
	return token
}

func TestAuthHealthEndpoint(t *testing.T) {
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		handler.RespondJSON(w, http.StatusOK, map[string]string{
			"status":  "ok",
			"service": "auth-svc",
		})
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

func TestAuthProtectedEndpointReturns401(t *testing.T) {
	ja := testAuthJWTAuth()
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))

		r.Get("/users/me", func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(http.StatusOK)
		})
	})

	ts := httptest.NewServer(r)
	defer ts.Close()

	resp, err := http.Get(ts.URL + "/users/me")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", resp.StatusCode)
	}
}

func TestAuthProtectedEndpointWithValidJWT(t *testing.T) {
	ja := testAuthJWTAuth()
	token := generateAuthTestToken(t)
	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)

	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))

		r.Get("/users/me", func(w http.ResponseWriter, r *http.Request) {
			_, claims, err := jwtauth.FromContext(r.Context())
			if err != nil || claims == nil {
				http.Error(w, "no claims", http.StatusUnauthorized)
				return
			}
			handler.RespondJSON(w, http.StatusOK, map[string]interface{}{
				"user_id": claims["user_id"],
				"org_id":  claims["org_id"],
			})
		})
	})

	ts := httptest.NewServer(r)
	defer ts.Close()

	req, err := http.NewRequest("GET", ts.URL+"/users/me", nil)
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
	if body["user_id"] != "auth-user" {
		t.Errorf("expected user_id auth-user, got %v", body["user_id"])
	}
	if body["org_id"] != "auth-org" {
		t.Errorf("expected org_id auth-org, got %v", body["org_id"])
	}
}

// signGALSessionJWT mints an HS256 JWT mirroring how gal-api / auth-svc sign the
// gal_session cookie, for testing userIDFromGALSessionJWT.
func signGALSessionJWT(t *testing.T, secret string, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := tok.SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign test gal_session JWT: %v", err)
	}
	return s
}

// TestUserIDFromGALSessionJWT verifies that auth-svc accepts the dashboard's
// gal-api-issued session cookie (issuer gal-run-api/gal-api, HS256, shared
// secret) and rejects tampered, wrong-issuer, and expired tokens. This is the
// regression guard for the /organizations 401 caused by treating the cookie as
// a Firebase ID token.
func TestUserIDFromGALSessionJWT(t *testing.T) {
	const secret = "test-secret"
	s := &authService{jwtSecret: secret}
	now := time.Now()

	cases := []struct {
		name   string
		secret string
		claims jwt.MapClaims
		wantID string
	}{
		{
			name:   "gal-api issued session (gal-run-api issuer, userId claim)",
			secret: secret,
			claims: jwt.MapClaims{"iss": "gal-run-api", "userId": "github:48866801", "exp": now.Add(time.Hour).Unix()},
			wantID: "github:48866801",
		},
		{
			name:   "legacy gal-api issuer alias",
			secret: secret,
			claims: jwt.MapClaims{"iss": "gal-api", "userId": "github:1", "exp": now.Add(time.Hour).Unix()},
			wantID: "github:1",
		},
		{
			name:   "auth-svc issued (user_id claim)",
			secret: secret,
			claims: jwt.MapClaims{"iss": sessionIssuer, "user_id": "u-42", "exp": now.Add(time.Hour).Unix()},
			wantID: "u-42",
		},
		{
			name:   "sub fallback",
			secret: secret,
			claims: jwt.MapClaims{"iss": "gal-run-api", "sub": "u-sub", "exp": now.Add(time.Hour).Unix()},
			wantID: "u-sub",
		},
		{
			name:   "wrong signing secret rejected",
			secret: "attacker-secret",
			claims: jwt.MapClaims{"iss": "gal-run-api", "userId": "github:1", "exp": now.Add(time.Hour).Unix()},
			wantID: "",
		},
		{
			name:   "unknown issuer rejected",
			secret: secret,
			claims: jwt.MapClaims{"iss": "evil-issuer", "userId": "github:1", "exp": now.Add(time.Hour).Unix()},
			wantID: "",
		},
		{
			name:   "expired token rejected",
			secret: secret,
			claims: jwt.MapClaims{"iss": "gal-run-api", "userId": "github:1", "exp": now.Add(-time.Hour).Unix()},
			wantID: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			tok := signGALSessionJWT(t, tc.secret, tc.claims)
			if got := s.userIDFromGALSessionJWT(tok); got != tc.wantID {
				t.Errorf("userIDFromGALSessionJWT = %q, want %q", got, tc.wantID)
			}
		})
	}

	if got := s.userIDFromGALSessionJWT("not-a-jwt"); got != "" {
		t.Errorf("garbage token: got %q, want empty", got)
	}
}

// TestOrgNamesFromGALSessionCookie verifies that org names are extracted from a
// validated gal_session cookie (browser clients send no Authorization header).
// Regression guard for /organizations returning 200 with an empty list.
func TestOrgNamesFromGALSessionCookie(t *testing.T) {
	const secret = "test-secret"
	s := &authService{jwtSecret: secret}
	now := time.Now()

	token := signGALSessionJWT(t, secret, jwt.MapClaims{
		"iss":           "gal-run-api",
		"userId":        "github:48866801",
		"organizations": []string{"Scheduler-Systems", "StratusCloudLabs", "gal-run"},
		"exp":           now.Add(time.Hour).Unix(),
	})

	claims := s.validateGALSessionJWT(token)
	if claims == nil {
		t.Fatal("validateGALSessionJWT returned nil for a valid token")
	}
	got := orgNamesFromClaims(map[string]any(claims))
	want := []string{"Scheduler-Systems", "StratusCloudLabs", "gal-run"}
	if len(got) != len(want) {
		t.Fatalf("org names = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("org[%d] = %q, want %q", i, got[i], want[i])
		}
	}

	// A tampered (wrong-secret) cookie must yield no claims and no orgs.
	bad := signGALSessionJWT(t, "attacker", jwt.MapClaims{
		"iss": "gal-run-api", "userId": "x", "organizations": []string{"Evil"},
		"exp": now.Add(time.Hour).Unix(),
	})
	if s.validateGALSessionJWT(bad) != nil {
		t.Error("validateGALSessionJWT accepted a wrong-secret token")
	}
}
