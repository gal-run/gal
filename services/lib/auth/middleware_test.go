package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/jwtauth/v5"
)

// testJWTAuth returns an HMAC JWTAuth for tests (same shape as the per-service tests).
func testJWTAuth() *jwtauth.JWTAuth {
	return jwtauth.New("HS256", []byte("test-secret"), nil)
}

// TestMiddleware_ExtractsCustomClaims locks the claim-extraction contract that the
// jwx v2->v3 migration changed: the middleware must still pull the Firebase custom
// claims user_id / org_id / email out of the token (now via jwtauth.FromContext's
// claims map instead of the removed jwx-v2 token.PrivateClaims()).
func TestMiddleware_ExtractsCustomClaims(t *testing.T) {
	ja := testJWTAuth()
	_, tokenStr, err := ja.Encode(map[string]interface{}{
		"user_id": "user-123",
		"org_id":  "org-456",
		"email":   "alice@example.com",
	})
	if err != nil {
		t.Fatalf("encode token: %v", err)
	}

	var gotUser, gotOrg, gotEmail string
	handler := jwtauth.Verifier(ja)(jwtauth.Authenticator(ja)(Middleware(ja)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotUser = UserID(r.Context())
			gotOrg = OrgID(r.Context())
			gotEmail = UserEmail(r.Context())
			w.WriteHeader(http.StatusOK)
		}),
	)))

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if gotUser != "user-123" {
		t.Errorf("user_id = %q, want %q", gotUser, "user-123")
	}
	if gotOrg != "org-456" {
		t.Errorf("org_id = %q, want %q", gotOrg, "org-456")
	}
	if gotEmail != "alice@example.com" {
		t.Errorf("email = %q, want %q", gotEmail, "alice@example.com")
	}
}

// TestMiddleware_RejectsMissingToken locks the fail-closed path: no token -> 401.
func TestMiddleware_RejectsMissingToken(t *testing.T) {
	ja := testJWTAuth()
	called := false
	handler := jwtauth.Verifier(ja)(Middleware(ja)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		}),
	))

	req := httptest.NewRequest(http.MethodGet, "/", nil) // no Authorization header
	rr := httptest.NewRecorder()
	handler.ServeHTTP(rr, req)

	if called {
		t.Fatal("downstream handler ran for a request with no token (auth bypass)")
	}
	if rr.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want 401", rr.Code)
	}
}
