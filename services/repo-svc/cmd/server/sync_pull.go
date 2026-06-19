//go:build cloud
// +build cloud

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"

	"github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/handler"
)

// syncPullConfig serves the CLI `gal sync --pull` command
// (POST /config-repo/sync/pull). It returns the org's published approved
// config so the CLI can write it to ~/.gal/config.yaml.
//
// The approved config is owned by governance-svc. Rather than read
// governance's Firestore collection directly (which would couple repo-svc to
// governance's internal data model and is blocked by Go's internal-package
// rules), repo-svc fetches it over HTTP, mirroring the existing gal-rag
// integration. The data source is isolated in fetchApprovedConfig so a
// reviewer can swap it (e.g. for a direct shared-store read) without changing
// the handler logic.
//
// Org is taken from the JWT context (auth.OrgID), not the request body — the
// caller can only pull config for the org their token authorizes. Platform is
// read from the ?platform= query param (default "claude"), matching the CLI
// and governance-svc's own /approved-config handler.
func (s *repoService) syncPullConfig(w http.ResponseWriter, r *http.Request) {
	orgID := auth.OrgID(r.Context())
	if orgID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing org", "UNAUTHORIZED")
		return
	}

	platform := r.URL.Query().Get("platform")
	if platform == "" {
		platform = "claude"
	}

	if s.governanceURL == "" {
		handler.RespondError(w, http.StatusServiceUnavailable,
			"governance service not configured", "GOVERNANCE_UNAVAILABLE")
		return
	}

	cfg, status, err := s.fetchApprovedConfig(
		r.Context(), r.Header.Get("Authorization"), orgID, platform)
	if err != nil {
		if status == http.StatusNotFound {
			handler.RespondError(w, http.StatusNotFound,
				"no approved config published for org", "NOT_FOUND")
			return
		}
		s.log.Error("sync pull: fetch approved config",
			"org", orgID, "platform", platform, "status", status, "error", err)
		handler.RespondError(w, http.StatusBadGateway,
			"failed to fetch approved config from governance", "GOVERNANCE_ERROR")
		return
	}

	// governance-svc returns {orgId, platform, config: null} (HTTP 200) when no
	// config has been published yet — surface that to the CLI as a 404 so it
	// doesn't write an empty config file.
	if v, ok := cfg["config"]; ok && v == nil {
		handler.RespondError(w, http.StatusNotFound,
			"no approved config published for org", "NOT_FOUND")
		return
	}

	handler.RespondJSON(w, http.StatusOK, cfg)
}

// fetchApprovedConfig retrieves the published approved config for an org and
// platform from governance-svc over HTTP, forwarding the caller's bearer token
// so governance authorizes the request against the same identity. It returns
// the decoded JSON object and the upstream HTTP status (so the handler can map
// a governance 404 to a client 404).
func (s *repoService) fetchApprovedConfig(
	ctx context.Context, authz, org, platform string,
) (map[string]any, int, error) {
	endpoint := fmt.Sprintf("%s/approved-config?org=%s&platform=%s",
		strings.TrimRight(s.governanceURL, "/"),
		url.QueryEscape(org), url.QueryEscape(platform))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("build governance request: %w", err)
	}
	if authz != "" {
		req.Header.Set("Authorization", authz)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("call governance: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read governance response: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, resp.StatusCode, fmt.Errorf("governance returned %d", resp.StatusCode)
	}

	var cfg map[string]any
	if err := json.Unmarshal(body, &cfg); err != nil {
		return nil, resp.StatusCode, fmt.Errorf("decode governance response: %w", err)
	}
	return cfg, resp.StatusCode, nil
}
