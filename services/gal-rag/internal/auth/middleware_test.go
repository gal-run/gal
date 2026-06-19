package auth

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/jwtauth/v5"
	"github.com/gal-run/gal/services/lib/auth"
)

func TestEnforceOrgIDAllowsMatch(t *testing.T) {
	ja := jwtauth.New("HS256", []byte("test-secret"), nil)
	_, tokenStr, _ := ja.Encode(map[string]any{"user_id": "u1", "org_id": "sched-sys"})
	body, _ := json.Marshal(map[string]any{
		"query":  "hi",
		"filter": map[string]any{"orgId": "sched-sys"},
	})
	req := httptest.NewRequest(http.MethodPost, "/rag/search", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	h := jwtauth.Verifier(ja)(jwtauth.Authenticator(ja)(auth.Middleware(ja)(EnforceOrgID(slog.Default())(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})))))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
}

func TestEnforceOrgIDRejectsOverride(t *testing.T) {
	ja := jwtauth.New("HS256", []byte("test-secret"), nil)
	_, tokenStr, _ := ja.Encode(map[string]any{"user_id": "u1", "org_id": "sched-sys"})
	body, _ := json.Marshal(map[string]any{
		"query":  "hi",
		"filter": map[string]any{"orgId": "evil-org"},
	})
	req := httptest.NewRequest(http.MethodPost, "/rag/search", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	called := false
	h := jwtauth.Verifier(ja)(jwtauth.Authenticator(ja)(auth.Middleware(ja)(EnforceOrgID(slog.Default())(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
	})))))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if called {
		t.Error("handler should not be called when orgId mismatches")
	}
	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403; body=%s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "RAG_FILTER_FORBIDDEN") {
		t.Errorf("body = %q, want RAG_FILTER_FORBIDDEN code", rec.Body.String())
	}
}

func TestEnforceOrgIDNoBody(t *testing.T) {
	ja := jwtauth.New("HS256", []byte("test-secret"), nil)
	_, tokenStr, _ := ja.Encode(map[string]any{"user_id": "u1", "org_id": "sched-sys"})
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	req.Header.Set("Authorization", "Bearer "+tokenStr)
	called := false
	h := jwtauth.Verifier(ja)(jwtauth.Authenticator(ja)(auth.Middleware(ja)(EnforceOrgID(slog.Default())(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})))))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if !called {
		t.Error("handler not called")
	}
	if rec.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", rec.Code)
	}
}
