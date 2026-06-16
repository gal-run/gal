//go:build cloud
// +build cloud

// sdlc-svc owns the SDLC (Software Development Lifecycle) enforcement engine.
// It manages phase progression, compliance checks, PR approval/completion notifications,
// product discipline tracking, and the product issue gate.
package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/jwtauth/v5"

	"github.com/gal-run/gal/services/lib/auth"
	"github.com/gal-run/gal/services/lib/firestore"
	"github.com/gal-run/gal/services/lib/telemetry"

	"github.com/gal-run/gal/services/sdlc-svc/internal/handler"
)

func main() {
	ctx := context.Background()
	log := telemetry.Logger()

	tp, _ := telemetry.InitTracer(ctx, "sdlc-svc")
	defer tp.Shutdown(ctx)

	fsClient, err := firestore.Client(ctx)
	if err != nil {
		log.Error("firestore unavailable", "error", err)
		os.Exit(1)
	}

	store := firestore.NewServiceStore(fsClient, map[string]string{
		"sdlc_phases":       "sdlc_phases",
		"sdlc_compliance":   "sdlc_compliance",
		"sdlc_templates":    "sdlc_templates",
		"product_discipline": "product_discipline",
		"issue_gates":       "issue_gates",
	})

	svc := handler.New(store, log)

	ja := jwtauth.New("HS256", []byte(os.Getenv("JWT_SECRET")), nil)

	r := chi.NewRouter()
	r.Use(chimw.RequestID)
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))

	// Health check — no auth.
	r.Get("/health", handler.HealthCheck)

	// Authenticated routes.
	r.Group(func(r chi.Router) {
		r.Use(jwtauth.Verifier(ja))
		r.Use(jwtauth.Authenticator(ja))
		r.Use(auth.Middleware(ja))

		// SDLC Phase Management
		r.Get("/sdlc/status/{issueId}", svc.GetStatus)
		r.Post("/sdlc/phase", svc.AdvancePhase)
		r.Post("/sdlc/phase/{phase}/approve", svc.ApprovePhase)
		r.Post("/sdlc/phase/{phase}/reject", svc.RejectPhase)
		r.Post("/sdlc/complete", svc.CompleteSDLC)

		// SDLC Compliance
		r.Get("/sdlc/compliance", svc.GetCompliance)
		r.Get("/sdlc/compliance/{repo}", svc.GetRepoCompliance)
		r.Post("/sdlc/compliance/check", svc.RunComplianceCheck)

		// SDLC Enforcement
		r.Post("/sdlc/enforce", svc.EnforceGate)
		r.Get("/sdlc/enforce/status/{issueId}", svc.GetEnforcementStatus)

		// SDLC Gates
		r.Get("/sdlc/gate/{issueId}", svc.GetGate)
		r.Post("/sdlc/gate/evaluate", svc.EvaluateGates)

		// SDLC Templates
		r.Get("/sdlc/templates", svc.ListTemplates)
		r.Post("/sdlc/templates", svc.CreateTemplate)

		// Product Discipline
		r.Get("/product-discipline", svc.GetDisciplineOverview)
		r.Post("/product-discipline/report", svc.ReportDisciplineEvent)

		// Product Issue Gate
		r.Get("/product-issue-gate", svc.GetIssueGateConfig)
		r.Post("/product-issue-gate/check", svc.CheckIssueGate)
	})

	port := envOrDefault("PORT", "8085")
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      r,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
	}

	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	}()

	log.Info("sdlc-svc starting", "port", port)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server error", "error", err)
		os.Exit(1)
	}
}

func envOrDefault(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
