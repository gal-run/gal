//go:build cloud
// +build cloud

package handler

import (
	"net/http"

	"github.com/gal-run/gal/services/lib/handler"
	"github.com/gal-run/gal/services/mcp-gateway/internal/domain"
)

// HandleGetFeatures returns enabled features for the authenticated user.
// GET /features
func (g *GatewayService) HandleGetFeatures(w http.ResponseWriter, r *http.Request) {
	flags, err := g.Store.ListFeatureFlags(r.Context())
	if err != nil {
		g.Log.Error("failed to list feature flags", "error", err)
		handler.RespondJSON(w, http.StatusOK, map[string]any{
			"features": []string{},
			"status":   "unavailable",
		})
		return
	}

	enabled := make([]domain.FeatureFlag, 0)
	for _, flag := range flags {
		if flag.Enabled {
			enabled = append(enabled, flag)
		}
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"features": enabled,
	})
}

// HandleGetAdminFeatures returns all feature flags (admin access).
// GET /features/admin
func (g *GatewayService) HandleGetAdminFeatures(w http.ResponseWriter, r *http.Request) {
	flags, err := g.Store.ListFeatureFlags(r.Context())
	if err != nil {
		g.Log.Error("failed to list feature flags", "error", err)
		handler.RespondJSON(w, http.StatusInternalServerError, map[string]string{
			"error": "failed to list feature flags",
		})
		return
	}

	handler.RespondJSON(w, http.StatusOK, map[string]any{
		"featureFlags": flags,
		"total":        len(flags),
	})
}
