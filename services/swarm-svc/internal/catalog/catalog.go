// Package catalog ports application/catalog.ts and catalogs/providers.ts from @gal/swarm.
package catalog

import (
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gal-run/gal/services/swarm-svc/internal/domain"
	"github.com/gal-run/gal/services/swarm-svc/internal/planning"
)

// ---------------------------------------------------------------------------
// First-burst launch defaults (ported from catalogs/providers.ts)
// ---------------------------------------------------------------------------

type GalSwarmFirstBurstLaunchDefaults struct {
	SandboxProvider               string   `json:"sandboxProvider"`
	DefaultComputeProfileID      string   `json:"defaultComputeProfileId"`
	FallbackComputeProfileIDs    []string `json:"fallbackComputeProfileIds"`
	ServerlessFallbackEndpointID string   `json:"serverlessFallbackEndpointId"`
	MaxAllowedSpendUsd           float64  `json:"maxAllowedSpendUsd"`
	MaxAllowedHourlyUsd          float64  `json:"maxAllowedHourlyUsd"`
	MaxAllowedComputeUnits       int      `json:"maxAllowedComputeUnits"`
	TTLHours                     float64  `json:"ttlHours"`
	LogicalWorkersPerComputeUnit int      `json:"logicalWorkersPerComputeUnit"`
	ProviderFallbackOrder        []string `json:"providerFallbackOrder"`
	InfrastructureTarget         GalSwarmInfrastructureTarget `json:"infrastructureTarget"`
}

type GalSwarmInfrastructureTarget struct {
	Provider         string  `json:"provider"`
	InferenceGateway string  `json:"inferenceGateway"`
	FallbackProvider string  `json:"fallbackProvider"`
	Region           string  `json:"region"`
	Zone             string  `json:"zone"`
	GPUType          string  `json:"gpuType"`
	GPUCount         int     `json:"gpuCount"`
	Spot             bool    `json:"spot"`
	HourlyCostUsd    float64 `json:"hourlyCostUsd"`
	ImageRef         string  `json:"imageRef"`
}

func DefaultGalSwarmFirstBurstLaunchDefaults() GalSwarmFirstBurstLaunchDefaults {
	return GalSwarmFirstBurstLaunchDefaults{
		SandboxProvider:               "stratus",
		DefaultComputeProfileID:      "stratus-agent-sandbox-tool-call-smoke",
		FallbackComputeProfileIDs:    []string{"stratus-agent-sandbox-coding-smoke"},
		ServerlessFallbackEndpointID: "serverless-glm-mini",
		MaxAllowedSpendUsd:           0.1,
		MaxAllowedHourlyUsd:          0.5,
		MaxAllowedComputeUnits:       1,
		TTLHours:                     0.25,
		LogicalWorkersPerComputeUnit: 1,
		ProviderFallbackOrder: []string{
			"stratus:gal-gateway-tool-call-smoke",
			"stratus:gal-gateway-coding-smoke",
			"runpod:serverless-fallback",
		},
		InfrastructureTarget: GalSwarmInfrastructureTarget{
			Provider:         "stratus",
			InferenceGateway: "gal-gateway",
			FallbackProvider: "runpod",
			Region:           "stratus",
			Zone:             "k3s-agents",
			GPUType:          "none",
			GPUCount:         0,
			Spot:             false,
			HourlyCostUsd:    0.1,
			ImageRef:         "europe-west4-docker.pkg.dev/gal-run/agent-images/stratus-agent:latest",
		},
	}
}

func DefaultGalSwarmFirstBurstProviderCandidates() []domain.GalSwarmProviderCandidate {
	defaults := DefaultGalSwarmFirstBurstLaunchDefaults()
	startupSec := 60
	shutdownSec := 15
	minBillSec := 60
	locality := 0.8
	reliability := 0.8
	notes := "First-burst default: Stratus sandbox with GAL Gateway inference and RunPod serverless fallback."
	return []domain.GalSwarmProviderCandidate{
		{
			Provider:                domain.GalSwarmProviderKind(domain.GalSwarmSandboxProviderStratus),
			ComputeProfileID:        defaults.DefaultComputeProfileID,
			HourlyCostUsd:           defaults.InfrastructureTarget.HourlyCostUsd,
			MinBillableSeconds:      &minBillSec,
			EstimatedStartupSeconds: &startupSec,
			EstimatedShutdownSeconds: &shutdownSec,
			Available:               true,
			ReliabilityScore:        reliability,
			LocalityScore:           &locality,
			Notes:                   &notes,
		},
	}
}

func DefaultGalSwarmProviderIntegrationProfiles() []domain.GalSwarmProviderIntegrationProfile {
	return []domain.GalSwarmProviderIntegrationProfile{
		{
			Provider:               domain.GalSwarmProviderKind(domain.GalSwarmSandboxProviderStratus),
			LifecycleSurface:       "managed_kubernetes",
			BillingGranularity:     "second",
			CanScaleToZero:         true,
			SupportsStop:           true,
			SupportsTerminate:      true,
			SupportsSpot:           false,
			SupportsReservations:   true,
			SupportsServerless:     true,
			MinBillableSeconds:     1,
			TypicalStartupSeconds:  60,
			TypicalShutdownSeconds: 15,
			MetricsSurfaces:        []domain.GalSwarmMetricsSurface{"prometheus", "container_metrics"},
			AdapterPackage:         strPtr("@stratus/sandbox-controller"),
			SDKPackages:            []string{"sandbox-controller REST API", "kubectl", "containerd/kata"},
			AuthSecretNames:        []string{"STRATUS_SANDBOX_CONTROLLER_URL", "STRATUS_RUNNER_TOKEN"},
			Notes:                  "Only sandbox dispatch path: gal-api calls the Stratus sandbox-controller for agent sessions.",
		},
	}
}

func DefaultGalSwarmPreflightComputeProfiles() []domain.GalSwarmComputeProfile {
	return []domain.GalSwarmComputeProfile{
		{
			ID:       "stratus-agent-sandbox-tool-call-smoke",
			Provider: domain.GalSwarmProviderKind(domain.GalSwarmSandboxProviderStratus),
			Label:    "Stratus agent sandbox tool-call smoke",
			Region:   ptr("stratus"),
			Zone:     ptr("k3s-agents"),
			Spot:     ptr(false),
			ModelID:  ptr("gal-gateway-default"),
			Purpose:  ptr("tool_calling_smoke"),
			MaxDurationMinutes: ptr(15),
			MaxSpendUsd:        ptr(0.1),
			CPUCores:           ptr(2),
			MemoryGb:           ptr(8),
			GPUType:            ptr("none"),
			GPUCount:           ptr(0),
			DiskGb:             ptr(20),
			Image:              ptr("gal-run/stratus-agent:latest"),
			ImageRef:           ptr("europe-west4-docker.pkg.dev/gal-run/agent-images/stratus-agent:latest"),
			ModelCache: &domain.GalSwarmModelCacheProfile{
				Mode:                 "none",
				MountPath:            "/workspace",
				ExpectedHitRate:      1,
				HydrateTimeoutSeconds: 0,
			},
			StartupBudgetSeconds: ptr(60),
			ReadinessProbe: &domain.GalSwarmReadinessProbe{
				Type:           "http",
				Path:           "/healthz",
				Port:           3100,
				TimeoutSeconds: 5,
				IntervalSeconds: 5,
			},
			ShutdownPolicy: &domain.GalSwarmShutdownPolicy{
				MaxDurationSeconds: 900,
				DeleteInstance:     true,
				DeleteBootDisk:     true,
				CleanupNetwork:     true,
			},
			Tools: []string{"gal", "codex", "gh", "pnpm"},
		},
		{
			ID:       "stratus-agent-sandbox-coding-smoke",
			Provider: domain.GalSwarmProviderKind(domain.GalSwarmSandboxProviderStratus),
			Label:    "Stratus agent sandbox coding smoke",
			Region:   ptr("stratus"),
			Zone:     ptr("k3s-agents"),
			Spot:     ptr(false),
			ModelID:  ptr("gal-gateway-default"),
			Purpose:  ptr("coding_smoke"),
			MaxDurationMinutes: ptr(15),
			MaxSpendUsd:        ptr(0.1),
			CPUCores:           ptr(4),
			MemoryGb:           ptr(16),
			GPUType:            ptr("none"),
			GPUCount:           ptr(0),
			DiskGb:             ptr(40),
			Image:              ptr("gal-run/stratus-agent:latest"),
			ImageRef:           ptr("europe-west4-docker.pkg.dev/gal-run/agent-images/stratus-agent:latest"),
			ModelCache: &domain.GalSwarmModelCacheProfile{
				Mode:                 "none",
				MountPath:            "/workspace",
				ExpectedHitRate:      1,
				HydrateTimeoutSeconds: 0,
			},
			StartupBudgetSeconds: ptr(60),
			ReadinessProbe: &domain.GalSwarmReadinessProbe{
				Type:           "http",
				Path:           "/healthz",
				Port:           3100,
				TimeoutSeconds: 5,
				IntervalSeconds: 5,
			},
			ShutdownPolicy: &domain.GalSwarmShutdownPolicy{
				MaxDurationSeconds: 900,
				DeleteInstance:     true,
				DeleteBootDisk:     true,
				CleanupNetwork:     true,
			},
			Tools: []string{"gal", "codex", "gh", "pnpm"},
		},
	}
}

// ---------------------------------------------------------------------------
// Catalog (ported from application/catalog.ts)
// ---------------------------------------------------------------------------

// CreateGalSwarmCapabilityCatalog builds a capability catalog.
func CreateGalSwarmCapabilityCatalog(options *domain.GalSwarmCapabilityCatalogOptions) domain.GalSwarmCapabilityCatalog {
	generatedAt := time.Now().UTC().Format(time.RFC3339)
	if options != nil && options.GeneratedAt != nil {
		generatedAt = *options.GeneratedAt
	}

	maxValidated := 1
	if options != nil && options.MaxValidatedWorkers != nil {
		maxValidated = *options.MaxValidatedWorkers
	}
	if maxValidated < 0 {
		maxValidated = 0
	}
	if maxValidated > domain.GalSwarmMaxWaveSandboxes {
		maxValidated = domain.GalSwarmMaxWaveSandboxes
	}

	cat := domain.GalSwarmCapabilityCatalog{
		SchemaVersion:       domain.GalSwarmCapabilityCatalogSchemaVer,
		GeneratedAt:         generatedAt,
		MaxSupportedWorkers: domain.GalSwarmMaxWaveSandboxes,
		MaxValidatedWorkers: maxValidated,
		LaunchProfiles:      defaultLaunchProfiles(options),
		Architectures:       defaultArchitectures(),
		RateLimits:          normalizeRateLimits(nil),
		Pricing:             normalizePricing(nil),
		Transport:           normalizeTransport(nil),
	}

	if options != nil {
		if options.LaunchProfiles != nil {
			cat.LaunchProfiles = options.LaunchProfiles
		}
		if options.Architectures != nil {
			cat.Architectures = options.Architectures
		}
		if options.RateLimits != nil {
			cat.RateLimits = normalizeRateLimits(options.RateLimits)
		}
		if options.Pricing != nil {
			cat.Pricing = normalizePricing(options.Pricing)
		}
		if options.Transport != nil {
			cat.Transport = normalizeTransport(options.Transport)
		}
	}

	return cat
}

// CreateGalSwarmDoctorReport builds a doctor readiness report.
func CreateGalSwarmDoctorReport(input domain.GalSwarmDoctorReportInput) domain.GalSwarmDoctorReport {
	generatedAt := time.Now().UTC().Format(time.RFC3339)
	if input.GeneratedAt != nil {
		generatedAt = *input.GeneratedAt
	}

	targetWorkers := 1
	if input.TargetWorkerCount != nil {
		targetWorkers = *input.TargetWorkerCount
	}
	if targetWorkers < 1 {
		targetWorkers = 1
	}
	if targetWorkers > domain.GalSwarmMaxWaveSandboxes {
		targetWorkers = domain.GalSwarmMaxWaveSandboxes
	}

	contractMax := domain.GalSwarmMaxWaveSandboxes
	if input.ContractMaxWorkers != nil {
		contractMax = *input.ContractMaxWorkers
	}

	checks := normalizeDoctorChecks(input.Checks)
	var blockers []string
	var warnings []string
	for _, c := range checks {
		if c.Required && (c.Status == domain.GalSwarmDoctorStatusFail || c.Status == domain.GalSwarmDoctorStatusUnknown) {
			blockers = append(blockers, c.Title)
		}
		if c.Status == domain.GalSwarmDoctorStatusWarn {
			warnings = append(warnings, c.Title)
		}
	}

	var safeCeilings []int
	for _, c := range checks {
		if c.MaxSafeWorkers != nil && *c.MaxSafeWorkers >= 0 {
			safeCeilings = append(safeCeilings, *c.MaxSafeWorkers)
		}
	}

	maxRecommended := contractMax
	if len(blockers) > 0 {
		maxRecommended = 0
	} else if len(safeCeilings) > 0 {
		min := safeCeilings[0]
		for _, v := range safeCeilings[1:] {
			if v < min {
				min = v
			}
		}
		if min < maxRecommended {
			maxRecommended = min
		}
	}

	readyForTest := len(blockers) == 0 && maxRecommended >= targetWorkers
	overallStatus := domain.GalSwarmDoctorStatusPass
	if len(blockers) > 0 {
		overallStatus = domain.GalSwarmDoctorStatusFail
	} else if len(warnings) > 0 || !readyForTest {
		overallStatus = domain.GalSwarmDoctorStatusWarn
	}

	return domain.GalSwarmDoctorReport{
		SchemaVersion:        domain.GalSwarmDoctorReportSchemaVersion,
		GeneratedAt:          generatedAt,
		TargetWorkerCount:    targetWorkers,
		OverallStatus:        overallStatus,
		ReadyForWorkerTest:   readyForTest,
		MaxRecommendedWorkers: maxRecommended,
		Blockers:             blockers,
		Warnings:             warnings,
		Checks:               checks,
		Notes:                normalizeNotes(input.Notes, nil),
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func defaultLaunchProfiles(options *domain.GalSwarmCapabilityCatalogOptions) []domain.GalSwarmLaunchProfile {
	defaults := DefaultGalSwarmFirstBurstLaunchDefaults()
	smokeProfiles := DefaultGalSwarmPreflightComputeProfiles()

	var launchProfiles []domain.GalSwarmLaunchProfile

	for _, p := range smokeProfiles {
		aiProvs := make([]domain.GalSwarmAIProvider, len(domain.GalSwarmEnabledAIProviders))
		copy(aiProvs, domain.GalSwarmEnabledAIProviders)

		runnerLabels := make([]string, len(domain.GalSwarmDefaultRunnerLabels))
		copy(runnerLabels, domain.GalSwarmDefaultRunnerLabels)
		if p.CPUCores != nil && *p.CPUCores <= 2 {
			runnerLabels = make([]string, len(domain.GalSwarmBurstRunnerLabels))
			copy(runnerLabels, domain.GalSwarmBurstRunnerLabels)
		}

		lp := domain.GalSwarmLaunchProfile{
			ID:                   p.ID,
			Label:                p.Label,
			Source:               "compute-profile",
			Tier:                 "smoke",
			SupportLevel:         domain.GalSwarmSupportLevelSupported,
			CapacityState:        "ready",
			ApprovalRequired:     false,
			MaxSupportedWorkers:  1,
			MaxValidatedWorkers:  1,
			SandboxProvider:      ptr(domain.GalSwarmSandboxProviderStratus),
			AIProviders:          aiProvs,
			ComputeProfileID:     &p.ID,
			RunnerLabels:         runnerLabels,
			CapacityPolicyProfile: ptr(domain.GalSwarmCapacityPolicyProfileDevSmoke),
			IsolationMode:        domain.GalSwarmIsolationModeKata,
			StorageClass:         "persistent-workspace",
			NetworkingMode:       "private-swarm",
			Lifecycle: domain.GalSwarmLifecycleSemantics{
				StopPreservesWorkspace:           true,
				RestartRequiresFreshReservation:  true,
				UpdateClearsEphemeralState:       true,
				TerminateDeletesEphemeralState:   true,
				Notes: []string{
					"Smoke profiles preserve the workspace mount but require a fresh admission decision for each new sandbox session.",
					"Editing the live environment is treated as disposable and must not be relied on for persistent state.",
				},
			},
			Resources: domain.GalSwarmLaunchProfileResources{
				CPUCores: p.CPUCores,
				MemoryGb: p.MemoryGb,
				DiskGb:   p.DiskGb,
				GPUType:  p.GPUType,
				GPUCount: p.GPUCount,
			},
			CostHints: domain.GalSwarmCostHints{
				Currency:       "USD",
				MaxHourlyUsd:   &defaults.MaxAllowedHourlyUsd,
				MaxRunSpendUsd: p.MaxSpendUsd,
				Notes:          []string{"First-burst smoke pricing is bounded and intentionally conservative."},
			},
			Notes: []string{
				"Backed by the Stratus agent-sandbox control plane.",
				"Use this profile before any broader worker-wave test.",
			},
		}
		launchProfiles = append(launchProfiles, lp)
	}

	allRunnerLabels := append([]string{}, domain.GalSwarmKataRunnerLabels...)
	allRunnerLabels = append(allRunnerLabels, domain.GalSwarmRuncRunnerLabels...)

	for _, label := range allRunnerLabels {
		isKata := strings.Contains(label, "-kata-")
		var size string
		switch {
		case strings.Contains(label, "nano"):
			size = "nano"
		case strings.Contains(label, "low"):
			size = "low"
		case strings.Contains(label, "medium"):
			size = "medium"
		case strings.Contains(label, "high"):
			size = "high"
		default:
			size = "standard"
		}

		supportLevel := domain.GalSwarmSupportLevelSupported
		capacityState := "ready"
		isolation := domain.GalSwarmIsolationModeKata
		tier := "burst"

		if !isKata {
			supportLevel = domain.GalSwarmSupportLevelBreakglassOnly
			capacityState = "blocked"
			isolation = domain.GalSwarmIsolationModeRunc
			tier = "breakglass"
		}

		capProfile := domain.GalSwarmCapacityPolicyProfileSmallPaid
		if size == "high" {
			capProfile = domain.GalSwarmCapacityPolicyProfileLargeBurst
		}

		aiProvs := make([]domain.GalSwarmAIProvider, len(domain.GalSwarmEnabledAIProviders))
		copy(aiProvs, domain.GalSwarmEnabledAIProviders)

		lp := domain.GalSwarmLaunchProfile{
			ID:                   label,
			Label:                label + " worker class",
			Source:               "runner-label",
			Tier:                 domain.GalSwarmLaunchProfileTier(tier),
			SupportLevel:         supportLevel,
			CapacityState:        domain.GalSwarmCapacityState(capacityState),
			ApprovalRequired:     true,
			MaxSupportedWorkers:  domain.GalSwarmMaxWaveSandboxes,
			MaxValidatedWorkers:  0,
			SandboxProvider:      ptr(domain.GalSwarmSandboxProviderStratus),
			AIProviders:          aiProvs,
			RunnerLabels:         []string{label},
			CapacityPolicyProfile: &capProfile,
			IsolationMode:        isolation,
			StorageClass:         "persistent-workspace",
			NetworkingMode:       "private-swarm",
			Lifecycle: domain.GalSwarmLifecycleSemantics{
				StopPreservesWorkspace:           true,
				RestartRequiresFreshReservation:  true,
				UpdateClearsEphemeralState:       true,
				TerminateDeletesEphemeralState:   true,
				Notes: []string{
					"All burst classes must pass reservation-backed admission before worker creation.",
				},
			},
			Resources: domain.GalSwarmLaunchProfileResources{},
			CostHints: burstCostHints(size, isKata),
			Notes: []string{
				"Exact CPU, memory, and disk are owned by the Stratus runner inventory and should be hydrated by upstream services.",
			},
		}

		if isKata {
			lp.Lifecycle.Notes = append(lp.Lifecycle.Notes, "Kata remains the default isolation mode for production GAL swarm work.")
			lp.Notes = append(lp.Notes, "Use this label only after doctor checks and admission capacity both pass.")
		} else {
			lp.Lifecycle.Notes = append(lp.Lifecycle.Notes, "runc exists only as break-glass metadata and is not a normal production path.")
			lp.Notes = append(lp.Notes, "Do not schedule this class without explicit break-glass approval.")
		}

		launchProfiles = append(launchProfiles, lp)
	}

	return launchProfiles
}

func burstCostHints(size string, kata bool) domain.GalSwarmCostHints {
	var maxHourly float64
	switch size {
	case "nano":
		maxHourly = 0.05
	case "low":
		maxHourly = 0.1
	case "medium":
		maxHourly = 0.25
	case "high":
		maxHourly = 0.5
	default:
		maxHourly = 0.15
	}

	notes := []string{"Pricing is a planning hint only; final spend comes from Stratus admission and live policy."}
	if !kata {
		notes = []string{"Break-glass only; treat any cost estimate as secondary to the isolation policy exception."}
	}

	return domain.GalSwarmCostHints{
		Currency:     "USD",
		MaxHourlyUsd: &maxHourly,
		Notes:        notes,
	}
}

func defaultArchitectures() []domain.GalSwarmArchitectureCapability {
	aliases := planning.ListGalSwarmTopologyAliases()
	canonicalSet := make(map[string]bool)
	for _, a := range aliases {
		canonicalSet[a.CanonicalMode] = true
	}

	var modes []string
	for m := range canonicalSet {
		modes = append(modes, m)
	}
	sort.Strings(modes)

	var archs []domain.GalSwarmArchitectureCapability
	for _, mode := range modes {
		var publicAliases []string
		for _, a := range aliases {
			if a.CanonicalMode == mode && a.Source == "public" {
				publicAliases = append(publicAliases, a.Alias)
			}
		}
		sort.Strings(publicAliases)

		var matching *domain.GalSwarmTopologyModeMapping
		for _, m := range planning.GalSwarmTopologyModeMappings {
			if m.CanonicalMode == mode {
				matching = &m
				break
			}
		}

		family := "canonical"
		if matching != nil {
			family = matching.Family
		}

		supportLevel := domain.GalSwarmSupportLevelSupported
		if mode == "auto" {
			supportLevel = domain.GalSwarmSupportLevelPlanned
		}

		batchReady := mode == "sequential" || mode == "concurrent" || mode == "router" || mode == "mixture" || mode == "auto"

		notes := []string{
			"Public Swarms-compatible aliases are normalized into the " + mode + " governed execution primitive.",
		}
		if mode == "auto" {
			notes = []string{
				"Auto mode is a routing hint and must resolve to a concrete governed topology before dispatch.",
			}
		}

		archs = append(archs, domain.GalSwarmArchitectureCapability{
			CanonicalMode:      mode,
			SupportLevel:       supportLevel,
			Family:             family,
			PublicAliases:      publicAliases,
			BatchReady:         batchReady,
			SupportsStreaming:  false,
			RecommendedFor:     architectureRecommendations(mode),
			Notes:              notes,
		})
	}

	return archs
}

func architectureRecommendations(mode string) []string {
	switch mode {
	case "sequential":
		return []string{"dependent multi-step work", "research pipelines", "quality-gated handoffs"}
	case "concurrent":
		return []string{"independent parallel tasks", "high-throughput batch work", "fan-out review lanes"}
	case "graph":
		return []string{"dependency-heavy workflows", "explicit routing constraints", "task graph execution"}
	case "hierarchical":
		return []string{"director-worker-review structures", "team automation", "governed coding swarms"}
	case "mixture":
		return []string{"proposal synthesis", "consensus assistance", "multi-specialist drafting"}
	case "group_chat":
		return []string{"interactive deliberation", "debate", "collaborative reasoning"}
	case "forest":
		return []string{"multiple specialist clusters", "portfolio-style work partitioning"}
	case "heavy":
		return []string{"high-risk changes", "redundant review", "adversarial verification"}
	case "router":
		return []string{"capability-based dispatch", "dynamic skill selection", "model or agent routing"}
	default:
		return []string{"automatic topology selection pending explicit route resolution"}
	}
}

func normalizeRateLimits(input *domain.GalSwarmRateLimitSummary) domain.GalSwarmRateLimitSummary {
	tierName := "control-plane"
	endpoint := "/api/swarm/capabilities"
	maxBatch := 100
	var rls domain.GalSwarmRateLimitSummary

	if input != nil {
		tierName = input.TierName
		if tierName == "" {
			tierName = "control-plane"
		}
		if input.Endpoint != "" {
			endpoint = input.Endpoint
		}
		if input.MaxBatchItems != nil {
			maxBatch = *input.MaxBatchItems
		}
		rls = *input
	}

	rls.TierName = tierName
	rls.Endpoint = endpoint
	rls.MaxBatchItems = &maxBatch
	rls.Notes = normalizeNotes(
		func() []string { if input != nil { return input.Notes }; return nil }(),
		[]string{
			"Expose concrete live limits from gal-api or sandbox admission before using this for production burst gating.",
			"Batch ceilings should reflect safe controller, reservation, and cleanup throughput rather than marketing capacity.",
		},
	)
	if rls.RequestsPerMinute == nil {
		_ = rls.RequestsPerMinute // intentional: keep input values
	}
	return rls
}

func normalizePricing(input *domain.GalSwarmPricingSummary) domain.GalSwarmPricingSummary {
	defaults := DefaultGalSwarmFirstBurstLaunchDefaults()
	endpoint := "/api/swarm/capabilities"
	notes := []string{
		"First-burst launch defaults cap self-hosted hourly spend at " +
			strings.TrimRight(strings.TrimRight(strconv.FormatFloat(defaults.MaxAllowedHourlyUsd, 'f', 2, 64), "0"), ".") +
			" USD.",
		"Token and per-agent pricing should be hydrated from the live GAL control plane rather than hardcoded in the SDK.",
	}

	if input != nil {
		if input.PricingEndpoint != "" {
			endpoint = input.PricingEndpoint
		}
		if len(input.Notes) > 0 {
			notes = input.Notes
		}
		ps := *input
		ps.PricingEndpoint = endpoint
		ps.Notes = normalizeNotes(notes, nil)
		if ps.Currency == "" {
			ps.Currency = "USD"
		}
		return ps
	}

	return domain.GalSwarmPricingSummary{
		Currency:        "USD",
		PricingEndpoint: endpoint,
		Notes:           normalizeNotes(notes, nil),
	}
}

func normalizeTransport(input *domain.GalSwarmTransportCapabilities) domain.GalSwarmTransportCapabilities {
	defaultAPI := domain.GalSwarmSupportLevelSupported
	defaultPlanned := domain.GalSwarmSupportLevelPlanned

	if input == nil {
		return domain.GalSwarmTransportCapabilities{
			API:                        defaultAPI,
			CLI:                        defaultPlanned,
			MCP:                        defaultPlanned,
			Dashboard:                  defaultPlanned,
			Streaming:                  defaultPlanned,
			ResponseCompression:        defaultPlanned,
			ResponseCompressionEncodings: []string{"gzip"},
			Notes: []string{
				"gal-swarm owns the contract; transport implementations live in gal-api, gal-cli, gal-mcp, and gal-dashboard.",
				"Compression and streaming are capability hints so higher layers can expose truthful product surfaces before broad rollout.",
			},
		}
	}

	encodings := input.ResponseCompressionEncodings
	if len(encodings) == 0 {
		encodings = []string{"gzip"}
	}

	return domain.GalSwarmTransportCapabilities{
		API:                         input.API,
		CLI:                         input.CLI,
		MCP:                         input.MCP,
		Dashboard:                   input.Dashboard,
		Streaming:                   input.Streaming,
		ResponseCompression:         input.ResponseCompression,
		ResponseCompressionEncodings: encodings,
		Notes: normalizeNotes(input.Notes, []string{
			"gal-swarm owns the contract; transport implementations live in gal-api, gal-cli, gal-mcp, and gal-dashboard.",
			"Compression and streaming are capability hints so higher layers can expose truthful product surfaces before broad rollout.",
		}),
	}
}

func normalizeDoctorChecks(checks []domain.GalSwarmDoctorCheck) []domain.GalSwarmDoctorCheck {
	result := make([]domain.GalSwarmDoctorCheck, len(checks))
	for i, c := range checks {
		var maxSafe *int
		if c.MaxSafeWorkers != nil {
			v := *c.MaxSafeWorkers
			if v < 0 {
				v = 0
			}
			if v > domain.GalSwarmMaxWaveSandboxes {
				v = domain.GalSwarmMaxWaveSandboxes
			}
			maxSafe = &v
		}
		result[i] = domain.GalSwarmDoctorCheck{
			ID:             strings.TrimSpace(c.ID),
			Title:          strings.TrimSpace(c.Title),
			Category:       c.Category,
			Required:       c.Required,
			Status:         c.Status,
			Evidence:       strPtr(strings.TrimSpace(derefStr(c.Evidence))),
			Remediation:    strPtr(strings.TrimSpace(derefStr(c.Remediation))),
			MaxSafeWorkers: maxSafe,
		}
	}
	return result
}

func normalizeNotes(input []string, fallback []string) []string {
	notes := input
	if len(notes) == 0 {
		notes = fallback
	}
	var result []string
	for _, n := range notes {
		t := strings.TrimSpace(n)
		if t != "" {
			result = append(result, t)
		}
	}
	return result
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func ptr[T any](v T) *T {
	return &v
}

func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
