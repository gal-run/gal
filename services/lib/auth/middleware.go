// Package auth provides JWT validation middleware shared across all Go microservices.
// Tokens are Firebase Auth JWTs issued by the existing auth flow — no change to token format.
package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/go-chi/jwtauth/v5"
	"github.com/lestrrat-go/jwx/v2/jwt"
)

type contextKey string

const (
	UserIDKey    contextKey = "user_id"
	OrgIDKey     contextKey = "org_id"
	UserEmailKey contextKey = "user_email"
	TokenKey     contextKey = "token"
	RawTokenKey  contextKey = "raw_token"
)

// Middleware validates Firebase Auth JWTs and extracts user/org claims.
// Uses chi jwtauth with the Firebase public key set.
func Middleware(ja *jwtauth.JWTAuth) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token, _, err := jwtauth.FromContext(r.Context())
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}

			if token == nil {
				http.Error(w, `{"error":"missing token"}`, http.StatusUnauthorized)
				return
			}

			claims := token.PrivateClaims()
			ctx := r.Context()

			if sub, ok := claims["user_id"].(string); ok {
				ctx = context.WithValue(ctx, UserIDKey, sub)
			}
			if org, ok := claims["org_id"].(string); ok {
				ctx = context.WithValue(ctx, OrgIDKey, org)
			}
			if email, ok := claims["email"].(string); ok {
				ctx = context.WithValue(ctx, UserEmailKey, email)
			}
			ctx = context.WithValue(ctx, TokenKey, token)
			// Store raw token from Authorization header for downstream propagation.
			ctx = context.WithValue(ctx, RawTokenKey, extractBearerToken(r.Header.Get("Authorization")))

			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// OptionalMiddleware validates the token if present but doesn't reject missing tokens.
func OptionalMiddleware(ja *jwtauth.JWTAuth) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
				next.ServeHTTP(w, r)
				return
			}
			Middleware(ja)(next).ServeHTTP(w, r)
		})
	}
}

// UserID extracts the authenticated user ID from context.
func UserID(ctx context.Context) string {
	if v, ok := ctx.Value(UserIDKey).(string); ok {
		return v
	}
	return ""
}

// OrgID extracts the organization ID from context.
func OrgID(ctx context.Context) string {
	if v, ok := ctx.Value(OrgIDKey).(string); ok {
		return v
	}
	return ""
}

// UserEmail extracts the user email from context.
func UserEmail(ctx context.Context) string {
	if v, ok := ctx.Value(UserEmailKey).(string); ok {
		return v
	}
	return ""
}

// Token extracts the parsed JWT token from context.
func Token(ctx context.Context) jwt.Token {
	if v, ok := ctx.Value(TokenKey).(jwt.Token); ok {
		return v
	}
	return nil
}

// RawToken extracts the raw JWT token string from context.
func RawToken(ctx context.Context) string {
	if v, ok := ctx.Value(RawTokenKey).(string); ok {
		return v
	}
	return ""
}

// SetUserID returns a context with the user_id value set.
func SetUserID(ctx context.Context, userID string) context.Context {
	return context.WithValue(ctx, UserIDKey, userID)
}

// SetOrgID returns a context with the org_id value set.
func SetOrgID(ctx context.Context, orgID string) context.Context {
	return context.WithValue(ctx, OrgIDKey, orgID)
}

// SetUserEmail returns a context with the user_email value set.
func SetUserEmail(ctx context.Context, email string) context.Context {
	return context.WithValue(ctx, UserEmailKey, email)
}

// extractBearerToken strips the "Bearer " prefix from an Authorization header value.
func extractBearerToken(authHeader string) string {
	if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
		return ""
	}
	return strings.TrimPrefix(authHeader, "Bearer ")
}
