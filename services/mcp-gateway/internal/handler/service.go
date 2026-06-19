//go:build cloud
// +build cloud

// Package handler provides HTTP handlers for the MCP Gateway.
// Handler methods are defined on GatewayService.
package handler

import (
	"log/slog"
	"time"

	"github.com/go-chi/jwtauth/v5"

	"github.com/gal-run/gal/services/mcp-gateway/internal/store"
)

// GatewayService is the central service struct for MCP Gateway handlers.
// Methods are grouped by resource into separate files in this package.
type GatewayService struct {
	Store     *store.McpStore
	Log       *slog.Logger
	JA        *jwtauth.JWTAuth
	StartTime time.Time
	Version   string
}
