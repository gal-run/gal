//go:build cloud
// +build cloud

// auth-svc is the authentication and identity service for the GAL platform.
// It handles JWT token issuance/validation, Firebase Auth integration,
// OAuth provider flows, credential management, SAML SSO, and user settings.
//
// Firestore collections owned: users, credentials, consent_records, sso_configs, user_settings
package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"html"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	cfirestore "cloud.google.com/go/firestore"
	"github.com/go-chi/chi/v5"
	jwtauth "github.com/go-chi/jwtauth/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/crewjam/saml"
	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"

	"github.com/gal-run/gal/services/lib/firestore"
	"github.com/gal-run/gal/services/lib/handler"
	"github.com/gal-run/gal/services/lib/telemetry"
)

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

// UserProfile is stored in the "users" Firestore collection.
type UserProfile struct {
	ID              string     `firestore:"id" json:"id"`
	Email           string     `firestore:"email" json:"email"`
	Name            string     `firestore:"name" json:"name"`
	AvatarURL       string     `firestore:"avatarUrl" json:"avatarUrl"`
	OrgID           string     `firestore:"orgId" json:"orgId"`
	Role            string     `firestore:"role" json:"role"`
	TermsAcceptedAt *time.Time `firestore:"termsAcceptedAt,omitempty" json:"termsAcceptedAt,omitempty"`
	TermsVersion    string     `firestore:"termsVersion,omitempty" json:"termsVersion,omitempty"`
	CreatedAt       time.Time  `firestore:"createdAt" json:"createdAt"`
	UpdatedAt       time.Time  `firestore:"updatedAt" json:"updatedAt"`
}

// Credential is stored encrypted in the "credentials" Firestore collection.
type Credential struct {
	ID             string    `firestore:"id" json:"id"`
	UserID         string    `firestore:"userId" json:"userId"`
	Provider       string    `firestore:"provider" json:"provider"`
	EncryptedToken string    `firestore:"encryptedToken" json:"-"`
	TokenPrefix    string    `firestore:"tokenPrefix" json:"tokenPrefix"`
	ExpiryDate     int64     `firestore:"expiryDate,omitempty" json:"expiryDate,omitempty"`
	CreatedAt      time.Time `firestore:"createdAt" json:"createdAt"`
	UpdatedAt      time.Time `firestore:"updatedAt" json:"updatedAt"`
}

// ConsentRecord is stored in the "consent_records" Firestore collection.
type ConsentRecord struct {
	ID             string     `firestore:"id" json:"id"`
	UserID         string     `firestore:"userId" json:"userId"`
	Provider       string     `firestore:"provider" json:"provider"`
	PolicyVersion  string     `firestore:"policyVersion" json:"policyVersion"`
	PrivacyVersion string     `firestore:"privacyVersion" json:"privacyVersion"`
	ConsentedAt    time.Time  `firestore:"consentedAt" json:"consentedAt"`
	RevokedAt      *time.Time `firestore:"revokedAt,omitempty" json:"revokedAt,omitempty"`
	IPHash         string     `firestore:"ipHash" json:"-"`
	UserAgent      string     `firestore:"userAgent" json:"-"`
}

// SSOConfig is stored in the "sso_configs" Firestore collection, keyed by org ID.
type SSOConfig struct {
	OrgName                string `firestore:"orgName" json:"orgName"`
	Enabled                bool   `firestore:"enabled" json:"enabled"`
	IDPSSOURL              string `firestore:"idpSsoUrl" json:"idpSsoUrl"`
	IDPCertificate         string `firestore:"idpCertificate" json:"-"`
	IDPIssuer              string `firestore:"idpIssuer" json:"idpIssuer"`
	MetadataURL            string `firestore:"metadataUrl,omitempty" json:"metadataUrl,omitempty"`
	RequireSignedAssertions bool `firestore:"requireSignedAssertions" json:"requireSignedAssertions"`
	EmailAttribute         string `firestore:"emailAttribute" json:"emailAttribute"`
	NameAttribute          string `firestore:"nameAttribute" json:"nameAttribute"`
	ConfiguredBy           string `firestore:"configuredBy" json:"configuredBy"`
	CreatedAt              string `firestore:"createdAt" json:"createdAt"`
	UpdatedAt              string `firestore:"updatedAt" json:"updatedAt"`
}

// UserSettings is stored in the "user_settings" Firestore collection.
type UserSettings struct {
	UserID    string          `firestore:"userId" json:"userId"`
	GalCode   *GalCodePrefs   `firestore:"galCode,omitempty" json:"galCode,omitempty"`
	UpdatedAt time.Time       `firestore:"updatedAt" json:"updatedAt"`
}

// GalCodePrefs holds Claude Code-specific preferences.
type GalCodePrefs struct {
	CollectInteractiveSessions bool `firestore:"collectInteractiveSessions,omitempty" json:"collectInteractiveSessions,omitempty"`
}

// ProviderConfig describes an OAuth provider we support.
type ProviderConfig struct {
	Name         string
	AuthURL      string
	TokenURL     string
	ClientID     string
	ClientSecret string
	Scopes       string
	RedirectURL  string
}

// ---------------------------------------------------------------------------
// Request / Response types
// ---------------------------------------------------------------------------

type loginRequest struct {
	FirebaseToken string `json:"firebaseToken"`
}

type tokenExchangeRequest struct {
	Provider string `json:"provider"`
	Code     string `json:"code"`
}

type refreshRequest struct {
	RefreshToken string `json:"refreshToken"`
}

type storeCredentialRequest struct {
	Provider    string `json:"provider"`
	AccessToken string `json:"accessToken"`
	ExpiryDate  int64  `json:"expiryDate,omitempty"`
}

type validateCredentialResponse struct {
	Valid    bool   `json:"valid"`
	Provider string `json:"provider"`
	Method   string `json:"method"`
	ExpiresAt int64 `json:"expiresAt,omitempty"`
	Error    string `json:"error,omitempty"`
}

type consentRequest struct {
	Provider       string `json:"provider"`
	PolicyVersion  string `json:"policyVersion"`
	PrivacyVersion string `json:"privacyVersion"`
}

type updateMeRequest struct {
	Name      string `json:"name,omitempty"`
	AvatarURL string `json:"avatarUrl,omitempty"`
}

type acceptTermsRequest struct {
	TermsVersion string `json:"termsVersion"`
}

type ssoInitRequest struct {
	OrgName string `json:"orgName"`
}

type ssoCallbackRequest struct {
	OrgName       string `json:"orgName"`
	SAMLResponse  string `json:"samlResponse"`
	RelayState    string `json:"relayState,omitempty"`
}

type oauthInitiateRequest struct {
	RedirectURI string `json:"redirectUri,omitempty"`
}

type tokenResponse struct {
	Token        string `json:"token"`
	RefreshToken string `json:"refreshToken,omitempty"`
	ExpiresIn    int64  `json:"expiresIn"`
	TokenType    string `json:"tokenType"`
}

type sessionResponse struct {
	UserID    string   `json:"userId"`
	Email     string   `json:"email"`
	Name      string   `json:"name"`
	AvatarURL string   `json:"avatarUrl"`
	OrgID     string   `json:"orgId"`
	Providers []string `json:"providers,omitempty"`
	ExpiresAt int64    `json:"expiresAt"`
}

type settingsResponse struct {
	Success  bool          `json:"success"`
	Settings *UserSettings `json:"settings,omitempty"`
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const (
	tokenExpiry     = 7 * 24 * time.Hour  // 7 days
	refreshExpiry   = 30 * 24 * time.Hour // 30 days
	refreshGrace    = 24 * time.Hour      // 24h grace for expired tokens
	sessionIssuer   = "auth-svc"
	sessionAudience = "gal-run"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// userIDFromHeader extracts the userId claim from a JWT in the Authorization header.
// Uses the already-verified token from the gateway — no middleware needed.
func (s *authService) userIDFromHeader(r *http.Request) string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		return ""
	}
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	claims := jwt.MapClaims{}
	parser := jwt.NewParser()
	_, _, err := parser.ParseUnverified(tokenStr, claims)
	if err != nil {
		return ""
	}
	if uid, ok := claims["userId"].(string); ok {
		return uid
	}
	if uid, ok := claims["user_id"].(string); ok {
		return uid
	}
	if sub, ok := claims["sub"].(string); ok {
		return sub
	}
	return ""
}

// galSessionIssuers are the JWT issuers accepted for the gal_session cookie.
// The dashboard authenticates against the TypeScript gal-api, which mints
// session JWTs with issuer "gal-run-api" (legacy alias "gal-api"). auth-svc
// itself issues "auth-svc". All are HS256-signed with the shared JWT_SECRET.
var galSessionIssuers = map[string]bool{
	"gal-run-api": true,
	"gal-api":     true,
	sessionIssuer: true, // "auth-svc"
}

// userIDFromSessionCookie extracts a user ID from the gal_session cookie.
//
// The cookie is a GAL-issued HS256 JWT (minted by gal-api or auth-svc, signed
// with the shared JWT_SECRET), so validate it as such. Historically this
// treated the cookie as a raw Firebase ID token, which never matched the
// dashboard's gal-api-issued session JWT and caused 401s on /organizations.
// The Firebase path is kept as a fallback for any client that still presents a
// raw Firebase token as the cookie.
func (s *authService) userIDFromSessionCookie(r *http.Request) string {
	cookie, err := r.Cookie("gal_session")
	if err != nil || cookie.Value == "" {
		return ""
	}

	// Primary: GAL session JWT (HS256, shared secret) — what the dashboard
	// sends after logging in against gal-api.
	if uid := s.userIDFromGALSessionJWT(cookie.Value); uid != "" {
		return uid
	}

	// Fallback: a raw Firebase ID token presented as the cookie.
	if s.firebaseAuth != nil {
		if token, err := s.firebaseAuth.VerifyIDToken(r.Context(), cookie.Value); err == nil {
			return token.UID
		}
	}
	return ""
}

// galSessionClaims reads and validates the gal_session cookie as a GAL session
// JWT, returning its claims (or nil if the cookie is absent/invalid). Browser
// clients send only this cookie — no Authorization header — so it is the source
// of both the user id and the org list for those requests.
func (s *authService) galSessionClaims(r *http.Request) jwt.MapClaims {
	cookie, err := r.Cookie("gal_session")
	if err != nil || cookie.Value == "" {
		return nil
	}
	return s.validateGALSessionJWT(cookie.Value)
}

// validateGALSessionJWT verifies an HS256 GAL session JWT (signature + expiry,
// validated by default in golang-jwt v5) signed with the shared JWT secret,
// accepts only the known GAL issuers, and honors revocation. Returns the claims,
// or nil if the token is not a valid GAL session JWT.
func (s *authService) validateGALSessionJWT(tokenStr string) jwt.MapClaims {
	if s.jwtSecret == "" {
		return nil
	}
	claims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.jwtSecret), nil
	}); err != nil {
		return nil
	}
	// Accept only known GAL issuers.
	if iss, ok := claims["iss"].(string); !ok || !galSessionIssuers[iss] {
		return nil
	}
	// Honor revocation for auth-svc-issued tokens. (gal-api tokens are revoked
	// in gal-api's own store, which is not visible from here.)
	if jti, ok := claims["jti"].(string); ok && jti != "" && s.isTokenRevoked(jti) {
		return nil
	}
	return claims
}

// userIDFromGALSessionJWT returns the user id claim from a validated GAL session
// JWT. Returns "" if the token is not a valid GAL session JWT.
func (s *authService) userIDFromGALSessionJWT(tokenStr string) string {
	claims := s.validateGALSessionJWT(tokenStr)
	if claims == nil {
		return ""
	}
	for _, key := range []string{"userId", "user_id", "sub"} {
		if uid, ok := claims[key].(string); ok && uid != "" {
			return uid
		}
	}
	return ""
}

// handleGmailStatus returns whether the authenticated user has a valid Gmail credential.
func (s *authService) handleGmailStatus(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromHeader(r)
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "missing user", "UNAUTHORIZED")
		return
	}

	iter := s.store.Collection("credentials").Where("userId", "==", userID).Where("provider", "==", "gmail").Documents(r.Context())
	defer iter.Stop()

	doc, err := iter.Next()
	if err != nil {
		handler.RespondJSON(w, http.StatusOK, map[string]any{"connected": false})
		return
	}

	var cred map[string]any
	doc.DataTo(&cred)
	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"connected":   true,
		"email":       cred["email"],
		"lastChecked": cred["updatedAt"],
	})
}

// handleGmailConnect returns the OAuth URL for Gmail authorization.
func (s *authService) handleGmailConnect(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromHeader(r)
	if userID == "" {
		authLen := len(r.Header.Get("Authorization"))
		handler.RespondError(w, http.StatusUnauthorized, fmt.Sprintf("missing user (auth_len=%d)", authLen), "UNAUTHORIZED")
		return
	}

	provider, ok := s.providerClients["gmail"]
	if !ok {
		handler.RespondError(w, http.StatusServiceUnavailable, "gmail provider not configured", "PROVIDER_MISSING")
		return
	}

	state := "gmail:" + uuid.New().String()
	nonce := uuid.New().String()

	// Store state temporarily for callback validation
	s.store.Collection("oauth_states").Doc(state).Set(r.Context(), map[string]any{
		"userId":    userID,
		"provider":  "gmail",
		"createdAt": time.Now(),
	})

	authURL := fmt.Sprintf("%s?client_id=%s&redirect_uri=%s&response_type=code&scope=%s&state=%s&nonce=%s&access_type=offline&prompt=consent",
		provider.AuthURL,
		url.QueryEscape(provider.ClientID),
		url.QueryEscape(provider.RedirectURL),
		url.QueryEscape(provider.Scopes),
		url.QueryEscape(state),
		url.QueryEscape(nonce),
	)

	handler.RespondJSON(w, http.StatusOK, map[string]any{"authUrl": authURL})
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}

func getEncryptionKey() []byte {
	key := os.Getenv("CREDENTIAL_ENCRYPTION_KEY")
	if key == "" {
		// In dev, derive a key from JWT_SECRET
		secret := os.Getenv("JWT_SECRET")
		if secret == "" {
			secret = "dev-only-insecure-key-change-in-production"
		}
		h := sha256.Sum256([]byte(secret))
		return h[:]
	}
	// Expect base64-encoded 32-byte key
	decoded, err := base64.StdEncoding.DecodeString(key)
	if err != nil || len(decoded) != 32 {
		h := sha256.Sum256([]byte(key))
		return h[:]
	}
	return decoded
}

// getAppBaseURL returns the public-facing base URL of this service.
func getAppBaseURL() string {
	return envOrDefault("APP_BASE_URL", "http://localhost:8080")
}

// getDashboardURL returns the dashboard base URL for redirects.
func getDashboardURL() string {
	return envOrDefault("DASHBOARD_URL", "http://localhost:5173")
}

// corsAllowedOrigins is the set of origins permitted to make credentialed CORS
// requests to auth-svc: the dashboard URL plus any in CORS_ALLOWED_ORIGINS
// (comma-separated). An arbitrary Origin is never reflected with credentials.
func corsAllowedOrigins() map[string]bool {
	set := map[string]bool{}
	if d := getDashboardURL(); d != "" {
		set[d] = true
	}
	for _, o := range strings.Split(os.Getenv("CORS_ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			set[o] = true
		}
	}
	return set
}

// ---------------------------------------------------------------------------
// Encryption (AES-256-GCM)
// ---------------------------------------------------------------------------

func encrypt(plaintext string, key []byte) (string, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes.NewCipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("cipher.NewGCM: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("rand.Read: %w", err)
	}
	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func decrypt(ciphertextB64 string, key []byte) (string, error) {
	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		return "", fmt.Errorf("base64 decode: %w", err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("aes.NewCipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("cipher.NewGCM: %w", err)
	}
	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("gcm.Open: %w", err)
	}
	return string(plaintext), nil
}

// getTokenPrefix returns the first 8 chars of the SHA-256 of a token for display.
func getTokenPrefix(token string) string {
	h := sha256.Sum256([]byte(token))
	return hexEncode(h[:4])
}

func hexEncode(b []byte) string {
	const hexChars = "0123456789abcdef"
	buf := make([]byte, len(b)*2)
	for i, v := range b {
		buf[i*2] = hexChars[v>>4]
		buf[i*2+1] = hexChars[v&0x0F]
	}
	return string(buf)
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

func main() {
	ctx := context.Background()
	log := telemetry.Logger()

	tp, err := telemetry.InitTracer(ctx, "auth-svc")
	if err != nil {
		log.Warn("tracing init failed, continuing without", "error", err)
	} else {
		defer tp.Shutdown(ctx)
	}

	fsClient, err := firestore.Client(ctx)
	if err != nil {
		log.Error("firestore unavailable", "error", err)
		os.Exit(1)
	}
	defer firestore.Close()

	store := firestore.NewServiceStore(fsClient, map[string]string{
		"users":          "users",
		"credentials":    "credentials",
		"consent_records": "consent_records",
		"sso_configs":    "sso_configs",
		"user_settings":  "user_settings",
		"organizations":  "organizations",
	})

	// JWT auth setup
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		log.Warn("JWT_SECRET not set, generating ephemeral secret (dev only)")
		h := sha256.Sum256([]byte(uuid.New().String()))
		jwtSecret = hexEncode(h[:])
	}
	ja := jwtauth.New("HS256", []byte(jwtSecret), nil)

	// Firebase Admin Auth client
	var firebaseAuth *auth.Client
	firebaseApp, err := firebase.NewApp(ctx, nil)
	if err != nil {
		log.Warn("firebase app not available", "error", err)
	} else {
		firebaseAuth, err = firebaseApp.Auth(ctx)
		if err != nil {
			log.Warn("firebase auth not available", "error", err)
		}
	}

	// Load SAML SP key/cert if configured
	var samlKey *rsa.PrivateKey
	var samlCert *x509.Certificate
	samlKeyPEM := os.Getenv("SAML_SP_KEY")
	samlCertPEM := os.Getenv("SAML_SP_CERT")
	if samlKeyPEM != "" && samlCertPEM != "" {
		samlKey, samlCert, err = loadSPKeyCert(samlKeyPEM, samlCertPEM)
		if err != nil {
			log.Warn("failed to load SAML SP key/cert", "error", err)
		}
	}

	svc := &authService{
		store:         store,
		log:           log,
		jwtAuth:       ja,
		jwtSecret:     jwtSecret,
		encryptionKey: getEncryptionKey(),
		firebaseAuth:  firebaseAuth,
		samlKey:       samlKey,
		samlCert:      samlCert,
		revokedTokens: make(map[string]time.Time),
		providerClients: map[string]ProviderConfig{
			"claude": {
				Name:         "Claude",
				ClientID:     os.Getenv("CLAUDE_CLIENT_ID"),
				ClientSecret: os.Getenv("CLAUDE_CLIENT_SECRET"),
				AuthURL:      "https://claude.ai/oauth/authorize",
				TokenURL:     "https://claude.ai/oauth/token",
				Scopes:       "read write",
				RedirectURL:  getAppBaseURL() + "/auth/oauth/callback",
			},
			"codex": {
				Name:         "Codex",
				ClientID:     os.Getenv("CODEX_CLIENT_ID"),
				ClientSecret: os.Getenv("CODEX_CLIENT_SECRET"),
				AuthURL:      "https://codex.openai.com/oauth/authorize",
				TokenURL:     "https://codex.openai.com/oauth/token",
				Scopes:       "read write",
				RedirectURL:  getAppBaseURL() + "/auth/oauth/callback",
			},
			"gemini": {
				Name:         "Gemini",
				ClientID:     os.Getenv("GEMINI_CLIENT_ID"),
				ClientSecret: os.Getenv("GEMINI_CLIENT_SECRET"),
				AuthURL:      "https://accounts.google.com/o/oauth2/v2/auth",
				TokenURL:     "https://oauth2.googleapis.com/token",
				Scopes:       "https://www.googleapis.com/auth/cloud-platform",
				RedirectURL:  getAppBaseURL() + "/auth/oauth/callback",
			},
			"gmail": {
				Name:         "Gmail",
				ClientID:     os.Getenv("GMAIL_CLIENT_ID"),
				ClientSecret: os.Getenv("GMAIL_CLIENT_SECRET"),
				AuthURL:      "https://accounts.google.com/o/oauth2/v2/auth",
				TokenURL:     "https://oauth2.googleapis.com/token",
				Scopes:       "https://www.googleapis.com/auth/gmail.modify",
				RedirectURL:  getAppBaseURL() + "/auth/oauth/callback",
			},
		},
	}

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))

	// CORS middleware — reflect ONLY allow-listed origins. Reflecting an arbitrary
	// Origin together with Allow-Credentials lets any site make credentialed
	// requests on the user's behalf; we therefore echo the Origin + credentials
	// only when it is in the allow-list (dashboard URL + CORS_ALLOWED_ORIGINS).
	// The gateway handles CORS for external traffic; this is an internal fallback.
	allowedOrigins := corsAllowedOrigins()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			if origin != "" && allowedOrigins[origin] {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Add("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	// ─── Health ──────────────────────────────────────────────────────────
	r.Get("/health", svc.handleHealth)

	// ─── Public auth routes (no JWT check) ───────────────────────────────
	r.Post("/auth/login", svc.handleLogin)
	r.Post("/auth/token-exchange", svc.handleTokenExchange)
	r.Post("/auth/refresh", svc.handleRefresh)
	r.Post("/auth/oauth/{provider}", svc.handleOAuthInitiate)
	r.Get("/auth/oauth/callback", svc.handleOAuthCallback)
	r.Post("/auth/sso/init", svc.handleSSOInit)
	r.Post("/auth/sso/callback", svc.handleSSOCallback)

	// ─── Authenticated routes (JWT required) ─────────────────────────────
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))

		r.Get("/auth/session", svc.handleSession)
		r.Delete("/auth/session", svc.handleLogout)

		r.Get("/users/me", svc.handleGetMe)
		r.Patch("/users/me", svc.handleUpdateMe)
		r.Get("/users/me/settings", svc.handleGetSettings)
		r.Patch("/users/me/settings", svc.handleUpdateSettings)
		r.Post("/users/me/terms", svc.handleAcceptTerms)

		r.Get("/credentials", svc.handleListCredentials)
		r.Post("/credentials", svc.handleStoreCredential)
		r.Delete("/credentials/{id}", svc.handleDeleteCredential)
		r.Post("/credentials/{id}/validate", svc.handleValidateCredential)

		r.Get("/consent", svc.handleListConsent)
		r.Post("/consent", svc.handleGrantConsent)
		r.Delete("/consent/{id}", svc.handleRevokeConsent)
	})

	// Gmail credential routes — JWT parsed from Authorization header (gateway-verified).
	// Moved outside the JWT middleware group to avoid double-verification.
	r.Get("/credentials/gmail/status", svc.handleGmailStatus)
	r.Post("/credentials/gmail/connect", svc.handleGmailConnect)

	// Organization routes — JWT from Authorization header, gateway-verified.
	// Outside the JWT middleware group to accept tokens from both the
	// legacy monolith (iss: gal-run-api) and auth-svc (iss: auth-svc).
	r.Get("/organizations", svc.handleListOrganizations)
	r.Post("/organizations/quick-sync", svc.handleQuickSync)

	port := envOrDefault("PORT", "8080")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Info("shutting down gracefully...")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		srv.Shutdown(shutdownCtx)
	}()

	log.Info("auth-svc starting", "port", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server error", "error", err)
		os.Exit(1)
	}
	log.Info("server stopped")
}

// ---------------------------------------------------------------------------
// Service struct
// ---------------------------------------------------------------------------

type authService struct {
	store          *firestore.ServiceStore
	log            *slog.Logger
	jwtAuth        *jwtauth.JWTAuth
	jwtSecret      string
	encryptionKey  []byte
	firebaseAuth   *auth.Client
	samlKey        *rsa.PrivateKey
	samlCert       *x509.Certificate
	providerClients map[string]ProviderConfig
	revokedTokens  map[string]time.Time // jti -> expiry
	mu             sync.RWMutex
}

// userIDFromCtx extracts the user_id claim from the JWT in context.
func (s *authService) userIDFromCtx(ctx context.Context) string {
	_, claims, _ := jwtauth.FromContext(ctx)
	if claims == nil {
		return ""
	}
	if uid, ok := claims["user_id"].(string); ok {
		return uid
	}
	if uid, ok := claims["userId"].(string); ok {
		return uid
	}
	if sub, ok := claims["sub"].(string); ok {
		return sub
	}
	return ""
}

func (s *authService) orgIDFromCtx(ctx context.Context) string {
	_, claims, _ := jwtauth.FromContext(ctx)
	if claims == nil {
		return ""
	}
	if oid, ok := claims["org_id"].(string); ok {
		return oid
	}
	return ""
}

func (s *authService) emailFromCtx(ctx context.Context) string {
	_, claims, _ := jwtauth.FromContext(ctx)
	if claims == nil {
		return ""
	}
	if email, ok := claims["email"].(string); ok {
		return email
	}
	return ""
}

// issueToken creates a signed GAL JWT with standard claims.
func (s *authService) issueToken(userID, orgID, email, name string, providers []string, expiry time.Duration) (string, time.Time, error) {
	now := time.Now()
	exp := now.Add(expiry)
	claims := jwt.MapClaims{
		"user_id":   userID,
		"email":     email,
		"org_id":    orgID,
		"sub":       userID,
		"iss":       sessionIssuer,
		"aud":       sessionAudience,
		"iat":       now.Unix(),
		"exp":       exp.Unix(),
		"jti":       uuid.New().String(),
	}
	if name != "" {
		claims["name"] = name
	}
	if len(providers) > 0 {
		claims["providers"] = providers
	}

	_, tokenStr, err := s.jwtAuth.Encode(claims)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("jwt encode: %w", err)
	}
	return tokenStr, exp, nil
}

// isTokenRevoked checks if a JWT ID is in the revocation set.
func (s *authService) isTokenRevoked(jti string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	exp, ok := s.revokedTokens[jti]
	if !ok {
		return false
	}
	if time.Now().After(exp) {
		// Expired revocation entry, clean up lazily
		return false
	}
	return true
}

// revokeToken marks a JWT ID as revoked until its original expiry.
func (s *authService) revokeToken(jti string, expiry time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.revokedTokens[jti] = expiry
	// Clean up expired entries periodically
	if len(s.revokedTokens) > 1000 {
		for k, v := range s.revokedTokens {
			if time.Now().After(v) {
				delete(s.revokedTokens, k)
			}
		}
	}
}

// validateToken verifies a JWT string and returns its claims.
func (s *authService) validateToken(tokenStr string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.jwtSecret), nil
	})
	if err != nil {
		return nil, fmt.Errorf("token parse: %w", err)
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid token")
	}
	// Check revocation
	if jti, ok := claims["jti"].(string); ok && jti != "" {
		if s.isTokenRevoked(jti) {
			return nil, errors.New("token revoked")
		}
	}
	// Check issuer
	if iss, ok := claims["iss"].(string); ok && iss != sessionIssuer {
		return nil, fmt.Errorf("unexpected issuer: %s", iss)
	}
	return claims, nil
}

// loadSPKeyCert parses PEM-encoded RSA private key and X.509 certificate.
func loadSPKeyCert(keyPEM, certPEM string) (*rsa.PrivateKey, *x509.Certificate, error) {
	keyBlock, _ := pem.Decode([]byte(keyPEM))
	if keyBlock == nil {
		return nil, nil, errors.New("failed to decode SAML SP key PEM")
	}
	key, err := x509.ParsePKCS8PrivateKey(keyBlock.Bytes)
	if err != nil {
		key, err = x509.ParsePKCS1PrivateKey(keyBlock.Bytes)
		if err != nil {
			return nil, nil, fmt.Errorf("saml sp key parse: %w", err)
		}
	}
	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, nil, errors.New("SAML SP key is not RSA")
	}

	certBlock, _ := pem.Decode([]byte(certPEM))
	if certBlock == nil {
		return nil, nil, errors.New("failed to decode SAML SP cert PEM")
	}
	cert, err := x509.ParseCertificate(certBlock.Bytes)
	if err != nil {
		return nil, nil, fmt.Errorf("saml sp cert parse: %w", err)
	}
	return rsaKey, cert, nil
}

// getSAMLServiceProvider creates a SAML SP from an org's SSO config.
func (s *authService) getSAMLServiceProvider(orgName string, config *SSOConfig) (*saml.ServiceProvider, error) {
	if s.samlKey == nil || s.samlCert == nil {
		return nil, errors.New("SAML SP key/cert not configured on server")
	}

	idpMetadata := &saml.EntityDescriptor{
		EntityID: config.IDPIssuer,
		IDPSSODescriptors: []saml.IDPSSODescriptor{
			{
				SSODescriptor: saml.SSODescriptor{
					RoleDescriptor: saml.RoleDescriptor{},
				},
				SingleSignOnServices: []saml.Endpoint{
					{
						Binding:  saml.HTTPRedirectBinding,
						Location: config.IDPSSOURL,
					},
					{
						Binding:  saml.HTTPPostBinding,
						Location: config.IDPSSOURL,
					},
				},
			},
		},
	}
	if config.IDPCertificate != "" {
		certBlock, _ := pem.Decode([]byte(config.IDPCertificate))
		if certBlock != nil {
			idpCert, err := x509.ParseCertificate(certBlock.Bytes)
			if err == nil {
				idpMetadata.IDPSSODescriptors[0].KeyDescriptors = []saml.KeyDescriptor{
					{
						Use: "signing",
						KeyInfo: saml.KeyInfo{
							X509Data: saml.X509Data{
									X509Certificates: []saml.X509Certificate{
										{Data: base64.StdEncoding.EncodeToString(idpCert.Raw)},
									},
								},
						},
					},
				}
			}
		}
	}

	metadataURL, _ := url.Parse(getAppBaseURL() + "/auth/sso/metadata/" + url.PathEscape(orgName))
	acsURL, _ := url.Parse(getAppBaseURL() + "/auth/sso/callback")

	sp := &saml.ServiceProvider{
		Key:              s.samlKey,
		Certificate:      s.samlCert,
		MetadataURL:      *metadataURL,
		AcsURL:           *acsURL,
		IDPMetadata:      idpMetadata,
		AuthnNameIDFormat: saml.EmailAddressNameIDFormat,
	}
	return sp, nil
}

// ---------------------------------------------------------------------------
// Organization handlers
// ---------------------------------------------------------------------------

// handleListOrganizations returns organizations the authenticated user belongs to.
// Uses userIDFromHeader (not userIDFromCtx) because this route is outside the
// JWT middleware group, allowing tokens from both legacy (iss: gal-run-api)
// and auth-svc (iss: auth-svc) issuers.
// Also falls back to cookie-based auth (gal_session) for browser clients.
func (s *authService) handleListOrganizations(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromHeader(r)
	if userID == "" {
		// Fall back to gal_session cookie for browser clients.
		userID = s.userIDFromSessionCookie(r)
	}
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	// Collect org names from the Authorization header JWT (CLI/API clients).
	orgNames := orgNamesFromToken(r)

	// Browser clients send only the gal_session cookie (no Authorization
	// header), so pull org names from the validated cookie claims. Without
	// this, authenticated browser requests resolve a user id but no orgs and
	// the dashboard receives an empty workspace list.
	if len(orgNames) == 0 {
		if claims := s.galSessionClaims(r); claims != nil {
			orgNames = orgNamesFromClaims(map[string]any(claims))
		}
	}

	// If still no orgs in claims, check the user profile for a personal org.
	if len(orgNames) == 0 {
		doc, err := s.store.Doc("users", userID).Get(r.Context())
		if err == nil {
			var profile UserProfile
			doc.DataTo(&profile)
			if profile.OrgID != "" {
				orgNames = append(orgNames, profile.OrgID)
			}
		}
	}

	// Fetch organization documents from Firestore.
	orgs := make([]map[string]any, 0)
	for _, orgName := range orgNames {
		doc, err := s.store.Doc("organizations", orgName).Get(r.Context())
		if err != nil {
			// Org exists in claims but not in Firestore — include a skeleton.
			orgs = append(orgs, map[string]any{
				"name": orgName,
				"id":   orgName,
			})
			continue
		}
		data := doc.Data()
		if data == nil {
			data = make(map[string]any)
		}
		data["id"] = doc.Ref.ID
		orgs = append(orgs, data)
	}

	if orgs == nil {
		orgs = make([]map[string]any, 0)
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"organizations": orgs,
	})
}

// orgNamesFromClaims extracts organization names from JWT claims.
func orgNamesFromClaims(claims map[string]any) []string {
	if claims == nil {
		return nil
	}
	// Prefer the "organizations" array (set at login).
	if raw, ok := claims["organizations"].([]any); ok {
		var names []string
		for _, v := range raw {
			if s, ok := v.(string); ok {
				names = append(names, s)
			}
		}
		return names
	}
	// Fall back to single "org_id" claim.
	if orgID, ok := claims["org_id"].(string); ok && orgID != "" {
		return []string{orgID}
	}
	return nil
}

// orgNamesFromToken parses the JWT from the Authorization header and extracts
// organization names from its claims. Does NOT validate the token — the gateway
// already performed validation before forwarding.
func orgNamesFromToken(r *http.Request) []string {
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		return nil
	}
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
	claims := jwt.MapClaims{}
	parser := jwt.NewParser()
	_, _, err := parser.ParseUnverified(tokenStr, claims)
	if err != nil {
		return nil
	}
	return orgNamesFromClaims(claims)
}

// handleQuickSync triggers a lightweight organization sync (no full repo scan).
// For now, this is a passthrough that acknowledges the request. The full
// implementation requires calling the repo-svc for config discovery.
func (s *authService) handleQuickSync(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromHeader(r)
	if userID == "" {
		userID = s.userIDFromSessionCookie(r)
	}
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	s.log.Info("quick-sync requested", "user", userID)

	// TODO: Trigger repo-svc sync via internal call or Pub/Sub.
	// For now, acknowledge and let the caller poll for results.
	handler.RespondJSON(w, http.StatusAccepted, map[string]any{
		"status":  "accepted",
		"message": "Sync request received. Organizations will be refreshed shortly.",
	})
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

func (s *authService) handleHealth(w http.ResponseWriter, r *http.Request) {
	handler.RespondJSON(w, http.StatusOK, map[string]string{
		"status": "ok",
		"service": "auth-svc",
	})
}

// ---------------------------------------------------------------------------
// Auth handlers
// ---------------------------------------------------------------------------

// handleLogin verifies a Firebase Auth token and issues a GAL JWT.
func (s *authService) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.FirebaseToken == "" {
		handler.RespondError(w, http.StatusBadRequest, "firebaseToken is required", "MISSING_TOKEN")
		return
	}

	if s.firebaseAuth == nil {
		handler.RespondError(w, http.StatusServiceUnavailable, "Firebase Auth not configured", "SERVICE_UNAVAILABLE")
		return
	}

	// Verify the Firebase ID token
	firebaseToken, err := s.firebaseAuth.VerifyIDToken(r.Context(), req.FirebaseToken)
	if err != nil {
		s.log.Warn("firebase token verification failed", "error", err)
		handler.RespondError(w, http.StatusUnauthorized, "invalid firebase token", "INVALID_TOKEN")
		return
	}

	userID := firebaseToken.UID
	email, _ := firebaseToken.Claims["email"].(string)
	name, _ := firebaseToken.Claims["name"].(string)
	picture, _ := firebaseToken.Claims["picture"].(string)
	emailVerified, _ := firebaseToken.Claims["email_verified"].(bool)

	if email == "" {
		handler.RespondError(w, http.StatusBadRequest, "email required in token", "MISSING_EMAIL")
		return
	}
	_ = emailVerified

	// Upsert user profile in Firestore
	now := time.Now()
	userDoc := s.store.Doc("users", userID)
	userSnap, err := userDoc.Get(r.Context())
	var profile UserProfile
	if err != nil {
		// New user
		profile = UserProfile{
			ID:        userID,
			Email:     email,
			Name:      name,
			AvatarURL: picture,
			OrgID:     "",
			Role:      "member",
			CreatedAt: now,
			UpdatedAt: now,
		}
	} else {
		userSnap.DataTo(&profile)
		profile.Email = email
		profile.Name = name
		if picture != "" {
			profile.AvatarURL = picture
		}
		profile.UpdatedAt = now
	}

	// Check if org_id was provided as a claim or query param
	orgID, _ := firebaseToken.Claims["org_id"].(string)
	if orgID == "" {
		orgID = profile.OrgID
	}

	// Save user profile
	profile.OrgID = orgID
	profile.UpdatedAt = now
	if _, err := userDoc.Set(r.Context(), profile); err != nil {
		s.log.Error("failed to save user profile", "user", userID, "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "failed to save user", "FIRESTORE_ERROR")
		return
	}

	// Issue GAL JWT
	tokenStr, _, err := s.issueToken(userID, orgID, email, name, []string{"firebase"}, tokenExpiry)
	if err != nil {
		s.log.Error("failed to issue token", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "token issuance failed", "TOKEN_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, tokenResponse{
		Token:        tokenStr,
		ExpiresIn:    int64(tokenExpiry.Seconds()),
		TokenType:    "Bearer",
	})
}

// handleTokenExchange exchanges a provider OAuth code for a GAL token.
func (s *authService) handleTokenExchange(w http.ResponseWriter, r *http.Request) {
	var req tokenExchangeRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.Provider == "" || req.Code == "" {
		handler.RespondError(w, http.StatusBadRequest, "provider and code required", "MISSING_PARAMETERS")
		return
	}

	provider, ok := s.providerClients[req.Provider]
	if !ok {
		handler.RespondError(w, http.StatusBadRequest, "unsupported provider", "INVALID_PROVIDER")
		return
	}

	// Exchange the authorization code for an access token
	tokenData, err := exchangeOAuthCode(provider.TokenURL, provider.ClientID, provider.ClientSecret, req.Code, provider.RedirectURL)
	if err != nil {
		s.log.Warn("oauth token exchange failed", "provider", req.Provider, "error", err)
		handler.RespondError(w, http.StatusBadGateway, "token exchange failed", "PROVIDER_ERROR")
		return
	}

	// Resolve user identity from the provider token
	userID, email, name, err := s.resolveProviderIdentity(r.Context(), req.Provider, tokenData["access_token"])
	if err != nil {
		s.log.Warn("failed to resolve provider identity", "provider", req.Provider, "error", err)
		handler.RespondError(w, http.StatusUnauthorized, "failed to resolve identity", "IDENTITY_ERROR")
		return
	}

	// Upsert user profile
	now := time.Now()
	userDoc := s.store.Doc("users", userID)
	userSnap, err := userDoc.Get(r.Context())
	var profile UserProfile
	if err != nil {
		profile = UserProfile{
			ID:        userID,
			Email:     email,
			Name:      name,
			CreatedAt: now,
			UpdatedAt: now,
		}
	} else {
		userSnap.DataTo(&profile)
		profile.Email = email
		if name != "" {
			profile.Name = name
		}
	}
	profile.UpdatedAt = now

	if _, err := userDoc.Set(r.Context(), profile); err != nil {
		s.log.Error("failed to save user", "user", userID, "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	tokenStr, _, err := s.issueToken(userID, profile.OrgID, email, name, []string{req.Provider}, tokenExpiry)
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "token issuance failed", "TOKEN_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, tokenResponse{
		Token:     tokenStr,
		ExpiresIn: int64(tokenExpiry.Seconds()),
		TokenType: "Bearer",
	})
}

// handleRefresh validates an existing (possibly expired) token and issues a new one.
func (s *authService) handleRefresh(w http.ResponseWriter, r *http.Request) {
	// Extract token from Authorization header
	authHeader := r.Header.Get("Authorization")
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		handler.RespondError(w, http.StatusUnauthorized, "missing authorization", "NOT_AUTHENTICATED")
		return
	}
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

	// Parse the token without validating expiry
	parser := jwt.NewParser(jwt.WithoutClaimsValidation())
	token, err := parser.Parse(tokenStr, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(s.jwtSecret), nil
	})
	if err != nil {
		handler.RespondError(w, http.StatusUnauthorized, "invalid token", "INVALID_TOKEN")
		return
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		handler.RespondError(w, http.StatusUnauthorized, "invalid claims", "INVALID_TOKEN")
		return
	}

	// Check revocation
	if jti, ok := claims["jti"].(string); ok && jti != "" {
		if s.isTokenRevoked(jti) {
			handler.RespondError(w, http.StatusUnauthorized, "token revoked", "TOKEN_REVOKED")
			return
		}
	}

	// Check grace period for expired tokens
	if expClaim, ok := claims["exp"].(float64); ok {
		expTime := time.Unix(int64(expClaim), 0)
		if time.Now().After(expTime.Add(refreshGrace)) {
			handler.RespondError(w, http.StatusUnauthorized, "token beyond grace period", "SESSION_EXPIRED")
			return
		}
	}

	userID, _ := claims["user_id"].(string)
	orgID, _ := claims["org_id"].(string)
	email, _ := claims["email"].(string)
	name, _ := claims["name"].(string)
	providersRaw, _ := claims["providers"].([]interface{})
	var providers []string
	for _, p := range providersRaw {
		if ps, ok := p.(string); ok {
			providers = append(providers, ps)
		}
	}

	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "invalid user in token", "INVALID_TOKEN")
		return
	}

	// Issue new token
	newToken, _, err := s.issueToken(userID, orgID, email, name, providers, tokenExpiry)
	if err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "token refresh failed", "TOKEN_ERROR")
		return
	}

	// Revoke the old token
	if jti, ok := claims["jti"].(string); ok && jti != "" {
		s.revokeToken(jti, time.Unix(int64(claims["exp"].(float64)), 0))
	}

	handler.RespondJSON(w, http.StatusOK, tokenResponse{
		Token:     newToken,
		ExpiresIn: int64(tokenExpiry.Seconds()),
		TokenType: "Bearer",
	})
}

// handleSession returns the current session info.
func (s *authService) handleSession(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	_, claims, _ := jwtauth.FromContext(r.Context())
	email, _ := claims["email"].(string)
	name, _ := claims["name"].(string)
	orgID, _ := claims["org_id"].(string)
	providersRaw, _ := claims["providers"].([]interface{})
	var providers []string
	for _, p := range providersRaw {
		if ps, ok := p.(string); ok {
			providers = append(providers, ps)
		}
	}
	expClaim, _ := claims["exp"].(float64)

	handler.RespondJSON(w, http.StatusOK, sessionResponse{
		UserID:    userID,
		Email:     email,
		Name:      name,
		OrgID:     orgID,
		Providers: providers,
		ExpiresAt: int64(expClaim),
	})
}

// handleLogout revokes the current session token.
func (s *authService) handleLogout(w http.ResponseWriter, r *http.Request) {
	_, claims, _ := jwtauth.FromContext(r.Context())
	if claims == nil {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	if jti, ok := claims["jti"].(string); ok && jti != "" {
		var exp time.Time
		if expClaim, ok := claims["exp"].(float64); ok {
			exp = time.Unix(int64(expClaim), 0).Add(refreshGrace)
		} else {
			exp = time.Now().Add(refreshGrace)
		}
		s.revokeToken(jti, exp)
	}

	handler.RespondJSON(w, http.StatusOK, map[string]bool{"success": true})
}

// handleOAuthInitiate redirects the user to the provider's OAuth authorization page.
func (s *authService) handleOAuthInitiate(w http.ResponseWriter, r *http.Request) {
	provider := chi.URLParam(r, "provider")
	if provider == "" {
		handler.RespondError(w, http.StatusBadRequest, "provider required", "MISSING_PARAMETERS")
		return
	}

	cfg, ok := s.providerClients[provider]
	if !ok {
		handler.RespondError(w, http.StatusBadRequest, "unsupported provider", "INVALID_PROVIDER")
		return
	}

	if cfg.ClientID == "" {
		handler.RespondError(w, http.StatusServiceUnavailable, "provider not configured", "OAUTH_NOT_CONFIGURED")
		return
	}

	// Generate CSRF state
	state := uuid.New().String()

	authURL, _ := url.Parse(cfg.AuthURL)
	params := url.Values{
		"client_id":    {cfg.ClientID},
		"redirect_uri": {cfg.RedirectURL},
		"response_type": {"code"},
		"scope":        {cfg.Scopes},
		"state":        {state},
	}

	// Optional custom redirect URI from request body
	var req oauthInitiateRequest
	if err := handler.DecodeJSON(r, &req); err == nil && req.RedirectURI != "" {
		params.Set("redirect_uri", req.RedirectURI)
	}

	authURL.RawQuery = params.Encode()

	handler.RespondJSON(w, http.StatusOK, map[string]string{
		"authUrl": authURL.String(),
		"state":   state,
	})
}

// handleOAuthCallback handles the OAuth provider's callback.
func (s *authService) handleOAuthCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	provider := r.URL.Query().Get("provider")

	if code == "" {
		errorStr := r.URL.Query().Get("error")
		s.log.Warn("oauth callback error", "error", errorStr, "state", state)
		redirectURL := getDashboardURL() + "/login?error=" + url.QueryEscape(errorStr)
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	// We need the provider to know which client to use.
	// If not in query, guess from state (not ideal, but functional).
	if provider == "" {
		if parts := strings.SplitN(state, ":", 2); len(parts) == 2 {
			provider = parts[0]
		}
	}
	if provider == "" {
		handler.RespondError(w, http.StatusBadRequest, "provider not determined", "MISSING_PARAMETERS")
		return
	}

	cfg, ok := s.providerClients[provider]
	if !ok {
		handler.RespondError(w, http.StatusBadRequest, "unsupported provider", "INVALID_PROVIDER")
		return
	}

	// Exchange code for token
	tokenData, err := exchangeOAuthCode(cfg.TokenURL, cfg.ClientID, cfg.ClientSecret, code, cfg.RedirectURL)
	if err != nil {
		s.log.Error("oauth token exchange failed", "provider", provider, "error", err)
		redirectURL := getDashboardURL() + "/login?error=token_exchange_failed"
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	accessToken := tokenData["access_token"]

	// Resolve identity — for gmail, prefer the original GAL userId from state storage.
	var userID, email, name string
	var identityErr error
	if provider == "gmail" {
		stateDoc, stateErr := s.store.Collection("oauth_states").Doc(state).Get(r.Context())
		if stateErr == nil {
			var stateData map[string]any
			stateDoc.DataTo(&stateData)
			if origUserID, ok := stateData["userId"].(string); ok && origUserID != "" {
				userID = origUserID
				email = origUserID + "@gal.run"
				name = "Gmail User"
			}
		}
	}
	if userID == "" {
		userID, email, name, identityErr = s.resolveProviderIdentity(r.Context(), provider, accessToken)
		if identityErr != nil {
			s.log.Error("identity resolution failed", "provider", provider, "error", identityErr)
			redirectURL := getDashboardURL() + "/login?error=identity_failed"
			http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
			return
		}
	}

	// Upsert user and issue token
	now := time.Now()
	userDoc := s.store.Doc("users", userID)
	userSnap, err := userDoc.Get(r.Context())
	var profile UserProfile
	if err != nil {
		profile = UserProfile{
			ID:        userID,
			Email:     email,
			Name:      name,
			CreatedAt: now,
			UpdatedAt: now,
		}
	} else {
		userSnap.DataTo(&profile)
		profile.Email = email
		if name != "" {
			profile.Name = name
		}
		profile.UpdatedAt = now
	}
	if _, err := userDoc.Set(r.Context(), profile); err != nil {
		s.log.Error("failed to save user", "error", err)
		redirectURL := getDashboardURL() + "/login?error=save_failed"
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	// Store the OAuth credential for agent use (gmail, etc.)
	if accessToken != "" {
		encToken, encErr := encrypt(accessToken, s.encryptionKey)
		if encErr == nil {
			prefix := accessToken
			if len(prefix) > 8 { prefix = prefix[:8] }
			cred := Credential{
				ID:           uuid.New().String(),
				UserID:       userID,
				Provider:     provider,
				TokenPrefix:  prefix,
				EncryptedToken: encToken,
				CreatedAt:    now,
				UpdatedAt:    now,
			}
			s.store.Collection("credentials").Doc(cred.ID).Set(r.Context(), cred)
		}
	}

	tokenStr, _, err := s.issueToken(userID, profile.OrgID, email, name, []string{provider}, tokenExpiry)
	if err != nil {
		redirectURL := getDashboardURL() + "/login?error=token_error"
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	// Check if request accepts JSON (API client) vs redirect (browser)
	accept := r.Header.Get("Accept")
	if strings.Contains(accept, "application/json") {
		handler.RespondJSON(w, http.StatusOK, tokenResponse{
			Token:     tokenStr,
			ExpiresIn: int64(tokenExpiry.Seconds()),
			TokenType: "Bearer",
		})
		return
	}

	redirectURL := getDashboardURL() + "/auth/callback?token=" + url.QueryEscape(tokenStr)
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

// exchangeOAuthCode exchanges an authorization code for tokens at the provider's token endpoint.
func exchangeOAuthCode(tokenURL, clientID, clientSecret, code, redirectURI string) (map[string]string, error) {
	data := url.Values{
		"grant_type":   {"authorization_code"},
		"code":         {code},
		"client_id":    {clientID},
		"client_secret": {clientSecret},
		"redirect_uri":  {redirectURI},
	}

	resp, err := http.PostForm(tokenURL, data)
	if err != nil {
		return nil, fmt.Errorf("token request failed: %w", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read token response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("token endpoint returned %d: %s", resp.StatusCode, string(body))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("parse token response: %w", err)
	}

	tokenData := make(map[string]string)
	for _, key := range []string{"access_token", "refresh_token", "token_type", "scope", "id_token"} {
		if v, ok := result[key].(string); ok {
			tokenData[key] = v
		}
	}
	if expiresIn, ok := result["expires_in"].(float64); ok {
		tokenData["expires_in"] = fmt.Sprintf("%.0f", expiresIn)
	}

	return tokenData, nil
}

// resolveProviderIdentity fetches user info from the provider's userinfo endpoint.
func (s *authService) resolveProviderIdentity(ctx context.Context, provider, accessToken string) (userID, email, name string, err error) {
	switch provider {
	case "claude":
		return resolveClaudeIdentity(accessToken)
	case "codex":
		return resolveCodexIdentity(accessToken)
	case "gemini", "gmail":
		return resolveGoogleIdentity(accessToken)
	default:
		return "", "", "", fmt.Errorf("unknown provider: %s", provider)
	}
}

func resolveClaudeIdentity(accessToken string) (string, string, string, error) {
	// Anthropic doesn't have a standard userinfo endpoint for API keys
	// Generate a synthetic identity based on the token hash
	hash := sha256.Sum256([]byte(accessToken))
	userID := fmt.Sprintf("claude:%s", hexEncode(hash[:8]))
	email := userID + "@claude.ai"
	return userID, email, "Claude User", nil
}

type codexUserInfo struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

func resolveCodexIdentity(accessToken string) (string, string, string, error) {
	req, _ := http.NewRequest("GET", "https://api.openai.com/v1/me", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		// Fall back to synthetic identity
		hash := sha256.Sum256([]byte(accessToken))
		userID := fmt.Sprintf("codex:%s", hexEncode(hash[:8]))
		return userID, userID + "@codex.ai", "Codex User", nil
	}
	defer resp.Body.Close()

	var info codexUserInfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil || info.ID == "" {
		hash := sha256.Sum256([]byte(accessToken))
		userID := fmt.Sprintf("codex:%s", hexEncode(hash[:8]))
		return userID, userID + "@codex.ai", "Codex User", nil
	}
	return "codex:" + info.ID, info.Email, info.Name, nil
}

func resolveGoogleIdentity(accessToken string) (string, string, string, error) {
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v2/userinfo", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		hash := sha256.Sum256([]byte(accessToken))
		userID := fmt.Sprintf("gemini:%s", hexEncode(hash[:8]))
		return userID, userID + "@gemini.ai", "Gemini User", nil
	}
	defer resp.Body.Close()

	var info struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil || info.ID == "" {
		hash := sha256.Sum256([]byte(accessToken))
		userID := fmt.Sprintf("gemini:%s", hexEncode(hash[:8]))
		return userID, userID + "@gemini.ai", "Gemini User", nil
	}
	return "google:" + info.ID, info.Email, info.Name, nil
}

// ---------------------------------------------------------------------------
// SAML SSO handlers
// ---------------------------------------------------------------------------

// handleSSOInit initiates a SAML SSO login for a given org.
func (s *authService) handleSSOInit(w http.ResponseWriter, r *http.Request) {
	var req ssoInitRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.OrgName == "" {
		handler.RespondError(w, http.StatusBadRequest, "orgName required", "MISSING_PARAMETERS")
		return
	}

	// Load the org's SSO config from Firestore
	doc, err := s.store.Doc("sso_configs", req.OrgName).Get(r.Context())
	if err != nil {
		s.log.Warn("sso config not found", "org", req.OrgName, "error", err)
		handler.RespondError(w, http.StatusNotFound, "SSO not configured for org", "SSO_NOT_CONFIGURED")
		return
	}

	var config SSOConfig
	if err := doc.DataTo(&config); err != nil {
		handler.RespondError(w, http.StatusInternalServerError, "failed to read config", "FIRESTORE_ERROR")
		return
	}

	if !config.Enabled {
		handler.RespondError(w, http.StatusForbidden, "SSO is disabled for this org", "SSO_DISABLED")
		return
	}

	sp, err := s.getSAMLServiceProvider(req.OrgName, &config)
	if err != nil {
		s.log.Error("failed to create SAML SP", "org", req.OrgName, "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "SAML configuration error", "SAML_CONFIG_ERROR")
		return
	}

	// Generate authentication request
	authnRequest, err := sp.MakeAuthenticationRequest(sp.AcsURL.String(), saml.HTTPPostBinding, saml.HTTPRedirectBinding)
	if err != nil {
		s.log.Error("failed to make SAML auth request", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "SAML request failed", "SAML_ERROR")
		return
	}

	// Get the redirect URL for binding
	relayState := uuid.New().String()
	redirectURL, err := authnRequest.Redirect(relayState, sp)
	if err != nil {
		s.log.Error("failed to get SAML redirect URL", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "SAML redirect failed", "SAML_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]string{
		"redirectUrl": redirectURL.String(),
		"relayState":  relayState,
	})
}

// handleSSOCallback consumes a SAML assertion from the IdP.
func (s *authService) handleSSOCallback(w http.ResponseWriter, r *http.Request) {
	var req ssoCallbackRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.OrgName == "" || req.SAMLResponse == "" {
		handler.RespondError(w, http.StatusBadRequest, "orgName and samlResponse required", "MISSING_PARAMETERS")
		return
	}

	// Load the org's SSO config
	doc, err := s.store.Doc("sso_configs", req.OrgName).Get(r.Context())
	if err != nil {
		s.log.Warn("sso config not found", "org", req.OrgName)
		redirectURL := getDashboardURL() + "/login?error=sso_not_configured"
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	var config SSOConfig
	if err := doc.DataTo(&config); err != nil {
		http.Redirect(w, r, getDashboardURL()+"/login?error=config_error", http.StatusTemporaryRedirect)
		return
	}

	sp, err := s.getSAMLServiceProvider(req.OrgName, &config)
	if err != nil {
		s.log.Error("failed to create SAML SP", "error", err)
		http.Redirect(w, r, getDashboardURL()+"/login?error=saml_config_error", http.StatusTemporaryRedirect)
		return
	}

	// Parse the SAML response
	assertion, err := sp.ParseResponse(r, s.getPossibleRequestIDs())
	if err != nil {
		s.log.Warn("saml response validation failed", "error", err)
		redirectURL := getDashboardURL() + "/login?error=saml_invalid_assertion"
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	// Extract user attributes from assertion
	email := ""
	if assertion.Subject != nil && assertion.Subject.NameID != nil {
		email = assertion.Subject.NameID.Value
	}

	// Try to get email from attribute statements
	for _, attr := range assertion.AttributeStatements {
		for _, attribute := range attr.Attributes {
			attrName := attribute.FriendlyName
			if attrName == "" {
				attrName = attribute.Name
			}
			if attrName == config.EmailAttribute || attrName == "email" || attrName == "Email" {
				if len(attribute.Values) > 0 {
					email = attribute.Values[0].Value
				}
			}
		}
	}

	if email == "" || !strings.Contains(email, "@") {
		s.log.Warn("no valid email in SAML assertion", "org", req.OrgName)
		redirectURL := getDashboardURL() + "/login?error=sso_missing_email"
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	// Create SSO user identity
	userID := fmt.Sprintf("sso:%s:%s", req.OrgName, email)
	name := email[:strings.Index(email, "@")] // default from email

	// Upsert user profile
	now := time.Now()
	userDoc := s.store.Doc("users", userID)
	userSnap, err := userDoc.Get(r.Context())
	var profile UserProfile
	if err != nil {
		profile = UserProfile{
			ID:        userID,
			Email:     email,
			Name:      name,
			OrgID:     req.OrgName,
			Role:      "member",
			CreatedAt: now,
			UpdatedAt: now,
		}
	} else {
		userSnap.DataTo(&profile)
		profile.UpdatedAt = now
	}
	profile.OrgID = req.OrgName
	if _, err := userDoc.Set(r.Context(), profile); err != nil {
		s.log.Error("failed to save sso user", "error", err)
		redirectURL := getDashboardURL() + "/login?error=save_failed"
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	// Issue JWT
	tokenStr, _, err := s.issueToken(userID, req.OrgName, email, profile.Name, []string{"sso"}, tokenExpiry)
	if err != nil {
		redirectURL := getDashboardURL() + "/login?error=token_error"
		http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
		return
	}

	redirectURL := getDashboardURL() + "/auth/callback?token=" + url.QueryEscape(tokenStr)
	http.Redirect(w, r, redirectURL, http.StatusTemporaryRedirect)
}

// getPossibleRequestIDs returns pending AuthnRequest IDs for SAML response validation.
func (s *authService) getPossibleRequestIDs() []string {
	return nil // In production, track pending AuthnRequests
}

// ---------------------------------------------------------------------------
// User handlers
// ---------------------------------------------------------------------------

func (s *authService) handleGetMe(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	doc, err := s.store.Doc("users", userID).Get(r.Context())
	if err != nil {
		// Return a basic response from JWT claims
		_, claims, _ := jwtauth.FromContext(r.Context())
		email, _ := claims["email"].(string)
		name, _ := claims["name"].(string)
		handler.RespondJSON(w, http.StatusOK, UserProfile{
			ID:    userID,
			Email: email,
			Name:  name,
		})
		return
	}

	var profile UserProfile
	doc.DataTo(&profile)
	handler.RespondJSON(w, http.StatusOK, profile)
}

func (s *authService) handleUpdateMe(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	var req updateMeRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	updates := []cfirestore.Update{
		{Path: "updatedAt", Value: time.Now()},
	}
	if req.Name != "" {
		updates = append(updates, cfirestore.Update{Path: "name", Value: req.Name})
	}
	if req.AvatarURL != "" {
		updates = append(updates, cfirestore.Update{Path: "avatarUrl", Value: req.AvatarURL})
	}

	_, err := s.store.Doc("users", userID).Update(r.Context(), updates)
	if err != nil {
		s.log.Error("failed to update user", "user", userID, "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "update failed", "FIRESTORE_ERROR")
		return
	}

	doc, _ := s.store.Doc("users", userID).Get(r.Context())
	var profile UserProfile
	if doc != nil {
		doc.DataTo(&profile)
	}
	handler.RespondJSON(w, http.StatusOK, profile)
}

func (s *authService) handleGetSettings(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	doc, err := s.store.Doc("user_settings", userID).Get(r.Context())
	if err != nil {
		// Return default empty settings
		handler.RespondJSON(w, http.StatusOK, UserSettings{
			UserID: userID,
		})
		return
	}

	var settings UserSettings
	doc.DataTo(&settings)
	handler.RespondJSON(w, http.StatusOK, settings)
}

func (s *authService) handleUpdateSettings(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	var body map[string]interface{}
	if err := handler.DecodeJSON(r, &body); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	// Only allow specific fields
	now := time.Now()

	// Fetch existing settings or create new
	docRef := s.store.Doc("user_settings", userID)
	existingSnap, _ := docRef.Get(r.Context())

	var settings UserSettings
	if existingSnap != nil && existingSnap.Exists() {
		existingSnap.DataTo(&settings)
	}

	settings.UserID = userID
	settings.UpdatedAt = now

	if galCode, ok := body["galCode"].(map[string]interface{}); ok {
		if settings.GalCode == nil {
			settings.GalCode = &GalCodePrefs{}
		}
		if v, ok := galCode["collectInteractiveSessions"].(bool); ok {
			settings.GalCode.CollectInteractiveSessions = v
		}
	}

	_, err := docRef.Set(r.Context(), settings)
	if err != nil {
		s.log.Error("failed to save settings", "user", userID, "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, settingsResponse{
		Success:  true,
		Settings: &settings,
	})
}

func (s *authService) handleAcceptTerms(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	var req acceptTermsRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}
	if req.TermsVersion == "" {
		req.TermsVersion = "1.0"
	}

	now := time.Now()
	_, err := s.store.Doc("users", userID).Set(r.Context(), map[string]interface{}{
		"termsAcceptedAt": now,
		"termsVersion":    req.TermsVersion,
		"updatedAt":       now,
	}, cfirestore.MergeAll)
	if err != nil {
		s.log.Error("failed to save terms acceptance", "user", userID, "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"termsAcceptedAt": now.Format(time.RFC3339),
		"termsVersion":    req.TermsVersion,
	})
}

// ---------------------------------------------------------------------------
// Credential handlers
// ---------------------------------------------------------------------------

func (s *authService) handleListCredentials(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	iter := s.store.Collection("credentials").Where("userId", "==", userID).Documents(r.Context())
	var credentials []map[string]interface{}
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		data := doc.Data()
		// Strip encrypted token from response
		delete(data, "encryptedToken")
		data["id"] = doc.Ref.ID
		credentials = append(credentials, data)
	}

	if credentials == nil {
		credentials = []map[string]interface{}{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"credentials": credentials,
	})
}

func (s *authService) handleStoreCredential(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	var req storeCredentialRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.Provider == "" || req.AccessToken == "" {
		handler.RespondError(w, http.StatusBadRequest, "provider and accessToken required", "MISSING_PARAMETERS")
		return
	}

	// Validate provider
	validProviders := map[string]bool{"claude": true, "codex": true, "gemini": true, "gmail": true}
	if !validProviders[req.Provider] {
		handler.RespondError(w, http.StatusBadRequest, "invalid provider; must be claude, codex, or gemini", "INVALID_PROVIDER")
		return
	}

	// Encrypt the access token
	encryptedToken, err := encrypt(req.AccessToken, s.encryptionKey)
	if err != nil {
		s.log.Error("encryption failed", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "encryption failed", "ENCRYPTION_ERROR")
		return
	}

	tokenPrefix := getTokenPrefix(req.AccessToken)

	// Find existing credential for this user+provider (upsert)
	iter := s.store.Collection("credentials").
		Where("userId", "==", userID).
		Where("provider", "==", req.Provider).
		Limit(1).
		Documents(r.Context())

	now := time.Now()
	existingDoc, err := iter.Next()
	if err == nil && existingDoc != nil {
		// Update existing
		updates := []cfirestore.Update{
			{Path: "encryptedToken", Value: encryptedToken},
			{Path: "tokenPrefix", Value: tokenPrefix},
			{Path: "updatedAt", Value: now},
		}
		if req.ExpiryDate > 0 {
			updates = append(updates, cfirestore.Update{Path: "expiryDate", Value: req.ExpiryDate})
		}
		_, err := existingDoc.Ref.Update(r.Context(), updates)
		if err != nil {
			s.log.Error("failed to update credential", "error", err)
			handler.RespondError(w, http.StatusInternalServerError, "update failed", "FIRESTORE_ERROR")
			return
		}
		handler.RespondJSON(w, http.StatusOK, map[string]interface{}{
			"success":     true,
			"tokenPrefix": tokenPrefix,
			"provider":    req.Provider,
		})
		return
	}

	// Create new
	cred := Credential{
		ID:             uuid.New().String(),
		UserID:         userID,
		Provider:       req.Provider,
		EncryptedToken: encryptedToken,
		TokenPrefix:    tokenPrefix,
		ExpiryDate:     req.ExpiryDate,
		CreatedAt:      now,
		UpdatedAt:      now,
	}

	_, _, err = s.store.Collection("credentials").Add(r.Context(), cred)
	if err != nil {
		s.log.Error("failed to create credential", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusCreated, map[string]interface{}{
		"success":     true,
		"tokenPrefix": tokenPrefix,
		"provider":    req.Provider,
	})
}

func (s *authService) handleDeleteCredential(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	credID := chi.URLParam(r, "id")
	if credID == "" {
		handler.RespondError(w, http.StatusBadRequest, "credential id required", "MISSING_PARAMETERS")
		return
	}

	docRef := s.store.Collection("credentials").Doc(credID)
	snap, err := docRef.Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "credential not found", "NOT_FOUND")
		return
	}

	var cred Credential
	snap.DataTo(&cred)
	if cred.UserID != userID {
		handler.RespondError(w, http.StatusForbidden, "not your credential", "FORBIDDEN")
		return
	}

	_, err = docRef.Delete(r.Context())
	if err != nil {
		s.log.Error("failed to delete credential", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "delete failed", "FIRESTORE_ERROR")
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"success":  true,
		"id":       credID,
		"provider": cred.Provider,
	})
}

func (s *authService) handleValidateCredential(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	credID := chi.URLParam(r, "id")
	if credID == "" {
		handler.RespondError(w, http.StatusBadRequest, "credential id required", "MISSING_PARAMETERS")
		return
	}

	docRef := s.store.Collection("credentials").Doc(credID)
	snap, err := docRef.Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "credential not found", "NOT_FOUND")
		return
	}

	var cred Credential
	snap.DataTo(&cred)
	if cred.UserID != userID {
		handler.RespondError(w, http.StatusForbidden, "not your credential", "FORBIDDEN")
		return
	}

	if cred.EncryptedToken == "" {
		handler.RespondJSON(w, http.StatusOK, validateCredentialResponse{
			Valid:    false,
			Provider: cred.Provider,
			Method:   "none",
			Error:    "no stored token",
		})
		return
	}

	// Decrypt and validate against the provider
	plaintext, err := decrypt(cred.EncryptedToken, s.encryptionKey)
	if err != nil {
		handler.RespondJSON(w, http.StatusOK, validateCredentialResponse{
			Valid:    false,
			Provider: cred.Provider,
			Method:   "decrypt",
			Error:    "decryption failed",
		})
		return
	}

	// Check expiry
	if cred.ExpiryDate > 0 && time.Now().Unix() > cred.ExpiryDate {
		handler.RespondJSON(w, http.StatusOK, validateCredentialResponse{
			Valid:    false,
			Provider: cred.Provider,
			Method:   "expiry",
			Error:    "credential expired",
		})
		return
	}

	// Attempt live validation with the provider API
	valid, err := validateWithProvider(cred.Provider, plaintext)
	if err != nil {
		// If live validation fails, fall back to checking it's decryptable
		handler.RespondJSON(w, http.StatusOK, validateCredentialResponse{
			Valid:    true,
			Provider: cred.Provider,
			Method:   "decrypt_only",
		})
		return
	}

	resp := validateCredentialResponse{
		Valid:    valid,
		Provider: cred.Provider,
		Method:   "live",
	}
	if cred.ExpiryDate > 0 {
		resp.ExpiresAt = cred.ExpiryDate
	}
	if !valid {
		resp.Error = "credential rejected by provider"
	}

	handler.RespondJSON(w, http.StatusOK, resp)
}

// validateWithProvider performs a live API call to validate the credential with the provider.
func validateWithProvider(provider, token string) (bool, error) {
	switch provider {
	case "claude":
		return validateClaudeToken(token)
	case "codex":
		return validateCodexToken(token)
	case "gemini":
		return validateGeminiToken(token)
	default:
		return false, fmt.Errorf("unknown provider: %s", provider)
	}
}

func validateClaudeToken(token string) (bool, error) {
	req, _ := http.NewRequest("GET", "https://api.anthropic.com/v1/models", nil)
	req.Header.Set("x-api-key", token)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK, nil
}

func validateCodexToken(token string) (bool, error) {
	req, _ := http.NewRequest("GET", "https://api.openai.com/v1/models", nil)
	req.Header.Set("Authorization", "Bearer "+token)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK, nil
}

func validateGeminiToken(token string) (bool, error) {
	req, _ := http.NewRequest("GET", "https://www.googleapis.com/oauth2/v1/tokeninfo?access_token="+url.QueryEscape(token), nil)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK, nil
}

// ---------------------------------------------------------------------------
// Consent handlers
// ---------------------------------------------------------------------------

func (s *authService) handleListConsent(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	iter := s.store.Collection("consent_records").
		Where("userId", "==", userID).
		OrderBy("consentedAt", cfirestore.Desc).
		Limit(200).
		Documents(r.Context())

	var records []map[string]interface{}
	for {
		doc, err := iter.Next()
		if err != nil {
			break
		}
		data := doc.Data()
		data["id"] = doc.Ref.ID
		delete(data, "ipHash")
		delete(data, "userAgent")
		records = append(records, data)
	}

	if records == nil {
		records = []map[string]interface{}{}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"consents": records,
	})
}

func (s *authService) handleGrantConsent(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	var req consentRequest
	if err := handler.DecodeJSON(r, &req); err != nil {
		handler.RespondError(w, http.StatusBadRequest, "invalid request body", "BAD_REQUEST")
		return
	}

	if req.Provider == "" || req.PolicyVersion == "" || req.PrivacyVersion == "" {
		handler.RespondError(w, http.StatusBadRequest, "provider, policyVersion, privacyVersion required", "MISSING_PARAMETERS")
		return
	}

	// Hash the client IP for privacy
	clientIP := r.RemoteAddr
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		clientIP = strings.Split(fwd, ",")[0]
	}
	ipHashBytes := sha256.Sum256([]byte("gal-consent:" + clientIP))
	ipHash := hexEncode(ipHashBytes[:])
	userAgent := r.Header.Get("User-Agent")
	if len(userAgent) > 512 {
		userAgent = userAgent[:512]
	}

	now := time.Now()
	record := ConsentRecord{
		ID:             uuid.New().String(),
		UserID:         userID,
		Provider:       req.Provider,
		PolicyVersion:  req.PolicyVersion,
		PrivacyVersion: req.PrivacyVersion,
		ConsentedAt:    now,
		IPHash:         ipHash,
		UserAgent:      html.EscapeString(userAgent),
	}

	_, err := s.store.Collection("consent_records").Doc(record.ID).Set(r.Context(), record)
	if err != nil {
		s.log.Error("failed to save consent", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "save failed", "FIRESTORE_ERROR")
		return
	}

	s.log.Info("consent recorded",
		"user", userID,
		"provider", req.Provider,
		"policyVersion", req.PolicyVersion,
		"consentId", record.ID,
	)

	handler.RespondJSON(w, http.StatusCreated, map[string]interface{}{
		"consentId":      record.ID,
		"provider":       req.Provider,
		"consentedAt":    now.Format(time.RFC3339),
		"policyVersion":  req.PolicyVersion,
		"privacyVersion": req.PrivacyVersion,
	})
}

func (s *authService) handleRevokeConsent(w http.ResponseWriter, r *http.Request) {
	userID := s.userIDFromCtx(r.Context())
	if userID == "" {
		handler.RespondError(w, http.StatusUnauthorized, "not authenticated", "NOT_AUTHENTICATED")
		return
	}

	consentID := chi.URLParam(r, "id")
	if consentID == "" {
		handler.RespondError(w, http.StatusBadRequest, "consent id required", "MISSING_PARAMETERS")
		return
	}

	docRef := s.store.Collection("consent_records").Doc(consentID)
	snap, err := docRef.Get(r.Context())
	if err != nil {
		handler.RespondError(w, http.StatusNotFound, "consent record not found", "NOT_FOUND")
		return
	}

	var record ConsentRecord
	snap.DataTo(&record)
	if record.UserID != userID {
		handler.RespondError(w, http.StatusForbidden, "not your consent record", "FORBIDDEN")
		return
	}

	if record.RevokedAt != nil {
		handler.RespondJSON(w, http.StatusOK, map[string]interface{}{
			"consentId": consentID,
			"revokedAt": record.RevokedAt.Format(time.RFC3339),
		})
		return
	}

	now := time.Now()
	_, err = docRef.Update(r.Context(), []cfirestore.Update{
		{Path: "revokedAt", Value: now},
	})
	if err != nil {
		s.log.Error("failed to revoke consent", "error", err)
		handler.RespondError(w, http.StatusInternalServerError, "revoke failed", "FIRESTORE_ERROR")
		return
	}

	s.log.Info("consent revoked",
		"user", userID,
		"consentId", consentID,
		"provider", record.Provider,
	)

	handler.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"consentId": consentID,
		"revokedAt": now.Format(time.RFC3339),
	})
}

