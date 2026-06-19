// Package auth wraps lib/auth with the gal-rag orgId enforcement rule:
// the orgId claim on the JWT is authoritative; any request body attempt
// to override it (a different filter.orgId) is rejected with 403
// RAG_FILTER_FORBIDDEN.
package auth

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"

	"github.com/go-chi/jwtauth/v5"
	"github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/contracts"
	"github.com/gal-run/gal/services/lib/handler"
)

// EnforceOrgID is the per-request middleware. It runs after lib/auth has
// set the orgId claim on the request context and validates that the
// request body (if any) does not attempt to set filter.orgId to a value
// other than the JWT claim. On mismatch it returns a 403 with code
// RAG_FILTER_FORBIDDEN and a structured APIError body.
func EnforceOrgID(log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			orgID := auth.OrgID(r.Context())
			if orgID == "" {
				handler.RespondError(w, http.StatusUnauthorized, "missing org claim", "UNAUTHORIZED")
				return
			}
			if r.Body == nil || r.ContentLength == 0 {
				next.ServeHTTP(w, r)
				return
			}
			const maxBody = 1 << 20
			raw, err := io.ReadAll(io.LimitReader(r.Body, maxBody+1))
			if err != nil {
				handler.RespondError(w, http.StatusBadRequest, "cannot read body", "BAD_REQUEST")
				return
			}
			if len(raw) > maxBody {
				handler.RespondError(w, http.StatusRequestEntityTooLarge, "request body too large", "BODY_TOO_LARGE")
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(raw))
			r.ContentLength = int64(len(raw))

			var peek struct {
				Filter struct {
					OrgID string `json:"orgId"`
				} `json:"filter"`
			}
			if err := json.Unmarshal(raw, &peek); err != nil {
				next.ServeHTTP(w, r)
				return
			}
			if peek.Filter.OrgID != "" && peek.Filter.OrgID != orgID {
				if log != nil {
					log.Warn("orgId override attempted",
						"claimed", orgID,
						"requested", peek.Filter.OrgID,
						"path", r.URL.Path,
					)
				}
				handler.RespondJSON(w, http.StatusForbidden, contracts.APIError{
					Error: "filter.orgId must match JWT claim; override is forbidden",
					Code:  "RAG_FILTER_FORBIDDEN",
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// Chain returns the standard gal-rag auth chain: JWT verify + claim
// extraction + orgId enforcement.
func Chain(ja *jwtauth.JWTAuth, log *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return jwtauth.Verifier(ja)(jwtauth.Authenticator(ja)(auth.Middleware(ja)(EnforceOrgID(log)(next))))
	}
}
