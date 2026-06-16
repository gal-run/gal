// Package preflight ports application/preflight.ts from @gal/swarm.
package preflight

import (
	"fmt"
	"strings"

	"github.com/gal-run/gal/services/swarm-svc/internal/domain"
	"github.com/gal-run/gal/services/swarm-svc/internal/planning"
)

// EvaluateGalSwarmBurstPreflight runs burst preflight checks against the decision.
func EvaluateGalSwarmBurstPreflight(input domain.GalSwarmBurstPreflightInput) domain.GalSwarmBurstPreflightResult {
	if err := planning.ValidateGalSwarmPlan(input.Plan); err != nil {
		panic(err.Error())
	}

	requireNoDeployments := true
	if input.RequireNoDeployments != nil {
		requireNoDeployments = *input.RequireNoDeployments
	}

	checks := []domain.GalSwarmPreflightCheck{
		preflightCheck(
			"decision-is-scale-up-or-hold",
			"Startup decision is actionable",
			domain.GalSwarmPreflightSeverityBlocker,
			input.Decision.Action == domain.GalSwarmDecisionActionScaleUp || input.Decision.Action == domain.GalSwarmDecisionActionHold,
			fmtCheck("Decision action is %s.", string(input.Decision.Action)),
		),
		preflightCheck(
			"runnable-queue-present",
			"Runnable queue is present",
			domain.GalSwarmPreflightSeverityBlocker,
			input.RunnableTaskCount > 0,
			fmtCheck("%d runnable tasks are available.", input.RunnableTaskCount),
		),
		preflightCheck(
			"blocked-work-not-dominant",
			"Blocked work does not dominate the burst",
			domain.GalSwarmPreflightSeverityBlocker,
			input.BlockedTaskCount <= input.RunnableTaskCount,
			fmtCheck("%d blocked tasks vs %d runnable tasks.", input.BlockedTaskCount, input.RunnableTaskCount),
		),
		preflightCheck(
			"compute-units-within-cap",
			"Paid compute units are capped",
			domain.GalSwarmPreflightSeverityBlocker,
			computeUnits(input.Decision) <= input.MaxAllowedComputeUnits,
			fmtCheck("Decision requests %d paid compute units; cap is %d.", computeUnits(input.Decision), input.MaxAllowedComputeUnits),
		),
		preflightCheck(
			"spend-within-cap",
			"Projected spend is capped",
			domain.GalSwarmPreflightSeverityBlocker,
			input.Decision.ProjectedSpendUsd <= input.MaxAllowedSpendUsd && input.Decision.ProjectedSpendUsd <= input.Plan.MaxSpendUsd,
			fmtCheck("Projected spend is $%.2f; cap is $%.2f.", input.Decision.ProjectedSpendUsd, minFloat(input.MaxAllowedSpendUsd, input.Plan.MaxSpendUsd)),
		),
		preflightCheck(
			"provider-selected",
			"Provider candidate is selected",
			domain.GalSwarmPreflightSeverityBlocker,
			input.Decision.Provider != nil && input.Decision.ComputeProfileID != nil,
			func() string {
				if input.Decision.Provider != nil {
					return fmtCheck("Selected %s/%s.", string(*input.Decision.Provider), derefStr(input.Decision.ComputeProfileID))
				}
				return "No provider selected."
			}(),
		),
		preflightCheck(
			"provider-available",
			"Selected provider is available",
			domain.GalSwarmPreflightSeverityBlocker,
			input.SelectedProvider != nil && input.SelectedProvider.Available,
			func() string {
				if input.SelectedProvider != nil {
					return fmtCheck("%s availability is %v.", string(input.SelectedProvider.Provider), input.SelectedProvider.Available)
				}
				return "No selected provider availability evidence was supplied."
			}(),
		),
		preflightCheck(
			"provider-cost-agrees",
			"Provider estimate agrees with decision spend",
			domain.GalSwarmPreflightSeverityBlocker,
			input.SelectedProvider == nil || input.Decision.ProjectedSpendUsd == input.SelectedProvider.EstimatedCostUsd,
			func() string {
				if input.SelectedProvider != nil {
					return fmtCheck("Provider estimate is $%.2f; decision spend is $%.2f.", input.SelectedProvider.EstimatedCostUsd, input.Decision.ProjectedSpendUsd)
				}
				return "No selected provider cost evidence was supplied."
			}(),
		),
		preflightCheck(
			"runtime-telemetry-configured",
			"Runtime telemetry is configured",
			domain.GalSwarmPreflightSeverityBlocker,
			input.RuntimeTelemetryConfigured,
			func() string {
				if input.RuntimeTelemetryConfigured {
					return "Runtime telemetry is configured."
				}
				return "Runtime telemetry is missing."
			}(),
		),
		preflightCheck(
			"provider-credentials-configured",
			"Provider credentials are configured",
			domain.GalSwarmPreflightSeverityBlocker,
			input.ProviderCredentialsConfigured,
			func() string {
				if input.ProviderCredentialsConfigured {
					return "Provider credentials are configured."
				}
				return "Provider credentials are missing."
			}(),
		),
		preflightCheck(
			"drain-policy-present",
			"Drain policy is present",
			domain.GalSwarmPreflightSeverityBlocker,
			input.Plan.DrainBelowUtilizationForSeconds > 0,
			fmtCheck("Drain threshold is %ds.", input.Plan.DrainBelowUtilizationForSeconds),
		),
		preflightCheck(
			"shutdown-policy-present",
			"Shutdown policy is present",
			domain.GalSwarmPreflightSeverityBlocker,
			input.Plan.ShutdownBelowUtilizationForSeconds > 0,
			fmtCheck("Shutdown threshold is %ds.", input.Plan.ShutdownBelowUtilizationForSeconds),
		),
		preflightCheck(
			"duration-capped",
			"Burst duration is capped",
			domain.GalSwarmPreflightSeverityBlocker,
			input.Plan.MaxDurationMinutes > 0 && input.Plan.MaxDurationMinutes <= 60,
			fmtCheck("Max duration is %.0f minutes.", input.Plan.MaxDurationMinutes),
		),
		preflightCheck(
			"deployments-disabled",
			"Deployments are disabled for first burst",
			func() domain.GalSwarmPreflightSeverity {
				if requireNoDeployments {
					return domain.GalSwarmPreflightSeverityBlocker
				}
				return domain.GalSwarmPreflightSeverityWarning
			}(),
			!requireNoDeployments || !input.Plan.Permissions.AllowDeployments,
			fmtCheck("allowDeployments is %v.", input.Plan.Permissions.AllowDeployments),
		),
		preflightCheck(
			"permissions-repo-scoped",
			"Repository permissions are scoped",
			domain.GalSwarmPreflightSeverityBlocker,
			len(input.Plan.Permissions.AllowedRepos) > 0 && allContainSlash(input.Plan.Permissions.AllowedRepos),
			fmtCheck("%d repositories are allowed.", len(input.Plan.Permissions.AllowedRepos)),
		),
		preflightCheck(
			"permissions-tools-scoped",
			"Tool permissions are scoped",
			domain.GalSwarmPreflightSeverityBlocker,
			len(input.Plan.Permissions.AllowedTools) > 0,
			fmtCheck("%d tools are allowed.", len(input.Plan.Permissions.AllowedTools)),
		),
		preflightCheck(
			"queue-wait-target-present",
			"Queue wait target is present",
			domain.GalSwarmPreflightSeverityWarning,
			input.Plan.TargetQueueWaitSeconds > 0,
			fmtCheck("Target queue wait is %ds.", input.Plan.TargetQueueWaitSeconds),
		),
		preflightCheck(
			"utilization-target-present",
			"Utilization target is present",
			domain.GalSwarmPreflightSeverityWarning,
			input.Plan.MinEffectiveUtilization > 0,
			fmtCheck("Minimum effective utilization is %.2f.", input.Plan.MinEffectiveUtilization),
		),
		preflightCheck(
			"cost-snapshot-provider-matches",
			"Cost snapshot matches selected provider",
			domain.GalSwarmPreflightSeverityWarning,
			input.Decision.Provider == nil || input.Cost.Provider == *input.Decision.Provider,
			fmtCheck("Cost snapshot provider is %s; decision provider is %s.", string(input.Cost.Provider), func() string { if input.Decision.Provider != nil { return string(*input.Decision.Provider) }; return "none" }()),
		),
	}

	blockerCount := 0
	warningCount := 0
	for _, c := range checks {
		switch c.Severity {
		case domain.GalSwarmPreflightSeverityBlocker:
			if !c.Passed {
				blockerCount++
			}
		case domain.GalSwarmPreflightSeverityWarning:
			if !c.Passed {
				warningCount++
			}
		}
	}

	return domain.GalSwarmBurstPreflightResult{
		SchemaVersion: domain.GalSwarmPreflightSchemaVersion,
		SwarmID:       input.Plan.SwarmID,
		Passed:        blockerCount == 0,
		BlockerCount:  blockerCount,
		WarningCount:  warningCount,
		Checks:        checks,
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func preflightCheck(id, title string, severity domain.GalSwarmPreflightSeverity, passed bool, reason string) domain.GalSwarmPreflightCheck {
	return domain.GalSwarmPreflightCheck{ID: id, Title: title, Severity: severity, Passed: passed, Reason: reason}
}

func computeUnits(d *domain.GalSwarmDecision) int {
	if d.DesiredComputeUnits != nil {
		return *d.DesiredComputeUnits
	}
	return d.DesiredWorkers
}

func minFloat(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}

func allContainSlash(items []string) bool {
	for _, s := range items {
		if !strings.Contains(s, "/") {
			return false
		}
	}
	return true
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func fmtCheck(format string, args ...interface{}) string {
	return fmt.Sprintf(format, args...)
}
