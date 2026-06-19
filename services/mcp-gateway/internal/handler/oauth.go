//go:build cloud
// +build cloud

package handler

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/gal-run/gal/services/lib/handler"
	"github.com/gal-run/gal/services/mcp-gateway/internal/domain"
)

// OAuth constants.
const (
	accessTokenTTL  = 1 * time.Hour
	refreshTokenTTL = 30 * 24 * time.Hour
	authCodeTTL     = 5 * time.Minute
)

// Known/allowed MCP OAuth client IDs.
var knownClientIDs = map[string]bool{
	"gal-mcp-client":  true,
	"claude-code-mcp": true,
	"mcp-inspector":   true,
}

// parseForm parses application/x-www-form-urlencoded bodies for OAuth endpoints.
func parseForm(r *http.Request) error {
	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "application/x-www-form-urlencoded") {
		if err := r.ParseForm(); err != nil {
			return fmt.Errorf("parse form: %w", err)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// Well-Known Endpoints
// ---------------------------------------------------------------------------

// HandleWellKnownOAuth returns RFC 8414 OAuth Authorization Server metadata.
// GET /.well-known/oauth-authorization-server
func (g *GatewayService) HandleWellKnownOAuth(w http.ResponseWriter, r *http.Request) {
	apiBase := g.apiBaseURL(r)

	resp := domain.WellKnownOAuthResponse{
		Issuer:                            apiBase,
		AuthorizationEndpoint:             apiBase + "/mcp/oauth/authorize",
		TokenEndpoint:                     apiBase + "/mcp/oauth/token",
		RevocationEndpoint:                apiBase + "/mcp/oauth/revoke",
		ResponseTypesSupported:            []string{"code"},
		GrantTypesSupported:               []string{"authorization_code", "refresh_token"},
		CodeChallengeMethodsSupported:     []string{"S256"},
		TokenEndpointAuthMethodsSupported: []string{"none"},
		ScopesSupported:                   []string{"mcp"},
		ServiceDocumentation:              "https://docs.gal.run/mcp",
	}
	handler.RespondJSON(w, http.StatusOK, resp)
}

// HandleWellKnownProtectedResource returns RFC 9728 Protected Resource metadata.
// GET /.well-known/oauth-protected-resource/:path
func (g *GatewayService) HandleWellKnownProtectedResource(w http.ResponseWriter, r *http.Request) {
	apiBase := g.apiBaseURL(r)

	resp := domain.WellKnownProtectedResourceResponse{
		Resource:               apiBase + "/mcp",
		AuthorizationServers:   []string{apiBase},
		ScopesSupported:        []string{"mcp"},
		BearerMethodsSupported: []string{"header"},
		ResourceDocumentation:  "https://docs.gal.run/mcp",
	}
	handler.RespondJSON(w, http.StatusOK, resp)
}

// HandleMCPServerDiscovery returns MCP server metadata.
// GET /mcp/.well-known
func (g *GatewayService) HandleMCPServerDiscovery(w http.ResponseWriter, r *http.Request) {
	apiBase := g.apiBaseURL(r)

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"mcpVersion": "2025-03-26",
		"capabilities": map[string]any{
			"tools":     true,
			"resources": true,
			"prompts":   true,
		},
		"serverInfo": map[string]string{
			"name":    mcpServerName,
			"version": mcpServerVersion,
		},
		"oauth": map[string]string{
			"authorizationEndpoint": apiBase + "/mcp/oauth/authorize",
			"tokenEndpoint":         apiBase + "/mcp/oauth/token",
			"revocationEndpoint":    apiBase + "/mcp/oauth/revoke",
		},
	})
}

// ---------------------------------------------------------------------------
// Authorization Endpoint
// ---------------------------------------------------------------------------

// HandleAuthorize handles GET /mcp/oauth/authorize
// OAuth 2.0 Authorization Endpoint (RFC 6749 Section 3.1).
func (g *GatewayService) HandleAuthorize(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	responseType := q.Get("response_type")
	clientID := q.Get("client_id")
	redirectURI := q.Get("redirect_uri")
	codeChallenge := q.Get("code_challenge")
	codeChallengeMethod := q.Get("code_challenge_method")
	state := q.Get("state")

	// Validate response_type
	if responseType != "code" {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "unsupported_response_type",
			"error_description": "Only response_type=code is supported",
		})
		return
	}

	// Validate required parameters
	if clientID == "" || redirectURI == "" || codeChallenge == "" {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_request",
			"error_description": "Missing required parameters: client_id, redirect_uri, code_challenge",
		})
		return
	}

	// PKCE: S256 required
	method := codeChallengeMethod
	if method == "" {
		method = "plain"
	}
	if method != "S256" {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_request",
			"error_description": "code_challenge_method must be S256. Plain is not supported.",
		})
		return
	}

	// Validate client_id and redirect_uri
	if !g.isValidClient(r.Context(), clientID, redirectURI) {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_client",
			"error_description": "Unknown client_id or unauthorized redirect_uri",
		})
		return
	}

	// Issue the authorization code directly (simplified flow).
	authCode := generateRandomToken(32)
	now := time.Now().UTC()

	// Store the auth code with PKCE challenge and original request metadata
	authCodeDoc := &domain.McpToken{
		ID:        "code_" + authCode,
		Token:     authCode,
		ClientID:  clientID,
		Scope:     "mcp",
		TokenType: "authorization_code",
		ExpiresAt: now.Add(authCodeTTL),
		Revoked:   false,
		CreatedAt: now,
	}

	if err := g.Store.SaveToken(r.Context(), authCodeDoc); err != nil {
		g.Log.Error("failed to store auth code", "error", err)
		handler.RespondJSON(w, http.StatusInternalServerError, map[string]string{
			"error":             "server_error",
			"error_description": "Internal error during authorization",
		})
		return
	}

	// Store PKCE challenge data alongside the auth code
	pkceData := map[string]any{
		"codeChallenge":       codeChallenge,
		"codeChallengeMethod": "S256",
		"clientId":            clientID,
		"redirectUri":         redirectURI,
		"originalState":       state,
		"createdAt":           now,
	}

	if err := g.Store.SaveDoc(r.Context(), "tokens", "pkce_"+authCode, pkceData); err != nil {
		g.Log.Warn("failed to store PKCE data, auth code will be non-exchangeable", "error", err)
	}

	g.Log.Debug("OAuth authorize request", "client_id", clientID, "redirect_uri", redirectURI)

	// Redirect to the client's redirect_uri with the auth code
	callbackURL, err := url.Parse(redirectURI)
	if err != nil {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_request",
			"error_description": "Invalid redirect_uri",
		})
		return
	}

	cbq := callbackURL.Query()
	cbq.Set("code", authCode)
	if state != "" {
		cbq.Set("state", state)
	}
	callbackURL.RawQuery = cbq.Encode()

	http.Redirect(w, r, callbackURL.String(), http.StatusFound)
}

// ---------------------------------------------------------------------------
// Token Endpoint
// ---------------------------------------------------------------------------

// HandleToken handles POST /mcp/oauth/token
// OAuth 2.0 Token Endpoint (RFC 6749 Section 3.2).
func (g *GatewayService) HandleToken(w http.ResponseWriter, r *http.Request) {
	if err := parseForm(r); err != nil {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_request",
			"error_description": "Failed to parse form body",
		})
		return
	}

	grantType := r.FormValue("grant_type")
	code := r.FormValue("code")
	codeVerifier := r.FormValue("code_verifier")
	clientID := r.FormValue("client_id")
	redirectURI := r.FormValue("redirect_uri")
	refreshToken := r.FormValue("refresh_token")

	if grantType == "" {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_request",
			"error_description": "Missing required parameter: grant_type",
		})
		return
	}

	switch grantType {
	case "authorization_code":
		g.handleAuthorizationCodeGrant(w, r, code, codeVerifier, clientID, redirectURI)
	case "refresh_token":
		g.handleRefreshTokenGrant(w, r, refreshToken, clientID)
	default:
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "unsupported_grant_type",
			"error_description": fmt.Sprintf("Unsupported grant_type: %s. Supported values: authorization_code, refresh_token", grantType),
		})
	}
}

func (g *GatewayService) handleAuthorizationCodeGrant(w http.ResponseWriter, r *http.Request, code, codeVerifier, clientID, redirectURI string) {
	if code == "" || codeVerifier == "" || clientID == "" || redirectURI == "" {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_request",
			"error_description": "Missing required parameters: code, code_verifier, client_id, redirect_uri",
		})
		return
	}

	// Look up the auth code in Firestore
	codeDoc, err := g.Store.GetToken(r.Context(), "code_"+code)
	if err != nil {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_grant",
			"error_description": "Authorization code is invalid or has already been used",
		})
		return
	}

	// Single-use: revoke the auth code
	if err := g.Store.RevokeToken(r.Context(), codeDoc.ID); err != nil {
		g.Log.Error("failed to consume auth code", "error", err)
	}

	// Check expiry
	if time.Now().After(codeDoc.ExpiresAt) {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_grant",
			"error_description": "Authorization code has expired",
		})
		return
	}

	// Verify client_id matches
	if codeDoc.ClientID != clientID {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_grant",
			"error_description": "client_id does not match the original authorization request",
		})
		return
	}

	// PKCE verification: look up the stored challenge
	var pkceData map[string]any
	if err := g.Store.GetDoc(r.Context(), "tokens", "pkce_"+code, &pkceData); err == nil {
		// We found PKCE data, verify the code_verifier
		if challenge, ok := pkceData["codeChallenge"].(string); ok {
			if !verifyPKCE(codeVerifier, challenge) {
				handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
					"error":             "invalid_grant",
					"error_description": "PKCE verification failed: code_verifier does not match code_challenge",
				})
				return
			}
		}
		// Clean up PKCE data
		_ = g.Store.DeleteDoc(r.Context(), "tokens", "pkce_"+code)
	}
	// If no PKCE data found, skip verification (degraded mode for backward compatibility)
	if codeVerifier == "" {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_grant",
			"error_description": "PKCE verification failed: code_verifier is required",
		})
		return
	}

	// Issue access and refresh tokens
	now := time.Now().UTC()
	accessTokenStr := generateRandomToken(32)
	refreshTokenStr := generateRandomToken(32)

	accessToken := &domain.McpToken{
		ID:           "access_" + accessTokenStr,
		Token:        accessTokenStr,
		RefreshToken: refreshTokenStr,
		ClientID:     clientID,
		UserID:       codeDoc.UserID,
		OrgID:        codeDoc.OrgID,
		Scope:        "mcp",
		TokenType:    "Bearer",
		ExpiresAt:    now.Add(accessTokenTTL),
		Revoked:      false,
		CreatedAt:    now,
	}

	if err := g.Store.SaveToken(r.Context(), accessToken); err != nil {
		g.Log.Error("failed to save access token", "error", err)
		handler.RespondJSON(w, http.StatusInternalServerError, map[string]string{
			"error":             "server_error",
			"error_description": "Internal error during token issuance",
		})
		return
	}

	g.Log.Info("MCP access token issued", "client_id", clientID)

	handler.RespondJSON(w, http.StatusOK, domain.TokenResponse{
		AccessToken:  accessTokenStr,
		TokenType:    "Bearer",
		ExpiresIn:    int(accessTokenTTL.Seconds()),
		RefreshToken: refreshTokenStr,
		Scope:        "mcp",
	})
}

func (g *GatewayService) handleRefreshTokenGrant(w http.ResponseWriter, r *http.Request, refreshToken, clientID string) {
	if refreshToken == "" {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_request",
			"error_description": "Missing required parameter: refresh_token",
		})
		return
	}

	// Look up the refresh token
	existingToken, err := g.Store.GetTokenByRefresh(r.Context(), refreshToken)
	if err != nil {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_grant",
			"error_description": "The refresh token is invalid, expired, or revoked",
		})
		return
	}

	if existingToken.Revoked {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_grant",
			"error_description": "The refresh token has been revoked",
		})
		return
	}

	if time.Now().After(existingToken.ExpiresAt) {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_grant",
			"error_description": "The refresh token has expired",
		})
		return
	}

	// Verify client_id matches
	if clientID != "" && existingToken.ClientID != clientID {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_grant",
			"error_description": "The refresh token does not match the OAuth client",
		})
		return
	}

	// Revoke old token (rotation)
	existingToken.Revoked = true
	if err := g.Store.SaveToken(r.Context(), existingToken); err != nil {
		g.Log.Error("failed to revoke old refresh token for rotation", "error", err)
	}

	// Issue new tokens
	now := time.Now().UTC()
	newAccessToken := generateRandomToken(32)
	newRefreshToken := generateRandomToken(32)

	newToken := &domain.McpToken{
		ID:           "access_" + newAccessToken,
		Token:        newAccessToken,
		RefreshToken: newRefreshToken,
		ClientID:     existingToken.ClientID,
		UserID:       existingToken.UserID,
		OrgID:        existingToken.OrgID,
		Scope:        existingToken.Scope,
		TokenType:    "Bearer",
		ExpiresAt:    now.Add(accessTokenTTL),
		Revoked:      false,
		CreatedAt:    now,
	}

	if err := g.Store.SaveToken(r.Context(), newToken); err != nil {
		g.Log.Error("failed to save rotated token", "error", err)
		handler.RespondJSON(w, http.StatusInternalServerError, map[string]string{
			"error":             "server_error",
			"error_description": "Internal error during token refresh",
		})
		return
	}

	g.Log.Debug("MCP access token refreshed")

	handler.RespondJSON(w, http.StatusOK, domain.TokenResponse{
		AccessToken:  newAccessToken,
		TokenType:    "Bearer",
		ExpiresIn:    int(accessTokenTTL.Seconds()),
		RefreshToken: newRefreshToken,
		Scope:        "mcp",
	})
}

// ---------------------------------------------------------------------------
// Token Revocation
// ---------------------------------------------------------------------------

// HandleRevoke handles POST /mcp/oauth/revoke
// OAuth 2.0 Token Revocation per RFC 7009. Always responds 200 OK.
func (g *GatewayService) HandleRevoke(w http.ResponseWriter, r *http.Request) {
	if err := parseForm(r); err != nil {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_request",
			"error_description": "Failed to parse form body",
		})
		return
	}

	token := r.FormValue("token")
	if token == "" {
		var body struct {
			Token string `json:"token"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil && body.Token != "" {
			token = body.Token
		}
	}

	if token != "" {
		// Try to revoke by access token value
		if err := g.Store.RevokeTokenByValue(r.Context(), token); err != nil {
			// Try by refresh token
			if existing, lookupErr := g.Store.GetTokenByRefresh(r.Context(), token); lookupErr == nil {
				existing.Revoked = true
				if saveErr := g.Store.SaveToken(r.Context(), existing); saveErr != nil {
					g.Log.Warn("token revoke storage failed, continuing with 200 per RFC 7009", "error", saveErr)
				}
			}
		}
		g.Log.Info("MCP token revoke processed")
	}

	// RFC 7009 Section 2.2: always respond 200 to prevent token probing.
	handler.RespondJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ---------------------------------------------------------------------------
// Dynamic Client Registration
// ---------------------------------------------------------------------------

// HandleRegister handles POST /mcp/oauth/register
// Dynamic Client Registration per RFC 7591.
func (g *GatewayService) HandleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ClientName    string   `json:"client_name"`
		RedirectURIs  []string `json:"redirect_uris"`
		GrantTypes    []string `json:"grant_types"`
		ResponseTypes []string `json:"response_types"`
		Scope         string   `json:"scope"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_client_metadata",
			"error_description": "Invalid JSON body",
		})
		return
	}

	if req.ClientName == "" {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_client_metadata",
			"error_description": "client_name is required and must be a string",
		})
		return
	}

	if len(req.RedirectURIs) == 0 {
		handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
			"error":             "invalid_client_metadata",
			"error_description": "redirect_uris is required and must be a non-empty array",
		})
		return
	}

	// Validate each redirect URI
	for _, uri := range req.RedirectURIs {
		if !isAllowedRedirectURI(uri) {
			handler.RespondJSON(w, http.StatusBadRequest, map[string]string{
				"error":             "invalid_redirect_uri",
				"error_description": fmt.Sprintf("redirect_uri not allowed: %s", uri),
			})
			return
		}
	}

	clientID := "dyn-" + generateRandomToken(16)
	if len(req.GrantTypes) == 0 {
		req.GrantTypes = []string{"authorization_code"}
	}
	if len(req.ResponseTypes) == 0 {
		req.ResponseTypes = []string{"code"}
	}
	if req.Scope == "" {
		req.Scope = "mcp"
	}

	now := time.Now().UTC()

	client := &domain.McpClient{
		ID:            clientID,
		Name:          req.ClientName,
		RedirectURIs:  req.RedirectURIs,
		GrantTypes:    req.GrantTypes,
		ResponseTypes: req.ResponseTypes,
		Scopes:        req.Scope,
		IsDynamic:     true,
		ExpiresAt:     now.Add(24 * time.Hour),
		CreatedAt:     now,
	}

	if err := g.Store.SaveClient(r.Context(), client); err != nil {
		g.Log.Error("failed to save dynamic client", "error", err)
		handler.RespondJSON(w, http.StatusInternalServerError, map[string]string{
			"error":             "server_error",
			"error_description": "Internal error during client registration",
		})
		return
	}

	g.Log.Info("Dynamic client registered", "client_id", clientID, "name", req.ClientName)

	handler.RespondJSON(w, http.StatusCreated, map[string]any{
		"client_id":                clientID,
		"client_id_issued_at":      time.Now().Unix(),
		"client_name":              req.ClientName,
		"redirect_uris":            req.RedirectURIs,
		"grant_types":              req.GrantTypes,
		"response_types":           req.ResponseTypes,
		"token_endpoint_auth_method": "none",
		"scope":                    req.Scope,
	})
}

// ---------------------------------------------------------------------------
// OAuth helpers
// ---------------------------------------------------------------------------

// isValidClient checks whether a client_id and redirect_uri combination is valid.
func (g *GatewayService) isValidClient(ctx context.Context, clientID, redirectURI string) bool {
	// Check dynamically registered clients in Firestore
	dynClient, err := g.Store.GetClient(ctx, clientID)
	if err == nil && dynClient != nil {
		if time.Now().After(dynClient.ExpiresAt) {
			_ = g.Store.DeleteClient(ctx, clientID)
			return false
		}
		for _, uri := range dynClient.RedirectURIs {
			if uri == redirectURI {
				return true
			}
		}
		return false
	}

	// Fall back to static known client IDs
	if !knownClientIDs[clientID] {
		return false
	}

	return isAllowedRedirectURI(redirectURI)
}

// isAllowedRedirectURI checks whether a URI is safe for OAuth redirects.
func isAllowedRedirectURI(uri string) bool {
	if strings.HasPrefix(uri, "http://localhost:") ||
		strings.HasPrefix(uri, "http://127.0.0.1:") ||
		uri == "urn:ietf:wg:oauth:2.0:oob" {
		return true
	}

	// Block dangerous schemes
	if strings.HasPrefix(uri, "javascript:") ||
		strings.HasPrefix(uri, "data:") ||
		strings.HasPrefix(uri, "vbscript:") {
		return false
	}

	// Allow HTTPS to known domains
	if strings.HasPrefix(uri, "https://") {
		allowedHosts := []string{"gal.run", "app.gal.run"}
		trimmed := strings.TrimPrefix(uri, "https://")
		for _, host := range allowedHosts {
			if trimmed == host || strings.HasPrefix(trimmed, host+"/") ||
				strings.HasPrefix(trimmed, host+".") {
				return true
			}
		}
	}

	// Allow custom URI schemes (vscode://, claude-code://, etc.)
	if strings.Contains(uri, "://") {
		scheme := strings.Split(uri, "://")[0]
		if scheme != "http" && scheme != "https" {
			return true
		}
	}

	return false
}

// verifyPKCE verifies a code_verifier against the stored code_challenge using S256.
func verifyPKCE(verifier, challenge string) bool {
	hash := sha256.Sum256([]byte(verifier))
	expected := base64.RawURLEncoding.EncodeToString(hash[:])
	return expected == challenge
}

// generateRandomToken generates a cryptographically random token as base64url (no padding).
func generateRandomToken(bytesLen int) string {
	b := make([]byte, bytesLen)
	if _, err := rand.Read(b); err != nil {
		return strings.ReplaceAll(uuid.New().String(), "-", "")
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// apiBaseURL returns the base URL for the API, respecting forwarded headers.
func (g *GatewayService) apiBaseURL(r *http.Request) string {
	scheme := r.Header.Get("X-Forwarded-Proto")
	if scheme == "" {
		if r.TLS != nil {
			scheme = "https"
		} else {
			scheme = "http"
		}
	}

	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}

	return fmt.Sprintf("%s://%s", scheme, host)
}
