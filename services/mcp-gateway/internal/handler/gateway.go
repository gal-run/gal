//go:build cloud
// +build cloud

package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/gal-run/gal/services/lib/handler"
	"github.com/gal-run/gal/services/mcp-gateway/internal/domain"
)

// HandleHealth returns a simple health check.
// GET /health
func (g *GatewayService) HandleHealth(w http.ResponseWriter, r *http.Request) {
	handler.RespondJSON(w, http.StatusOK, domain.HealthStatus{
		Status:    "ok",
		Service:   "mcp-gateway",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

// HandleReadiness checks whether downstream services are available.
// GET /health/ready
func (g *GatewayService) HandleReadiness(w http.ResponseWriter, r *http.Request) {
	checks := make(map[string]string)
	allOK := true

	// Check Firestore connectivity
	if err := g.probeFirestore(r.Context()); err != nil {
		checks["firestore"] = "unavailable: " + err.Error()
		allOK = false
	} else {
		checks["firestore"] = "ok"
	}

	status := "ok"
	statusCode := http.StatusOK
	if !allOK {
		status = "unavailable"
		statusCode = http.StatusServiceUnavailable
	}

	handler.RespondJSON(w, statusCode, domain.ReadinessCheck{
		Status:    status,
		Service:   "mcp-gateway",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Checks:    checks,
	})
}

// HandleBuildInfo returns build version metadata.
// GET /build-info
func (g *GatewayService) HandleBuildInfo(w http.ResponseWriter, r *http.Request) {
	handler.RespondJSON(w, http.StatusOK, domain.BuildInfoResponse{
		Commit:     g.Version,
		DeployedAt: g.StartTime.Format(time.RFC3339),
	})
}

// HandleGatewayStatus returns gateway + downstream health summary.
// GET /gateway/status
func (g *GatewayService) HandleGatewayStatus(w http.ResponseWriter, r *http.Request) {
	checks := make(map[string]any)
	overallStatus := "ok"

	// Check Firestore
	if err := g.probeFirestore(r.Context()); err != nil {
		checks["firestore"] = map[string]any{
			"status": "unavailable",
			"error":  err.Error(),
		}
		overallStatus = "degraded"
	} else {
		checks["firestore"] = map[string]any{
			"status": "ok",
		}
	}

	uptime := int64(time.Since(g.StartTime).Seconds())

	handler.RespondJSON(w, http.StatusOK, domain.GatewayStatusResponse{
		Status:    overallStatus,
		Service:   "mcp-gateway",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Version:   g.Version,
		Uptime:    uptime,
		Checks:    checks,
	})
}

// probeFirestore checks Firestore connectivity by reading a health probe document.
func (g *GatewayService) probeFirestore(ctx context.Context) error {
	probeCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	_, err := g.Store.GetFeatureFlag(probeCtx, "_health_probe")
	if err != nil {
		if isConnectionError(err) {
			return err
		}
	}
	return nil
}

// isConnectionError checks if an error indicates a Firestore connection issue.
func isConnectionError(err error) bool {
	if err == nil {
		return false
	}
	errStr := err.Error()
	return strings.Contains(errStr, "connection") ||
		strings.Contains(errStr, "unavailable") ||
		strings.Contains(errStr, "deadline exceeded") ||
		strings.Contains(errStr, "context deadline") ||
		strings.Contains(errStr, "refused") ||
		strings.Contains(errStr, "timeout")
}
