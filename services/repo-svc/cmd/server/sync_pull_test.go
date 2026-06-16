//go:build cloud
// +build cloud

package main

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gal-run/gal/services/lib/auth"
)

// newSyncPullTestService builds a repoService wired to a stub governance
// server. The stub asserts the forwarded auth header and returns the supplied
// status + body.
func newSyncPullTestService(t *testing.T, govStatus int, govBody string, wantAuth string) (*repoService, *httptest.Server) {
	t.Helper()
	gov := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/approved-config" {
			t.Errorf("governance called with path %q, want /approved-config", r.URL.Path)
		}
		if got := r.URL.Query().Get("platform"); got == "" {
			t.Errorf("governance called without platform query")
		}
		if wantAuth != "" && r.Header.Get("Authorization") != wantAuth {
			t.Errorf("auth not forwarded: got %q want %q", r.Header.Get("Authorization"), wantAuth)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(govStatus)
		_, _ = w.Write([]byte(govBody))
	}))
	t.Cleanup(gov.Close)

	svc := &repoService{
		log:           slog.Default(),
		governanceURL: gov.URL,
		httpClient:    gov.Client(),
	}
	return svc, gov
}

func doSyncPull(svc *repoService, org, authz string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/config-repo/sync/pull?platform=claude", nil)
	if authz != "" {
		req.Header.Set("Authorization", authz)
	}
	if org != "" {
		req = req.WithContext(auth.SetOrgID(req.Context(), org))
	}
	rec := httptest.NewRecorder()
	svc.syncPullConfig(rec, req)
	return rec
}

func TestSyncPull_HappyPath(t *testing.T) {
	body := `{"platform":"claude","hash":"abc","version":"3","approved_at":"2026-06-03","approved_by":"karabil"}`
	svc, _ := newSyncPullTestService(t, http.StatusOK, body, "Bearer tok123")

	rec := doSyncPull(svc, "ZenuxLabs", "Bearer tok123")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatalf("response not JSON: %v", err)
	}
	if got["hash"] != "abc" || got["version"] != "3" {
		t.Errorf("config not passed through: %v", got)
	}
}

func TestSyncPull_MissingOrgReturns401(t *testing.T) {
	svc, _ := newSyncPullTestService(t, http.StatusOK, `{}`, "")
	rec := doSyncPull(svc, "", "Bearer x")
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", rec.Code)
	}
}

func TestSyncPull_GovernanceNotConfiguredReturns503(t *testing.T) {
	svc := &repoService{log: slog.Default(), httpClient: http.DefaultClient} // no governanceURL
	rec := doSyncPull(svc, "ZenuxLabs", "Bearer x")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
}

func TestSyncPull_NoPublishedConfigReturns404(t *testing.T) {
	// governance returns 200 with config:null when nothing is published.
	body := `{"orgId":"ZenuxLabs","platform":"claude","config":null}`
	svc, _ := newSyncPullTestService(t, http.StatusOK, body, "")
	rec := doSyncPull(svc, "ZenuxLabs", "Bearer x")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404; body=%s", rec.Code, rec.Body.String())
	}
}

func TestSyncPull_Governance404Returns404(t *testing.T) {
	svc, _ := newSyncPullTestService(t, http.StatusNotFound, `{"error":"not found"}`, "")
	rec := doSyncPull(svc, "ZenuxLabs", "Bearer x")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestSyncPull_GovernanceErrorReturns502(t *testing.T) {
	svc, _ := newSyncPullTestService(t, http.StatusInternalServerError, `{"error":"boom"}`, "")
	rec := doSyncPull(svc, "ZenuxLabs", "Bearer x")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502", rec.Code)
	}
}
