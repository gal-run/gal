// Package domain ported from @gal/swarm contracts/*.ts (schema, providers,
// catalog, doctor, hot-start, topology, evidence, planning, run-api).
//
// Every type, constant, and default value in the TypeScript source has a
// direct 1:1 counterpart below.
package domain

import (
	"math"
	"time"
)

// ---------------------------------------------------------------------------
// Schema versions (exported as string constants)
// ---------------------------------------------------------------------------

const (
	GalSwarmPlanSchemaVersion            = "gal.swarm-plan.v1"
	GalSwarmLeaseSchemaVersion           = "gal.swarm-worker-lease.v1"
	GalSwarmDecisionSchemaVersion        = "gal.swarm-decision.v1"
	GalSwarmPreflightSchemaVersion       = "gal.swarm-preflight.v1"
	GalSwarmHotStartSLOSchemaVersion     = "gal.swarm-hot-start-slo.v1"
	GalSwarmWaveEvidenceLedgerSchemaVer  = "gal.swarm-wave-evidence-ledger.v1"
	GalSwarmWaveLedgerEventSchemaVersion = "gal.swarm-wave-ledger-event.v1"
	GalSwarmTopologySchemaVersion        = "gal.swarm-topology.v1"
	GalSwarmCapabilityCatalogSchemaVer   = "gal.swarm-capability-catalog.v1"
	GalSwarmDoctorReportSchemaVersion    = "gal.swarm-doctor-report.v1"
	GalSwarmMaxWaveSandboxes             = 500
	GalSwarmAPIVersion                   = "2026-05-07"
)

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

type GalSwarmAIProvider string

const (
	GalSwarmAIProviderGalGateway GalSwarmAIProvider = "gal-gateway"
	GalSwarmAIProviderDeepSeek   GalSwarmAIProvider = "deepseek"
	GalSwarmAIProviderClaude     GalSwarmAIProvider = "claude"
	GalSwarmAIProviderGemini     GalSwarmAIProvider = "gemini"
	GalSwarmAIProviderOpenAI     GalSwarmAIProvider = "openai"
	GalSwarmAIProviderAnthropic  GalSwarmAIProvider = "anthropic"
	GalSwarmAIProviderCodestral  GalSwarmAIProvider = "codestral"
	GalSwarmAIProviderCodex      GalSwarmAIProvider = "codex"
	GalSwarmAIProviderRunPod     GalSwarmAIProvider = "runpod"
	GalSwarmAIProviderOther      GalSwarmAIProvider = "other"
)

var GalSwarmAllAIProviders = []GalSwarmAIProvider{
	GalSwarmAIProviderGalGateway, GalSwarmAIProviderDeepSeek, GalSwarmAIProviderClaude,
	GalSwarmAIProviderGemini, GalSwarmAIProviderOpenAI, GalSwarmAIProviderAnthropic,
	GalSwarmAIProviderCodestral, GalSwarmAIProviderCodex, GalSwarmAIProviderRunPod,
	GalSwarmAIProviderOther,
}

type GalSwarmSandboxProvider string

const (
	GalSwarmSandboxProviderStratus GalSwarmSandboxProvider = "stratus"
)

var GalSwarmAllSandboxProviders = []GalSwarmSandboxProvider{GalSwarmSandboxProviderStratus}

var GalSwarmEnabledSandboxProviders = []GalSwarmSandboxProvider{GalSwarmSandboxProviderStratus}

var GalSwarmEnabledAIProviders = []GalSwarmAIProvider{GalSwarmAIProviderGalGateway, GalSwarmAIProviderRunPod}

type GalSwarmProviderKind string

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Run API types
// ---------------------------------------------------------------------------

type GalSwarmTriggerSource string

const (
	GalSwarmTriggerSourceDashboard GalSwarmTriggerSource = "dashboard"
	GalSwarmTriggerSourceGalCode   GalSwarmTriggerSource = "gal-code"
	GalSwarmTriggerSourceGalCLI    GalSwarmTriggerSource = "gal-cli"
	GalSwarmTriggerSourceGalMCP    GalSwarmTriggerSource = "gal-mcp"
	GalSwarmTriggerSourceAPI      GalSwarmTriggerSource = "api"
)

type GalSwarmRunMode string

const (
	GalSwarmRunModeDryRun GalSwarmRunMode = "dry-run"
	GalSwarmRunModeApply  GalSwarmRunMode = "apply"
)

type GalSwarmRunStatus string

const (
	GalSwarmRunStatusPlanned           GalSwarmRunStatus = "planned"
	GalSwarmRunStatusPreflightRequired GalSwarmRunStatus = "preflight_required"
	GalSwarmRunStatusReadyForApply     GalSwarmRunStatus = "ready_for_apply"
	GalSwarmRunStatusRunning           GalSwarmRunStatus = "running"
	GalSwarmRunStatusDraining          GalSwarmRunStatus = "draining"
	GalSwarmRunStatusCompleted         GalSwarmRunStatus = "completed"
	GalSwarmRunStatusFailed            GalSwarmRunStatus = "failed"
)

type GalSwarmWorkloadEstimate struct {
	Tasks              int `json:"tasks"`
	PromptTokens       int `json:"promptTokens"`
	CompletionTokens   int `json:"completionTokens"`
	ToolCalls          int `json:"toolCalls"`
	WorkflowWaitSeconds int `json:"workflowWaitSeconds"`
	SandboxCount       int `json:"sandboxCount"`
}

type GalSwarmExecutionActuals struct {
	DurationSeconds    int     `json:"durationSeconds"`
	PromptTokens       int     `json:"promptTokens"`
	CompletionTokens   int     `json:"completionTokens"`
	ToolCalls          int     `json:"toolCalls"`
	WorkflowWaitSeconds int    `json:"workflowWaitSeconds"`
	SandboxCount       int     `json:"sandboxCount"`
	CompletedAt        *string `json:"completedAt,omitempty"`
	Notes              *string `json:"notes,omitempty"`
}

type GalSwarmCalibrationSummary struct {
	DurationRatio    float64 `json:"durationRatio"`
	TokenRatio       float64 `json:"tokenRatio"`
	ToolCallRatio    float64 `json:"toolCallRatio"`
	WorkflowWaitRatio float64 `json:"workflowWaitRatio"`
	SandboxRatio     float64 `json:"sandboxRatio"`
}

type GalSwarmOperatorQuestionnaire struct {
	HighLevelPrompt  string   `json:"highLevelPrompt"`
	SuccessCriteria  []string `json:"successCriteria"`
	Constraints      []string `json:"constraints"`
	ApprovalQuestion string   `json:"approvalQuestion"`
}

type GalSwarmExecutionApproval struct {
	Required            bool    `json:"required"`
	Approved            bool    `json:"approved"`
	ApprovalEvidenceURL *string `json:"approvalEvidenceUrl,omitempty"`
	ApprovedBy          *string `json:"approvedBy,omitempty"`
	ApprovedAt          *string `json:"approvedAt,omitempty"`
	Question            string  `json:"question"`
}

type GalSwarmCapacityAction string

const (
	GalSwarmCapacityActionHold             GalSwarmCapacityAction = "hold"
	GalSwarmCapacityActionScaleUp          GalSwarmCapacityAction = "scale_up"
	GalSwarmCapacityActionDrain            GalSwarmCapacityAction = "drain"
	GalSwarmCapacityActionSwitchToServerless GalSwarmCapacityAction = "switch_to_serverless"
	GalSwarmCapacityActionShutdown        GalSwarmCapacityAction = "shutdown"
)

type GalSwarmCapacityReason string

const (
	GalSwarmCapacityReasonWithinTarget    GalSwarmCapacityReason = "within_target"
	GalSwarmCapacityReasonBacklogPressure GalSwarmCapacityReason = "backlog_pressure"
	GalSwarmCapacityReasonLatencyPressure GalSwarmCapacityReason = "latency_pressure"
	GalSwarmCapacityReasonProviderUnhealthy GalSwarmCapacityReason = "provider_unhealthy"
	GalSwarmCapacityReasonBudgetExhausted GalSwarmCapacityReason = "budget_exhausted"
	GalSwarmCapacityReasonTTLExhausted    GalSwarmCapacityReason = "ttl_exhausted"
	GalSwarmCapacityReasonLowUtilization  GalSwarmCapacityReason = "low_utilization"
	GalSwarmCapacityReasonIdleDrained     GalSwarmCapacityReason = "idle_drained"
)

type GalSwarmCapacityPolicyProfile string

const (
	GalSwarmCapacityPolicyProfileDevSmoke   GalSwarmCapacityPolicyProfile = "dev-smoke"
	GalSwarmCapacityPolicyProfileSmallPaid  GalSwarmCapacityPolicyProfile = "small-paid"
	GalSwarmCapacityPolicyProfileLargeBurst GalSwarmCapacityPolicyProfile = "large-burst"
)

type GalSwarmCapacityPolicy struct {
	Profile                 GalSwarmCapacityPolicyProfile `json:"profile"`
	MinWorkers              int                           `json:"minWorkers"`
	MaxWorkers              int                           `json:"maxWorkers"`
	ScaleUpQueuedTokenSeconds int                         `json:"scaleUpQueuedTokenSeconds"`
	ScaleUpLatencyP95Ms     int                           `json:"scaleUpLatencyP95Ms"`
	ScaleDownUtilizationPercent float64                   `json:"scaleDownUtilizationPercent"`
	ScaleDownIdleSeconds    int                           `json:"scaleDownIdleSeconds"`
	DrainIdleSeconds        int                           `json:"drainIdleSeconds"`
	HardTtlSeconds          int                           `json:"hardTtlSeconds"`
	MaxSpendUsd             float64                       `json:"maxSpendUsd"`
}

type GalSwarmCapacityObservation struct {
	ActiveWorkers           int     `json:"activeWorkers"`
	QueuedTokenSeconds      int     `json:"queuedTokenSeconds"`
	TokensPerSecond         float64 `json:"tokensPerSecond"`
	LatencyP95Ms            int     `json:"latencyP95Ms"`
	GPUUtilizationPercent   float64 `json:"gpuUtilizationPercent"`
	MemoryUtilizationPercent float64 `json:"memoryUtilizationPercent"`
	ActiveTasks             int     `json:"activeTasks"`
	QueuedTasks             int     `json:"queuedTasks"`
	ErrorRatePercent        float64 `json:"errorRatePercent"`
	ProviderHealthy         bool    `json:"providerHealthy"`
	ElapsedSeconds          int     `json:"elapsedSeconds"`
	SpendUsd                float64 `json:"spendUsd"`
	IdleSeconds             int     `json:"idleSeconds"`
	ServerlessFallbackHealthy bool  `json:"serverlessFallbackHealthy"`
}

type GalSwarmCapacityDecision struct {
	Action                 GalSwarmCapacityAction `json:"action"`
	Reason                 GalSwarmCapacityReason `json:"reason"`
	DesiredWorkers         int                    `json:"desiredWorkers"`
	ServerlessFallbackActive bool                 `json:"serverlessFallbackActive"`
	Drain                  bool                   `json:"drain"`
	Shutdown               bool                   `json:"shutdown"`
	Explanation            string                 `json:"explanation"`
}

type GalSwarmProviderExecutorMode string

const (
	GalSwarmProviderExecutorModeNoopDryRun GalSwarmProviderExecutorMode = "noop-dry-run"
	GalSwarmProviderExecutorModeApply      GalSwarmProviderExecutorMode = "apply"
)

type GalSwarmProviderOperationType string

const (
	GalSwarmProviderOperationTypeNone             GalSwarmProviderOperationType = "none"
	GalSwarmProviderOperationTypeScaleUp          GalSwarmProviderOperationType = "scale-up"
	GalSwarmProviderOperationTypeDrainWorkers     GalSwarmProviderOperationType = "drain-workers"
	GalSwarmProviderOperationTypeRouteServerless  GalSwarmProviderOperationType = "route-serverless"
	GalSwarmProviderOperationTypeShutdownCapacity GalSwarmProviderOperationType = "shutdown-capacity"
)

type GalSwarmProviderOperation struct {
	Type                 GalSwarmProviderOperationType `json:"type"`
	Provider             GalSwarmSandboxProvider        `json:"provider"`
	ComputeProfileID     string                         `json:"computeProfileId"`
	DesiredWorkers       int                            `json:"desiredWorkers"`
	DesiredComputeUnits  int                            `json:"desiredComputeUnits"`
	ServerlessEndpointID string                         `json:"serverlessEndpointId"`
	DryRun               bool                           `json:"dryRun"`
	Reason               string                         `json:"reason"`
	Command              string                         `json:"command"`
}

type GalSwarmProviderActionPlan struct {
	ExecutorMode     GalSwarmProviderExecutorMode `json:"executorMode"`
	Provider         GalSwarmSandboxProvider        `json:"provider"`
	Operation        GalSwarmProviderOperation     `json:"operation"`
	RequiresApproval bool                          `json:"requiresApproval"`
	CanApply         bool                          `json:"canApply"`
	Notes            []string                      `json:"notes"`
}

type GalSwarmComputeTarget struct {
	Provider             *GalSwarmSandboxProvider        `json:"provider,omitempty"`
	SandboxProvider      *GalSwarmSandboxProvider        `json:"sandboxProvider,omitempty"`
	ComputeProfileID     string                          `json:"computeProfileId"`
	CapacityPolicyProfile *GalSwarmCapacityPolicyProfile `json:"capacityPolicyProfile,omitempty"`
	DesiredWorkers       int                             `json:"desiredWorkers"`
	DesiredComputeUnits  int                             `json:"desiredComputeUnits"`
	TTLHours             float64                         `json:"ttlHours"`
	MaxHourlyUsd         float64                         `json:"maxHourlyUsd"`
	ServerlessEndpointID string                          `json:"serverlessEndpointId"`
}

type GalSwarmRunRequest struct {
	OrgName            string                           `json:"orgName"`
	Objective          string                           `json:"objective"`
	Questionnaire      *GalSwarmOperatorQuestionnaire    `json:"questionnaire,omitempty"`
	Source             GalSwarmTriggerSource             `json:"source"`
	Mode               GalSwarmRunMode                   `json:"mode"`
	Target             GalSwarmComputeTarget             `json:"target"`
	Workload           GalSwarmWorkloadEstimate          `json:"workload"`
	ApprovalEvidenceURL *string                          `json:"approvalEvidenceUrl,omitempty"`
	ExecutionApproval  *GalSwarmExecutionApproval        `json:"executionApproval,omitempty"`
	CorrelationID      *string                          `json:"correlationId,omitempty"`
}

type GalSwarmStratusOperation struct {
	Type              string `json:"type"`
	TaskType          string `json:"taskType"`
	DispatchSurface   string `json:"dispatchSurface"`
	ControllerEndpoint *string `json:"controllerEndpoint,omitempty"`
	ArtifactName      *string `json:"artifactName,omitempty"`
}

type GalSwarmRunPreflightCategory string

type GalSwarmRunPreflightCheck struct {
	ID          string                      `json:"id"`
	Category    string                      `json:"category"`
	Required    bool                        `json:"required"`
	Status      string                      `json:"status"`
	Description string                      `json:"description"`
}

type GalSwarmRunPlan struct {
	APIVersion                string                      `json:"apiVersion"`
	RunID                     string                      `json:"runId"`
	OrgName                   string                      `json:"orgName"`
	Status                    GalSwarmRunStatus           `json:"status"`
	Source                    GalSwarmTriggerSource       `json:"source"`
	Mode                      GalSwarmRunMode             `json:"mode"`
	Objective                 string                      `json:"objective"`
	Questionnaire             GalSwarmOperatorQuestionnaire `json:"questionnaire"`
	ExecutionApproval         GalSwarmExecutionApproval   `json:"executionApproval"`
	Target                    GalSwarmComputeTarget        `json:"target"`
	Workload                  GalSwarmWorkloadEstimate     `json:"workload"`
	PredictedDurationSeconds  int                         `json:"predictedDurationSeconds"`
	PredictedTokenSeconds     int                         `json:"predictedTokenSeconds"`
	ServerlessFallbackRequired bool                       `json:"serverlessFallbackRequired"`
	ApprovalRequired          bool                        `json:"approvalRequired"`
	PreflightChecks          []GalSwarmRunPreflightCheck  `json:"preflightChecks"`
	StratusOperations        []GalSwarmStratusOperation   `json:"stratusOperations"`
}

// Runner labels
const (
	GalSwarmDefaultRunnerLabel = "agents-standard-kata-x64"
)

var GalSwarmBurstRunnerLabels = []string{"agents-nano-kata-x64", "agents-low-kata-x64"}

var GalSwarmDefaultRunnerLabels = []string{
	GalSwarmDefaultRunnerLabel,
	"agents-medium-kata-x64",
	"agents-high-kata-x64",
}

var GalSwarmKataRunnerLabels = append([]string{}, append(GalSwarmBurstRunnerLabels, GalSwarmDefaultRunnerLabels...)...)

var GalSwarmRuncRunnerLabels = []string{
	"agents-standard-runc-x64",
	"agents-medium-runc-x64",
	"agents-high-runc-x64",
}

var GalSwarmRunnerLabels = append(append([]string{}, GalSwarmKataRunnerLabels...), GalSwarmRuncRunnerLabels...)

var GalSwarmLegacyRunnerLabels = map[string]string{
	"arc-linux-agents":       "agents-standard-kata-x64",
	"arc-linux-agents-kata":  "agents-standard-kata-x64",
	"agents-nano-kata":       "agents-nano-kata-x64",
	"agents-low-kata":        "agents-low-kata-x64",
	"agents-standard-kata":   "agents-standard-kata-x64",
	"agents-medium-kata":     "agents-medium-kata-x64",
	"agents-high-kata":       "agents-high-kata-x64",
	"arc-linux-agents-runc":  "agents-standard-runc-x64",
	"agents-standard-runc":   "agents-standard-runc-x64",
	"agents-medium-runc":     "agents-medium-runc-x64",
	"agents-high-runc":       "agents-high-runc-x64",
	"agents-standard-vz-arm64": "agents-standard-kata-x64",
	"agents-medium-vz-arm64":   "agents-medium-kata-x64",
	"agents-high-vz-arm64":     "agents-high-kata-x64",
}

type GalSwarmWorkerDispatchBackend string

type GalSwarmWorkerAgent string

type GalSwarmWorkerIssue struct {
	Repository  string   `json:"repository"`
	IssueNumber int      `json:"issueNumber"`
	Title       string   `json:"title"`
	URL         *string  `json:"url,omitempty"`
	Labels      []string `json:"labels,omitempty"`
}

type GalSwarmWorkerDispatchRequest struct {
	Enabled         bool                          `json:"enabled"`
	MaxSessions     *int                          `json:"maxSessions,omitempty"`
	ProjectContext  *string                       `json:"projectContext,omitempty"`
	Branch          *string                       `json:"branch,omitempty"`
	Agent           *string                       `json:"agent,omitempty"`
	Model           *string                       `json:"model,omitempty"`
	RunnerLabel     *string                       `json:"runnerLabel,omitempty"`
	RunnerLabels    []string                      `json:"runnerLabels,omitempty"`
	DispatchBackend *GalSwarmWorkerDispatchBackend `json:"dispatchBackend,omitempty"`
	Issues          []GalSwarmWorkerIssue         `json:"issues"`
}

type GalSwarmWorkerSessionDispatch struct {
	Status          string  `json:"status"`
	SessionID       *string `json:"sessionId,omitempty"`
	DispatchID      *int    `json:"dispatchId,omitempty"`
	DispatchSurface *string `json:"dispatchSurface,omitempty"`
	Repository      string  `json:"repository"`
	IssueNumber     int     `json:"issueNumber"`
	Title           string  `json:"title"`
	URL             *string `json:"url,omitempty"`
	RunnerLabel     *string `json:"runnerLabel,omitempty"`
	Error           *string `json:"error,omitempty"`
}

type GalSwarmWorkerDispatchState struct {
	Status       string                         `json:"status"`
	Requested    int                            `json:"requested"`
	Dispatched   int                            `json:"dispatched"`
	Failed       int                            `json:"failed"`
	MaxSessions  int                            `json:"maxSessions"`
	RunnerLabels []string                       `json:"runnerLabels,omitempty"`
	DispatchedAt string                         `json:"dispatchedAt"`
	Sessions     []GalSwarmWorkerSessionDispatch `json:"sessions"`
}

type GalSwarmRunCloseoutOutcome string

type GalSwarmRunCloseoutReason string

type GalSwarmRunCloseoutIntent struct {
	Type        string  `json:"type"`
	RequestedAt string  `json:"requestedAt"`
	RequestedBy *string `json:"requestedBy,omitempty"`
}

type GalSwarmRunCloseout struct {
	Outcome                string `json:"outcome"`
	Reason                 string `json:"reason"`
	FinalizedAt            string `json:"finalizedAt"`
	TotalSessions          int    `json:"totalSessions"`
	DispatchedSessions     int    `json:"dispatchedSessions"`
	FailedSessions         int    `json:"failedSessions"`
	CleanupRequestedSessions int `json:"cleanupRequestedSessions"`
}

type GalSwarmStoredRun struct {
	Plan                 *GalSwarmRunPlan              `json:"plan"`
	ApprovalEvidenceURL  *string                       `json:"approvalEvidenceUrl,omitempty"`
	CreatedAt            string                        `json:"createdAt"`
	UpdatedAt            string                        `json:"updatedAt"`
	Actuals              *GalSwarmExecutionActuals      `json:"actuals,omitempty"`
	Calibration          *GalSwarmCalibrationSummary    `json:"calibration,omitempty"`
	CapacityObservation  *GalSwarmCapacityObservation   `json:"capacityObservation,omitempty"`
	CapacityDecision     *GalSwarmCapacityDecision      `json:"capacityDecision,omitempty"`
	ProviderActionPlan   *GalSwarmProviderActionPlan    `json:"providerActionPlan,omitempty"`
	CloseoutIntent       *GalSwarmRunCloseoutIntent     `json:"closeoutIntent,omitempty"`
	Closeout             *GalSwarmRunCloseout           `json:"closeout,omitempty"`
	WorkerDispatch       *GalSwarmWorkerDispatchState   `json:"workerDispatch,omitempty"`
}

// ---------------------------------------------------------------------------
// Planning types
// ---------------------------------------------------------------------------

type GalSwarmPriorityClass string

const (
	GalSwarmPriorityClassReleaseCritical GalSwarmPriorityClass = "release-critical"
	GalSwarmPriorityClassUserFacing      GalSwarmPriorityClass = "user-facing"
	GalSwarmPriorityClassScheduled       GalSwarmPriorityClass = "scheduled"
	GalSwarmPriorityClassSpeculative     GalSwarmPriorityClass = "speculative"
)

var GalSwarmAllPriorityClasses = []GalSwarmPriorityClass{
	GalSwarmPriorityClassReleaseCritical, GalSwarmPriorityClassUserFacing,
	GalSwarmPriorityClassScheduled, GalSwarmPriorityClassSpeculative,
}

type GalSwarmDecisionAction string

const (
	GalSwarmDecisionActionScaleUp         GalSwarmDecisionAction = "scale_up"
	GalSwarmDecisionActionHold            GalSwarmDecisionAction = "hold"
	GalSwarmDecisionActionDrain           GalSwarmDecisionAction = "drain"
	GalSwarmDecisionActionRouteServerless GalSwarmDecisionAction = "route_serverless"
	GalSwarmDecisionActionShutdown        GalSwarmDecisionAction = "shutdown"
)

type GalSwarmRoutingTarget string

const (
	GalSwarmRoutingTargetSelfHosted GalSwarmRoutingTarget = "self_hosted"
	GalSwarmRoutingTargetServerless GalSwarmRoutingTarget = "serverless"
)

type GalSwarmBillingGranularity string

type GalSwarmLifecycleSurface string

type GalSwarmMetricsSurface string

type GalSwarmPriorityMix struct {
	PriorityClass         GalSwarmPriorityClass `json:"priorityClass"`
	RunnableWorkUnits     int                   `json:"runnableWorkUnits"`
	ExpectedRuntimeMinutes float64               `json:"expectedRuntimeMinutes"`
}

type GalSwarmLoadSnapshot struct {
	QueuedWorkUnits              int                 `json:"queuedWorkUnits"`
	RunnableWorkUnits            int                 `json:"runnableWorkUnits"`
	ActiveWorkers                int                 `json:"activeWorkers"`
	BusyWorkers                  int                 `json:"busyWorkers"`
	IdleWorkers                  int                 `json:"idleWorkers"`
	AvgQueueWaitSeconds          float64             `json:"avgQueueWaitSeconds"`
	P95QueueWaitSeconds          float64             `json:"p95QueueWaitSeconds"`
	ExpectedRuntimeMinutes       float64             `json:"expectedRuntimeMinutes"`
	TargetCompletionWindowMinutes float64            `json:"targetCompletionWindowMinutes"`
	PriorityMix                  []GalSwarmPriorityMix `json:"priorityMix"`
}

type GalSwarmCostSnapshot struct {
	Provider              GalSwarmProviderKind `json:"provider"`
	HourlyCostUsd         float64              `json:"hourlyCostUsd"`
	StartupLatencySeconds int                  `json:"startupLatencySeconds"`
	ShutdownLatencySeconds int                 `json:"shutdownLatencySeconds"`
	MinimumBillableSeconds int                  `json:"minimumBillableSeconds"`
	CurrentSpendUsd       float64              `json:"currentSpendUsd"`
	ProjectedSpendUsd     float64              `json:"projectedSpendUsd"`
}

type GalSwarmProviderIntegrationProfile struct {
	Provider              GalSwarmProviderKind    `json:"provider"`
	LifecycleSurface      GalSwarmLifecycleSurface `json:"lifecycleSurface"`
	BillingGranularity    GalSwarmBillingGranularity `json:"billingGranularity"`
	CanScaleToZero        bool                    `json:"canScaleToZero"`
	SupportsStop          bool                    `json:"supportsStop"`
	SupportsTerminate     bool                    `json:"supportsTerminate"`
	SupportsSpot          bool                    `json:"supportsSpot"`
	SupportsReservations  bool                    `json:"supportsReservations"`
	SupportsServerless    bool                    `json:"supportsServerless"`
	MinBillableSeconds    int                     `json:"minBillableSeconds"`
	TypicalStartupSeconds int                     `json:"typicalStartupSeconds"`
	TypicalShutdownSeconds int                    `json:"typicalShutdownSeconds"`
	MetricsSurfaces       []GalSwarmMetricsSurface `json:"metricsSurfaces"`
	AdapterPackage        *string                 `json:"adapterPackage,omitempty"`
	SDKPackages           []string                `json:"sdkPackages"`
	AuthSecretNames       []string                `json:"authSecretNames"`
	Notes                 string                  `json:"notes"`
}

type GalSwarmProviderCandidate struct {
	Provider              GalSwarmProviderKind `json:"provider"`
	ComputeProfileID      string               `json:"computeProfileId"`
	HourlyCostUsd         float64              `json:"hourlyCostUsd"`
	EstimatedStartupSeconds *int                `json:"estimatedStartupSeconds,omitempty"`
	EstimatedShutdownSeconds *int               `json:"estimatedShutdownSeconds,omitempty"`
	MinBillableSeconds    *int                 `json:"minBillableSeconds,omitempty"`
	Available             bool                 `json:"available"`
	ReliabilityScore      float64              `json:"reliabilityScore"`
	LocalityScore         *float64             `json:"localityScore,omitempty"`
	RequiresReservation   *bool                `json:"requiresReservation,omitempty"`
	Notes                 *string              `json:"notes,omitempty"`
}

type GalSwarmRankedProviderCandidate struct {
	Provider              GalSwarmProviderKind `json:"provider"`
	ComputeProfileID      string               `json:"computeProfileId"`
	HourlyCostUsd         float64              `json:"hourlyCostUsd"`
	EstimatedStartupSeconds *int                `json:"estimatedStartupSeconds,omitempty"`
	EstimatedShutdownSeconds *int               `json:"estimatedShutdownSeconds,omitempty"`
	MinBillableSeconds    *int                 `json:"minBillableSeconds,omitempty"`
	Available             bool                 `json:"available"`
	ReliabilityScore      float64              `json:"reliabilityScore"`
	LocalityScore         *float64             `json:"localityScore,omitempty"`
	RequiresReservation   *bool                `json:"requiresReservation,omitempty"`
	Notes                 *string              `json:"notes,omitempty"`
	EstimatedCostUsd      float64              `json:"estimatedCostUsd"`
	BillableSeconds       int                  `json:"billableSeconds"`
	Score                 float64              `json:"score"`
	Reason                string               `json:"reason"`
}

type GalSwarmProviderSelectionInput struct {
	Plan                 *GalSwarmPlan               `json:"plan"`
	ExpectedRuntimeMinutes float64                   `json:"expectedRuntimeMinutes"`
	DesiredWorkers       int                         `json:"desiredWorkers"`
	DesiredComputeUnits  *int                        `json:"desiredComputeUnits,omitempty"`
	Candidates           []GalSwarmProviderCandidate `json:"candidates"`
}

type GalSwarmProviderSelection struct {
	Selected         *GalSwarmRankedProviderCandidate   `json:"selected,omitempty"`
	RankedCandidates []GalSwarmRankedProviderCandidate `json:"rankedCandidates"`
}

type GalSwarmComputeProfile struct {
	ID                 string                    `json:"id"`
	Provider           GalSwarmProviderKind      `json:"provider"`
	Label              string                    `json:"label"`
	Region             *string                   `json:"region,omitempty"`
	Zone               *string                   `json:"zone,omitempty"`
	Spot               *bool                     `json:"spot,omitempty"`
	ModelID            *string                   `json:"modelId,omitempty"`
	Purpose            *string                   `json:"purpose,omitempty"`
	MaxDurationMinutes *int                      `json:"maxDurationMinutes,omitempty"`
	MaxSpendUsd        *float64                  `json:"maxSpendUsd,omitempty"`
	CPUCores           *int                      `json:"cpuCores,omitempty"`
	MemoryGb           *int                      `json:"memoryGb,omitempty"`
	GPUType            *string                   `json:"gpuType,omitempty"`
	GPUCount           *int                      `json:"gpuCount,omitempty"`
	DiskGb             *int                      `json:"diskGb,omitempty"`
	Image              *string                   `json:"image,omitempty"`
	ImageRef           *string                   `json:"imageRef,omitempty"`
	ModelCache         *GalSwarmModelCacheProfile `json:"modelCache,omitempty"`
	StartupBudgetSeconds *int                    `json:"startupBudgetSeconds,omitempty"`
	ReadinessProbe     *GalSwarmReadinessProbe    `json:"readinessProbe,omitempty"`
	ShutdownPolicy     *GalSwarmShutdownPolicy    `json:"shutdownPolicy,omitempty"`
	Tools              []string                   `json:"tools"`
}

type GalSwarmModelCacheMode string

type GalSwarmModelCacheProfile struct {
	URI                  *string               `json:"uri,omitempty"`
	Mode                 GalSwarmModelCacheMode `json:"mode"`
	MountPath            string                `json:"mountPath"`
	ExpectedHitRate      float64               `json:"expectedHitRate"`
	HydrateTimeoutSeconds int                  `json:"hydrateTimeoutSeconds"`
}

type GalSwarmReadinessProbe struct {
	Type           string `json:"type"`
	Path           string `json:"path"`
	Port           int    `json:"port"`
	TimeoutSeconds int    `json:"timeoutSeconds"`
	IntervalSeconds int   `json:"intervalSeconds"`
}

type GalSwarmShutdownPolicy struct {
	MaxDurationSeconds int  `json:"maxDurationSeconds"`
	DeleteInstance     bool `json:"deleteInstance"`
	DeleteBootDisk     bool `json:"deleteBootDisk"`
	CleanupNetwork     bool `json:"cleanupNetwork"`
}

type GalSwarmServerlessEndpointProfile struct {
	ID                    string              `json:"id"`
	Provider              GalSwarmProviderKind `json:"provider"`
	Label                 string              `json:"label"`
	EndpointRef           string              `json:"endpointRef"`
	ModelID               *string             `json:"modelId,omitempty"`
	MaxQueueWaitSeconds   int                 `json:"maxQueueWaitSeconds"`
	MaxCostUsdPer1KTokens *float64            `json:"maxCostUsdPer1kTokens,omitempty"`
	Tools                 []string            `json:"tools"`
}

type GalSwarmServerlessFallbackPolicy struct {
	Enabled              bool    `json:"enabled"`
	EndpointID           string  `json:"endpointId"`
	SwitchBelowUtilization float64 `json:"switchBelowUtilization"`
	MinSustainSeconds    int     `json:"minSustainSeconds"`
	DrainSelfHosted      bool    `json:"drainSelfHosted"`
}

type GalSwarmPermissionProfile struct {
	AllowedRepos       []string `json:"allowedRepos"`
	AllowedSecrets     []string `json:"allowedSecrets"`
	AllowedNetworks    []string `json:"allowedNetworks"`
	AllowedTools       []string `json:"allowedTools"`
	AllowDeployments   bool     `json:"allowDeployments"`
	MaxPrivilegeReason string   `json:"maxPrivilegeReason"`
}

type GalSwarmPlan struct {
	SchemaVersion                     string                          `json:"schemaVersion"`
	SwarmID                           string                          `json:"swarmId"`
	Objective                         string                          `json:"objective"`
	OrchestrationMode                 GalSwarmOrchestrationMode       `json:"orchestrationMode"`
	MaxDurationMinutes                float64                         `json:"maxDurationMinutes"`
	MaxSpendUsd                       float64                         `json:"maxSpendUsd"`
	TargetQueueWaitSeconds            int                             `json:"targetQueueWaitSeconds"`
	MinEffectiveUtilization           float64                         `json:"minEffectiveUtilization"`
	DrainBelowUtilizationForSeconds   int                             `json:"drainBelowUtilizationForSeconds"`
	ShutdownBelowUtilizationForSeconds int                            `json:"shutdownBelowUtilizationForSeconds"`
	MinWorkers                        int                             `json:"minWorkers"`
	MaxWorkers                        int                             `json:"maxWorkers"`
	PriorityOrder                     []GalSwarmPriorityClass          `json:"priorityOrder"`
	Providers                         []GalSwarmProviderKind           `json:"providers"`
	ComputeProfiles                   []GalSwarmComputeProfile         `json:"computeProfiles"`
	ServerlessEndpoints               []GalSwarmServerlessEndpointProfile `json:"serverlessEndpoints,omitempty"`
	ServerlessFallback                *GalSwarmServerlessFallbackPolicy `json:"serverlessFallback,omitempty"`
	Permissions                       GalSwarmPermissionProfile        `json:"permissions"`
}

type GalSwarmWorkerLease struct {
	SchemaVersion      string              `json:"schemaVersion"`
	LeaseID            string              `json:"leaseId"`
	SwarmID            string              `json:"swarmId"`
	WorkerID           string              `json:"workerId"`
	Provider           GalSwarmProviderKind `json:"provider"`
	ComputeProfileID   string              `json:"computeProfileId"`
	PriorityClass      GalSwarmPriorityClass `json:"priorityClass"`
	LeaseStartedAt     string              `json:"leaseStartedAt"`
	LeaseExpiresAt     string              `json:"leaseExpiresAt"`
	MaxCostUsd         float64             `json:"maxCostUsd"`
	AllowedRepos       []string            `json:"allowedRepos"`
	AllowedTools       []string            `json:"allowedTools"`
	DrainAfterIdleSeconds int             `json:"drainAfterIdleSeconds"`
	Metadata           map[string]any      `json:"metadata,omitempty"`
}

type GalSwarmDecision struct {
	SchemaVersion      string                 `json:"schemaVersion"`
	SwarmID            string                 `json:"swarmId"`
	Action             GalSwarmDecisionAction  `json:"action"`
	DesiredWorkers     int                    `json:"desiredWorkers"`
	DesiredComputeUnits *int                   `json:"desiredComputeUnits,omitempty"`
	Provider           *GalSwarmProviderKind   `json:"provider,omitempty"`
	ComputeProfileID   *string                `json:"computeProfileId,omitempty"`
	RoutingTarget      *GalSwarmRoutingTarget  `json:"routingTarget,omitempty"`
	ServerlessEndpointID *string              `json:"serverlessEndpointId,omitempty"`
	Reason             string                 `json:"reason"`
	Pressure           float64                `json:"pressure"`
	EffectiveUtilization float64              `json:"effectiveUtilization"`
	ProjectedSpendUsd  float64                `json:"projectedSpendUsd"`
	PriorityClass      *GalSwarmPriorityClass  `json:"priorityClass,omitempty"`
	EvaluatedAt        string                 `json:"evaluatedAt"`
}

type GalSwarmPreflightSeverity string

const (
	GalSwarmPreflightSeverityBlocker GalSwarmPreflightSeverity = "blocker"
	GalSwarmPreflightSeverityWarning GalSwarmPreflightSeverity = "warning"
)

type GalSwarmPreflightCheck struct {
	ID       string                   `json:"id"`
	Title    string                   `json:"title"`
	Severity GalSwarmPreflightSeverity `json:"severity"`
	Passed   bool                     `json:"passed"`
	Reason   string                   `json:"reason"`
}

type GalSwarmBurstPreflightInput struct {
	Plan                          *GalSwarmPlan                    `json:"plan"`
	Decision                      *GalSwarmDecision                `json:"decision"`
	Cost                          *GalSwarmCostSnapshot            `json:"cost"`
	SelectedProvider              *GalSwarmRankedProviderCandidate  `json:"selectedProvider,omitempty"`
	RunnableTaskCount             int                              `json:"runnableTaskCount"`
	BlockedTaskCount              int                              `json:"blockedTaskCount"`
	MaxAllowedSpendUsd            float64                          `json:"maxAllowedSpendUsd"`
	MaxAllowedComputeUnits        int                              `json:"maxAllowedComputeUnits"`
	RuntimeTelemetryConfigured    bool                             `json:"runtimeTelemetryConfigured"`
	ProviderCredentialsConfigured bool                             `json:"providerCredentialsConfigured"`
	RequireNoDeployments          *bool                            `json:"requireNoDeployments,omitempty"`
}

type GalSwarmBurstPreflightResult struct {
	SchemaVersion string                `json:"schemaVersion"`
	SwarmID       string                `json:"swarmId"`
	Passed        bool                  `json:"passed"`
	BlockerCount  int                   `json:"blockerCount"`
	WarningCount  int                   `json:"warningCount"`
	Checks        []GalSwarmPreflightCheck `json:"checks"`
}

// ---------------------------------------------------------------------------
// Topology types
// ---------------------------------------------------------------------------

type GalSwarmOrchestrationMode string

const (
	GalSwarmOrchestrationModeSequential    GalSwarmOrchestrationMode = "sequential"
	GalSwarmOrchestrationModeConcurrent    GalSwarmOrchestrationMode = "concurrent"
	GalSwarmOrchestrationModeGraph         GalSwarmOrchestrationMode = "graph"
	GalSwarmOrchestrationModeHierarchical  GalSwarmOrchestrationMode = "hierarchical"
	GalSwarmOrchestrationModeMixture       GalSwarmOrchestrationMode = "mixture"
	GalSwarmOrchestrationModeGroupChat     GalSwarmOrchestrationMode = "group_chat"
	GalSwarmOrchestrationModeForest        GalSwarmOrchestrationMode = "forest"
	GalSwarmOrchestrationModeHeavy         GalSwarmOrchestrationMode = "heavy"
	GalSwarmOrchestrationModeRouter        GalSwarmOrchestrationMode = "router"
)

var GalSwarmAllOrchestrationModes = []GalSwarmOrchestrationMode{
	GalSwarmOrchestrationModeSequential, GalSwarmOrchestrationModeConcurrent,
	GalSwarmOrchestrationModeGraph, GalSwarmOrchestrationModeHierarchical,
	GalSwarmOrchestrationModeMixture, GalSwarmOrchestrationModeGroupChat,
	GalSwarmOrchestrationModeForest, GalSwarmOrchestrationModeHeavy,
	GalSwarmOrchestrationModeRouter,
}

type GalSwarmDesiredTopologyMode = string

var GalSwarmDefaultX64RunnerLabels = []string{
	"agents-standard-kata-x64", "agents-medium-kata-x64", "agents-high-kata-x64",
}

type GalSwarmPublicTopologyMode = string

type GalSwarmTopologyModeInput = string

type GalSwarmTopologyModeMapping struct {
	PublicMode    string `json:"publicMode"`
	CanonicalMode string `json:"canonicalMode"`
	Family        string `json:"family"`
	Reason        string `json:"reason"`
}

type GalSwarmTopologyAlias struct {
	Alias         string `json:"alias"`
	CanonicalMode string `json:"canonicalMode"`
	Family        string `json:"family"`
	Source        string `json:"source"`
}

type GalSwarmNormalizedTopologyMode struct {
	InputMode     string `json:"inputMode"`
	PublicMode    string `json:"publicMode"`
	CanonicalMode string `json:"canonicalMode"`
	Reason        string `json:"reason"`
}

type GalSwarmRiskLevel string

const (
	GalSwarmRiskLevelLow      GalSwarmRiskLevel = "low"
	GalSwarmRiskLevelMedium   GalSwarmRiskLevel = "medium"
	GalSwarmRiskLevelHigh     GalSwarmRiskLevel = "high"
	GalSwarmRiskLevelCritical GalSwarmRiskLevel = "critical"
)

var GalSwarmAllRiskLevels = []GalSwarmRiskLevel{
	GalSwarmRiskLevelLow, GalSwarmRiskLevelMedium, GalSwarmRiskLevelHigh, GalSwarmRiskLevelCritical,
}

type GalSwarmTaskKind string

const (
	GalSwarmTaskKindScope          GalSwarmTaskKind = "scope"
	GalSwarmTaskKindImplementation GalSwarmTaskKind = "implementation"
	GalSwarmTaskKindBuild          GalSwarmTaskKind = "build"
	GalSwarmTaskKindTest           GalSwarmTaskKind = "test"
	GalSwarmTaskKindReview         GalSwarmTaskKind = "review"
	GalSwarmTaskKindSecurity       GalSwarmTaskKind = "security"
	GalSwarmTaskKindMacIOS         GalSwarmTaskKind = "mac_ios"
	GalSwarmTaskKindDocs           GalSwarmTaskKind = "docs"
	GalSwarmTaskKindRelease        GalSwarmTaskKind = "release"
	GalSwarmTaskKindReconcile      GalSwarmTaskKind = "reconcile"
	GalSwarmTaskKindVerify         GalSwarmTaskKind = "verify"
)

var GalSwarmAllTaskKinds = []GalSwarmTaskKind{
	GalSwarmTaskKindScope, GalSwarmTaskKindImplementation, GalSwarmTaskKindBuild,
	GalSwarmTaskKindTest, GalSwarmTaskKindReview, GalSwarmTaskKindSecurity,
	GalSwarmTaskKindMacIOS, GalSwarmTaskKindDocs, GalSwarmTaskKindRelease,
	GalSwarmTaskKindReconcile, GalSwarmTaskKindVerify,
}

type GalSwarmLaneRole string

const (
	GalSwarmLaneRoleDirector   GalSwarmLaneRole = "director"
	GalSwarmLaneRoleScope      GalSwarmLaneRole = "scope"
	GalSwarmLaneRoleWorker     GalSwarmLaneRole = "worker"
	GalSwarmLaneRoleReviewer   GalSwarmLaneRole = "reviewer"
	GalSwarmLaneRoleReconciler GalSwarmLaneRole = "reconciler"
	GalSwarmLaneRoleVerifier   GalSwarmLaneRole = "verifier"
)

var GalSwarmAllLaneRoles = []GalSwarmLaneRole{
	GalSwarmLaneRoleDirector, GalSwarmLaneRoleScope, GalSwarmLaneRoleWorker,
	GalSwarmLaneRoleReviewer, GalSwarmLaneRoleReconciler, GalSwarmLaneRoleVerifier,
}

type GalSwarmFleetCapability string

const (
	GalSwarmFleetCapabilityLinuxX64    GalSwarmFleetCapability = "linux-x64"
	GalSwarmFleetCapabilityDarwinArm64 GalSwarmFleetCapability = "darwin-arm64"
	GalSwarmFleetCapabilityMac         GalSwarmFleetCapability = "mac"
	GalSwarmFleetCapabilityIOS         GalSwarmFleetCapability = "ios"
	GalSwarmFleetCapabilityKali        GalSwarmFleetCapability = "kali"
	GalSwarmFleetCapabilitySecurity    GalSwarmFleetCapability = "security"
	GalSwarmFleetCapabilityDocker      GalSwarmFleetCapability = "docker"
	GalSwarmFleetCapabilityBuild       GalSwarmFleetCapability = "build"
	GalSwarmFleetCapabilityTest        GalSwarmFleetCapability = "test"
	GalSwarmFleetCapabilityBrowser     GalSwarmFleetCapability = "browser"
	GalSwarmFleetCapabilityGPU         GalSwarmFleetCapability = "gpu"
	GalSwarmFleetCapabilityRepoWrite   GalSwarmFleetCapability = "repo-write"
	GalSwarmFleetCapabilityReview      GalSwarmFleetCapability = "review"
)

var GalSwarmAllFleetCapabilities = []GalSwarmFleetCapability{
	GalSwarmFleetCapabilityLinuxX64, GalSwarmFleetCapabilityDarwinArm64,
	GalSwarmFleetCapabilityMac, GalSwarmFleetCapabilityIOS,
	GalSwarmFleetCapabilityKali, GalSwarmFleetCapabilitySecurity,
	GalSwarmFleetCapabilityDocker, GalSwarmFleetCapabilityBuild,
	GalSwarmFleetCapabilityTest, GalSwarmFleetCapabilityBrowser,
	GalSwarmFleetCapabilityGPU, GalSwarmFleetCapabilityRepoWrite,
	GalSwarmFleetCapabilityReview,
}

type GalSwarmFleetOs string

type GalSwarmFleetArch string

type GalSwarmTopologyTask struct {
	ID                  string                  `json:"id"`
	Title               string                  `json:"title"`
	Kind                GalSwarmTaskKind         `json:"kind"`
	Repository          *string                 `json:"repository,omitempty"`
	IssueRefs           []string                `json:"issueRefs,omitempty"`
	DependsOn           []string                `json:"dependsOn,omitempty"`
	CanRunInParallel    *bool                   `json:"canRunInParallel,omitempty"`
	RiskLevel           *GalSwarmRiskLevel       `json:"riskLevel,omitempty"`
	RequiredCapabilities []GalSwarmFleetCapability `json:"requiredCapabilities,omitempty"`
	EvidenceRequirements []string                `json:"evidenceRequirements,omitempty"`
}

type GalSwarmFleetNode struct {
	ID                 string                  `json:"id"`
	Label              string                  `json:"label"`
	OS                 GalSwarmFleetOs         `json:"os"`
	Arch               GalSwarmFleetArch       `json:"arch"`
	RunnerLabels       []string                `json:"runnerLabels"`
	Capabilities       []GalSwarmFleetCapability `json:"capabilities"`
	CPUCores           *int                    `json:"cpuCores,omitempty"`
	MemoryGb           *int                    `json:"memoryGb,omitempty"`
	MaxConcurrentLanes *int                    `json:"maxConcurrentLanes,omitempty"`
	Available          *bool                   `json:"available,omitempty"`
}

type GalSwarmGovernanceConstraints struct {
	AllowedRepositories          []string `json:"allowedRepositories,omitempty"`
	AllowedTools                 []string `json:"allowedTools,omitempty"`
	MaxConcurrentLanes           *int     `json:"maxConcurrentLanes,omitempty"`
	RequireFileLeases            *bool    `json:"requireFileLeases,omitempty"`
	RequireIndependentReview     *bool    `json:"requireIndependentReview,omitempty"`
	RequireApprovalForDeployments *bool   `json:"requireApprovalForDeployments,omitempty"`
	AllowDeployments             *bool    `json:"allowDeployments,omitempty"`
}

type GalSwarmEvidenceRequirement struct {
	ID                    string           `json:"id"`
	Title                 string           `json:"title"`
	RequiredForRoles      []GalSwarmLaneRole `json:"requiredForRoles,omitempty"`
	RequiredForRiskAtLeast *GalSwarmRiskLevel `json:"requiredForRiskAtLeast,omitempty"`
}

type GalSwarmTopologyRequest struct {
	SchemaVersion        *string                        `json:"schemaVersion,omitempty"`
	Objective            string                         `json:"objective"`
	Repositories         []string                       `json:"repositories"`
	Issues               []string                       `json:"issues,omitempty"`
	RiskLevel            GalSwarmRiskLevel               `json:"riskLevel"`
	DesiredMode          *string                        `json:"desiredMode,omitempty"`
	Tasks                []GalSwarmTopologyTask          `json:"tasks"`
	Fleet                []GalSwarmFleetNode             `json:"fleet,omitempty"`
	Governance           *GalSwarmGovernanceConstraints  `json:"governance,omitempty"`
	EvidenceRequirements []GalSwarmEvidenceRequirement   `json:"evidenceRequirements,omitempty"`
}

type GalSwarmTopologyRouteDecision struct {
	Mode   GalSwarmOrchestrationMode `json:"mode"`
	Reason string                    `json:"reason"`
}

type GalSwarmLaneOwnership struct {
	TaskIDs           []string `json:"taskIds"`
	Repositories      []string `json:"repositories"`
	IssueRefs         []string `json:"issueRefs"`
	AllowedTools      []string `json:"allowedTools"`
	FileLeasesRequired bool    `json:"fileLeasesRequired"`
}

type GalSwarmLanePlacement struct {
	LaneID              string                    `json:"laneId"`
	NodeID              *string                   `json:"nodeId,omitempty"`
	RunnerLabel         string                    `json:"runnerLabel"`
	Score               float64                   `json:"score"`
	MatchedCapabilities []GalSwarmFleetCapability  `json:"matchedCapabilities"`
	MissingCapabilities []GalSwarmFleetCapability  `json:"missingCapabilities"`
	Reason              string                    `json:"reason"`
}

type GalSwarmExecutionLane struct {
	ID                   string                    `json:"id"`
	Role                 GalSwarmLaneRole           `json:"role"`
	Title                string                    `json:"title"`
	TaskIDs              []string                  `json:"taskIds"`
	DependsOnLaneIDs     []string                  `json:"dependsOnLaneIds"`
	RequiredCapabilities []GalSwarmFleetCapability  `json:"requiredCapabilities"`
	Ownership            GalSwarmLaneOwnership      `json:"ownership"`
	EvidenceExpectations []string                   `json:"evidenceExpectations"`
	Placement            GalSwarmLanePlacement      `json:"placement"`
}

type GalSwarmTopologyPlan struct {
	SchemaVersion        string                         `json:"schemaVersion"`
	Objective            string                         `json:"objective"`
	Mode                 GalSwarmOrchestrationMode       `json:"mode"`
	RouteReason          string                         `json:"routeReason"`
	RiskLevel            GalSwarmRiskLevel               `json:"riskLevel"`
	Repositories         []string                       `json:"repositories"`
	Issues               []string                       `json:"issues"`
	Tasks                []GalSwarmTopologyTask          `json:"tasks"`
	Lanes                []GalSwarmExecutionLane         `json:"lanes"`
	EvidenceRequirements []GalSwarmEvidenceRequirement   `json:"evidenceRequirements"`
	Governance           GalSwarmGovernanceNormalized    `json:"governance"`
}

type GalSwarmGovernanceNormalized struct {
	AllowedRepositories          []string `json:"allowedRepositories"`
	AllowedTools                 []string `json:"allowedTools"`
	MaxConcurrentLanes           int      `json:"maxConcurrentLanes"`
	RequireFileLeases            bool     `json:"requireFileLeases"`
	RequireIndependentReview     bool     `json:"requireIndependentReview"`
	RequireApprovalForDeployments bool    `json:"requireApprovalForDeployments"`
	AllowDeployments             bool     `json:"allowDeployments"`
}

// ---------------------------------------------------------------------------
// Evidence types
// ---------------------------------------------------------------------------

type GalSwarmWaveArtifactKind string

type GalSwarmWaveEvidenceStatus string

const (
	GalSwarmWaveEvidenceStatusPassed  GalSwarmWaveEvidenceStatus = "passed"
	GalSwarmWaveEvidenceStatusFailed  GalSwarmWaveEvidenceStatus = "failed"
	GalSwarmWaveEvidenceStatusSkipped GalSwarmWaveEvidenceStatus = "skipped"
	GalSwarmWaveEvidenceStatusBlocked GalSwarmWaveEvidenceStatus = "blocked"
)

type GalSwarmWaveConflictSeverity string

type GalSwarmWaveConflictStatus string

type GalSwarmWaveLedgerEventType string

var GalSwarmWaveLedgerEventTypes = []string{
	"wave.started", "wave.completed", "wave.canceled",
	"lease.requested", "lease.acquired", "lease.renewed", "lease.released",
	"worker.assigned", "task.dispatched", "task.transitioned",
	"artifact.recorded", "evidence.recorded",
}

type GalSwarmWaveFileLease struct {
	Repository string   `json:"repository"`
	Paths      []string `json:"paths"`
	Exclusive  *bool    `json:"exclusive,omitempty"`
	Reason     *string  `json:"reason,omitempty"`
}

type GalSwarmWaveProofArtifact struct {
	ID       string         `json:"id"`
	Kind     string         `json:"kind"`
	Title    string         `json:"title"`
	URI      *string        `json:"uri,omitempty"`
	SHA      *string        `json:"sha,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

type GalSwarmWaveTestEvidence struct {
	ID          string                   `json:"id"`
	Command     string                   `json:"command"`
	Status      GalSwarmWaveEvidenceStatus `json:"status"`
	ArtifactIDs []string                 `json:"artifactIds,omitempty"`
	Summary     *string                  `json:"summary,omitempty"`
}

type GalSwarmWaveRuntimeEvidence struct {
	ID          string                   `json:"id"`
	Target      string                   `json:"target"`
	Status      GalSwarmWaveEvidenceStatus `json:"status"`
	ArtifactIDs []string                 `json:"artifactIds,omitempty"`
	Summary     *string                  `json:"summary,omitempty"`
}

type GalSwarmWaveConflict struct {
	ID        string                    `json:"id"`
	Severity  GalSwarmWaveConflictSeverity `json:"severity"`
	Status    GalSwarmWaveConflictStatus   `json:"status"`
	LaneIDs   []string                  `json:"laneIds"`
	WorkerIDs []string                  `json:"workerIds"`
	Repository *string                  `json:"repository,omitempty"`
	Path      *string                   `json:"path,omitempty"`
	Summary   string                    `json:"summary"`
}

type GalSwarmWaveWorkerEvidence struct {
	LaneID                string                     `json:"laneId"`
	WorkerID              string                     `json:"workerId"`
	Role                  GalSwarmLaneRole            `json:"role"`
	RiskLevel             *GalSwarmRiskLevel          `json:"riskLevel,omitempty"`
	TaskIDs               []string                   `json:"taskIds"`
	AssignedRepositories  []string                   `json:"assignedRepositories"`
	FileLeases            []GalSwarmWaveFileLease     `json:"fileLeases"`
	ProofArtifacts        []GalSwarmWaveProofArtifact `json:"proofArtifacts"`
	TestEvidence          []GalSwarmWaveTestEvidence  `json:"testEvidence"`
	RuntimeEvidence       []GalSwarmWaveRuntimeEvidence `json:"runtimeEvidence"`
	Conflicts             []GalSwarmWaveConflict      `json:"conflicts,omitempty"`
	ReadyForReconciliation *bool                       `json:"readyForReconciliation,omitempty"`
	CloseoutNotes         *string                     `json:"closeoutNotes,omitempty"`
}

type GalSwarmWaveReconcilerDecision struct {
	ID                string                     `json:"id"`
	ReconcilerLaneID   string                     `json:"reconcilerLaneId"`
	RiskLevel         *GalSwarmRiskLevel          `json:"riskLevel,omitempty"`
	AcceptedWorkerIDs []string                   `json:"acceptedWorkerIds"`
	RejectedWorkerIDs []string                   `json:"rejectedWorkerIds,omitempty"`
	ResolvedConflictIDs []string                 `json:"resolvedConflictIds,omitempty"`
	ProofArtifacts    []GalSwarmWaveProofArtifact `json:"proofArtifacts"`
	TestEvidence      []GalSwarmWaveTestEvidence  `json:"testEvidence,omitempty"`
	RuntimeEvidence   []GalSwarmWaveRuntimeEvidence `json:"runtimeEvidence,omitempty"`
	ReadyForCloseout  bool                       `json:"readyForCloseout"`
	Summary           string                     `json:"summary"`
}

type GalSwarmWaveCloseoutCriterion struct {
	ID         string   `json:"id"`
	Title      string   `json:"title"`
	Satisfied  bool     `json:"satisfied"`
	ArtifactIDs []string `json:"artifactIds,omitempty"`
	Summary    *string  `json:"summary,omitempty"`
}

type GalSwarmWaveEvidenceLedger struct {
	SchemaVersion      string                          `json:"schemaVersion"`
	WaveID             string                          `json:"waveId"`
	SwarmID            string                          `json:"swarmId"`
	Objective          string                          `json:"objective"`
	RiskLevel          GalSwarmRiskLevel                `json:"riskLevel"`
	MaxSandboxes       int                             `json:"maxSandboxes"`
	CreatedAt          string                          `json:"createdAt"`
	Workers            []GalSwarmWaveWorkerEvidence     `json:"workers"`
	ReconcilerDecisions []GalSwarmWaveReconcilerDecision `json:"reconcilerDecisions"`
	CloseoutCriteria   []GalSwarmWaveCloseoutCriterion  `json:"closeoutCriteria,omitempty"`
	Metadata           map[string]any                   `json:"metadata,omitempty"`
}

type GalSwarmWaveMissingEvidence struct {
	LaneID  string   `json:"laneId"`
	WorkerID string  `json:"workerId"`
	Missing []string `json:"missing"`
}

type GalSwarmWaveLeaseConflict struct {
	Repository   string   `json:"repository"`
	Path         string   `json:"path"`
	LaneIDs      []string `json:"laneIds"`
	WorkerIDs    []string `json:"workerIds"`
	LeaseIndexes []int    `json:"leaseIndexes"`
}

type GalSwarmWaveEvidenceSummary struct {
	SchemaVersion         string                        `json:"schemaVersion"`
	WaveID                string                        `json:"waveId"`
	WorkerCount           int                           `json:"workerCount"`
	MaxSandboxes          int                           `json:"maxSandboxes"`
	RiskLevel             GalSwarmRiskLevel              `json:"riskLevel"`
	ReadyForReconciliation bool                         `json:"readyForReconciliation"`
	ReadyForCloseout      bool                          `json:"readyForCloseout"`
	MissingEvidence       []GalSwarmWaveMissingEvidence  `json:"missingEvidence"`
	ConflictingLeases     []GalSwarmWaveLeaseConflict    `json:"conflictingLeases"`
	UnresolvedConflicts   []GalSwarmWaveConflict         `json:"unresolvedConflicts"`
	ReconcilerProofRequired bool                        `json:"reconcilerProofRequired"`
	HasReconcilerProof    bool                          `json:"hasReconcilerProof"`
	Blockers              []string                      `json:"blockers"`
}

type GalSwarmWaveLedgerEvidenceRef struct {
	ID       *string        `json:"id,omitempty"`
	URL      string         `json:"url"`
	Label    *string        `json:"label,omitempty"`
	MediaType *string       `json:"mediaType,omitempty"`
	SHA256   *string        `json:"sha256,omitempty"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

type GalSwarmWaveLedgerTaskMetadata struct {
	TaskID         *string `json:"taskId,omitempty"`
	TaskState      *string `json:"taskState,omitempty"`
	AgentID        *string `json:"agentId,omitempty"`
	CorrelationID  string  `json:"correlationId"`
	ParentTaskID   *string `json:"parentTaskId,omitempty"`
}

type GalSwarmWaveLedgerEventMetadata struct {
	WaveID    string                    `json:"waveId"`
	LeaseID   *string                   `json:"leaseId,omitempty"`
	WorkerID  *string                   `json:"workerId,omitempty"`
	EventType GalSwarmWaveLedgerEventType `json:"eventType"`
	TaskID    *string                   `json:"taskId,omitempty"`
	TaskState *string                   `json:"taskState,omitempty"`
	AgentID   *string                   `json:"agentId,omitempty"`
}

type GalSwarmWaveLedgerEnvelope struct {
	SchemaVersion string                        `json:"schemaVersion"`
	ID            string                        `json:"id"`
	EventType     string                        `json:"eventType"`
	OccurredAt    string                        `json:"occurredAt"`
	WaveID        string                        `json:"waveId"`
	LeaseID       *string                       `json:"leaseId,omitempty"`
	WorkerID      *string                       `json:"workerId,omitempty"`
	Task          GalSwarmWaveLedgerTaskMetadata `json:"task"`
	Actor         *GalSwarmWaveLedgerActorIdentity  `json:"actor,omitempty"`
	Artifacts     []GalSwarmWaveLedgerArtifact   `json:"artifacts,omitempty"`
	Evidence      []GalSwarmWaveLedgerEvidenceRef `json:"evidence,omitempty"`
	Metadata      map[string]any                 `json:"metadata,omitempty"`
}

type GalSwarmWaveLedgerActorIdentity struct {
	ID          string         `json:"id"`
	Type        *string        `json:"type,omitempty"`
	DisplayName *string        `json:"displayName,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`
}

type GalSwarmWaveLedgerArtifact struct {
	ID        string         `json:"id"`
	Name      *string        `json:"name,omitempty"`
	Kind      *string        `json:"kind,omitempty"`
	URL       *string        `json:"url,omitempty"`
	MediaType *string        `json:"mediaType,omitempty"`
	SizeBytes *int           `json:"sizeBytes,omitempty"`
	SHA256    *string        `json:"sha256,omitempty"`
	Metadata  map[string]any `json:"metadata,omitempty"`
}

// ---------------------------------------------------------------------------
// Hot-start types
// ---------------------------------------------------------------------------

type GalSwarmHotStartAction string

const (
	GalSwarmHotStartActionDispatchReady     GalSwarmHotStartAction = "dispatch_ready"
	GalSwarmHotStartActionScaleReadyCapacity GalSwarmHotStartAction = "scale_ready_capacity"
	GalSwarmHotStartActionColdProvision     GalSwarmHotStartAction = "cold_provision"
)

var GalSwarmAllHotStartActions = []GalSwarmHotStartAction{
	GalSwarmHotStartActionDispatchReady, GalSwarmHotStartActionScaleReadyCapacity,
	GalSwarmHotStartActionColdProvision,
}

type GalSwarmHotStartConfidence string

const (
	GalSwarmHotStartConfidenceLow    GalSwarmHotStartConfidence = "low"
	GalSwarmHotStartConfidenceMedium GalSwarmHotStartConfidence = "medium"
	GalSwarmHotStartConfidenceHigh   GalSwarmHotStartConfidence = "high"
)

var GalSwarmAllHotStartConfidenceLevels = []GalSwarmHotStartConfidence{
	GalSwarmHotStartConfidenceLow, GalSwarmHotStartConfidenceMedium, GalSwarmHotStartConfidenceHigh,
}

type GalSwarmHotStartOwnership struct {
	ContractRepository string `json:"contractRepository"`
	StratusService     string `json:"stratusService"`
	DeploymentPath     string `json:"deploymentPath"`
	Owner              string `json:"owner"`
}

type GalSwarmHotStartSloContract struct {
	SchemaVersion            string                  `json:"schemaVersion"`
	SloID                    string                  `json:"sloId"`
	TargetDispatchLatencyMs  float64                 `json:"targetDispatchLatencyMs"`
	DesiredConcurrentSandboxes float64               `json:"desiredConcurrentSandboxes"`
	TargetConcurrentSandboxes float64                `json:"targetConcurrentSandboxes"`
	ReadyIdleTarget          float64                 `json:"readyIdleTarget"`
	MinReadyWorkers          float64                 `json:"minReadyWorkers"`
	MaxReadyWorkers          float64                 `json:"maxReadyWorkers"`
	RunnerLabels             []string                `json:"runnerLabels"`
	Ownership                GalSwarmHotStartOwnership `json:"ownership"`
	Note                     string                  `json:"note"`
}

type GalSwarmHotStartObservation struct {
	ReadyIdleWorkers        int     `json:"readyIdleWorkers"`
	ReadyAllocatableWorkers int     `json:"readyAllocatableWorkers"`
	QueuedSandboxes         int     `json:"queuedSandboxes"`
	ObservedDispatchLatencyMs *float64 `json:"observedDispatchLatencyMs,omitempty"`
}

type GalSwarmHotStartSloDecision struct {
	SchemaVersion            string                    `json:"schemaVersion"`
	SloID                    string                    `json:"sloId"`
	Action                   GalSwarmHotStartAction     `json:"action"`
	TargetDispatchLatencyMs  float64                   `json:"targetDispatchLatencyMs"`
	DesiredConcurrentSandboxes float64                 `json:"desiredConcurrentSandboxes"`
	TargetConcurrentSandboxes float64                  `json:"targetConcurrentSandboxes"`
	ReadyIdleTarget          float64                   `json:"readyIdleTarget"`
	MinReadyWorkers          float64                   `json:"minReadyWorkers"`
	MaxReadyWorkers          float64                   `json:"maxReadyWorkers"`
	RunnerLabels             []string                  `json:"runnerLabels"`
	Ownership                GalSwarmHotStartOwnership   `json:"ownership"`
	ReadyCapacityAvailable   int                       `json:"readyCapacityAvailable"`
	ReadyCapacityAfterAdmission int                    `json:"readyCapacityAfterAdmission"`
	ObservedDispatchLatencyMs *float64                 `json:"observedDispatchLatencyMs,omitempty"`
	Confidence               GalSwarmHotStartConfidence `json:"confidence"`
	Reason                   string                    `json:"reason"`
}

// ---------------------------------------------------------------------------
// Doctor types
// ---------------------------------------------------------------------------

type GalSwarmDoctorStatus string

const (
	GalSwarmDoctorStatusPass    GalSwarmDoctorStatus = "pass"
	GalSwarmDoctorStatusWarn    GalSwarmDoctorStatus = "warn"
	GalSwarmDoctorStatusFail    GalSwarmDoctorStatus = "fail"
	GalSwarmDoctorStatusUnknown GalSwarmDoctorStatus = "unknown"
)

type GalSwarmDoctorCategory string

type GalSwarmDoctorCheck struct {
	ID             string              `json:"id"`
	Title          string              `json:"title"`
	Category       GalSwarmDoctorCategory `json:"category"`
	Required       bool                `json:"required"`
	Status         GalSwarmDoctorStatus  `json:"status"`
	Evidence       *string             `json:"evidence,omitempty"`
	Remediation    *string             `json:"remediation,omitempty"`
	MaxSafeWorkers *int                `json:"maxSafeWorkers,omitempty"`
}

type GalSwarmDoctorReport struct {
	SchemaVersion       string              `json:"schemaVersion"`
	GeneratedAt         string              `json:"generatedAt"`
	TargetWorkerCount   int                 `json:"targetWorkerCount"`
	OverallStatus       GalSwarmDoctorStatus  `json:"overallStatus"`
	ReadyForWorkerTest  bool                `json:"readyForWorkerTest"`
	MaxRecommendedWorkers int               `json:"maxRecommendedWorkers"`
	Blockers            []string            `json:"blockers"`
	Warnings            []string            `json:"warnings"`
	Checks              []GalSwarmDoctorCheck `json:"checks"`
	Notes               []string            `json:"notes"`
}

type GalSwarmDoctorReportInput struct {
	GeneratedAt      *string             `json:"generatedAt,omitempty"`
	TargetWorkerCount *int                `json:"targetWorkerCount,omitempty"`
	Checks           []GalSwarmDoctorCheck `json:"checks"`
	Notes            []string            `json:"notes,omitempty"`
	ContractMaxWorkers *int               `json:"contractMaxWorkers,omitempty"`
}

// ---------------------------------------------------------------------------
// Catalog types
// ---------------------------------------------------------------------------

type GalSwarmLaunchProfileSource string

type GalSwarmLaunchProfileTier string

type GalSwarmCapacityState string

type GalSwarmStorageClass string

type GalSwarmNetworkingMode string

type GalSwarmIsolationMode string

const (
	GalSwarmIsolationModeKata GalSwarmIsolationMode = "kata"
	GalSwarmIsolationModeRunc GalSwarmIsolationMode = "runc"
)

type GalSwarmSupportLevel string

const (
	GalSwarmSupportLevelSupported       GalSwarmSupportLevel = "supported"
	GalSwarmSupportLevelPlanned         GalSwarmSupportLevel = "planned"
	GalSwarmSupportLevelNotSupported    GalSwarmSupportLevel = "not_supported"
	GalSwarmSupportLevelBreakglassOnly  GalSwarmSupportLevel = "breakglass_only"
)

type GalSwarmLifecycleSemantics struct {
	StopPreservesWorkspace         bool     `json:"stopPreservesWorkspace"`
	RestartRequiresFreshReservation bool    `json:"restartRequiresFreshReservation"`
	UpdateClearsEphemeralState     bool     `json:"updateClearsEphemeralState"`
	TerminateDeletesEphemeralState bool     `json:"terminateDeletesEphemeralState"`
	Notes                          []string `json:"notes"`
}

type GalSwarmLaunchProfileResources struct {
	CPUCores *int    `json:"cpuCores,omitempty"`
	MemoryGb *int    `json:"memoryGb,omitempty"`
	DiskGb   *int    `json:"diskGb,omitempty"`
	GPUType  *string `json:"gpuType,omitempty"`
	GPUCount *int    `json:"gpuCount,omitempty"`
}

type GalSwarmCostHints struct {
	Currency          string   `json:"currency"`
	MaxHourlyUsd      *float64 `json:"maxHourlyUsd,omitempty"`
	MaxRunSpendUsd    *float64 `json:"maxRunSpendUsd,omitempty"`
	InputTokensUsdPer1M *float64 `json:"inputTokensUsdPer1M,omitempty"`
	OutputTokensUsdPer1M *float64 `json:"outputTokensUsdPer1M,omitempty"`
	AgentUsdPerTask   *float64 `json:"agentUsdPerTask,omitempty"`
	Notes             []string `json:"notes"`
}

type GalSwarmLaunchProfile struct {
	ID                   string                      `json:"id"`
	Label                string                      `json:"label"`
	Source               GalSwarmLaunchProfileSource `json:"source"`
	Tier                 GalSwarmLaunchProfileTier   `json:"tier"`
	SupportLevel         GalSwarmSupportLevel        `json:"supportLevel"`
	CapacityState        GalSwarmCapacityState       `json:"capacityState"`
	ApprovalRequired     bool                        `json:"approvalRequired"`
	MaxSupportedWorkers  int                         `json:"maxSupportedWorkers"`
	MaxValidatedWorkers  int                         `json:"maxValidatedWorkers"`
	SandboxProvider      *GalSwarmSandboxProvider     `json:"sandboxProvider,omitempty"`
	AIProviders          []GalSwarmAIProvider         `json:"aiProviders"`
	ComputeProfileID     *string                     `json:"computeProfileId,omitempty"`
	RunnerLabels         []string                    `json:"runnerLabels"`
	CapacityPolicyProfile *GalSwarmCapacityPolicyProfile `json:"capacityPolicyProfile,omitempty"`
	IsolationMode        GalSwarmIsolationMode        `json:"isolationMode"`
	StorageClass         GalSwarmStorageClass         `json:"storageClass"`
	NetworkingMode       GalSwarmNetworkingMode       `json:"networkingMode"`
	Lifecycle            GalSwarmLifecycleSemantics   `json:"lifecycle"`
	Resources            GalSwarmLaunchProfileResources `json:"resources"`
	CostHints            GalSwarmCostHints            `json:"costHints"`
	Notes                []string                     `json:"notes"`
}

type GalSwarmArchitectureCapability struct {
	CanonicalMode  string   `json:"canonicalMode"`
	SupportLevel   GalSwarmSupportLevel `json:"supportLevel"`
	Family         string   `json:"family"`
	PublicAliases  []string `json:"publicAliases"`
	BatchReady     bool     `json:"batchReady"`
	SupportsStreaming bool  `json:"supportsStreaming"`
	RecommendedFor []string `json:"recommendedFor"`
	Notes          []string `json:"notes"`
}

type GalSwarmRateLimitSummary struct {
	TierName              string   `json:"tierName"`
	RequestsPerMinute     *int     `json:"requestsPerMinute,omitempty"`
	RequestsPerHour       *int     `json:"requestsPerHour,omitempty"`
	RequestsPerDay        *int     `json:"requestsPerDay,omitempty"`
	MaxBatchItems         *int     `json:"maxBatchItems,omitempty"`
	TokensPerWorkerRequest *int    `json:"tokensPerWorkerRequest,omitempty"`
	Endpoint              string   `json:"endpoint"`
	Notes                 []string `json:"notes"`
}

type GalSwarmPricingSummary struct {
	Currency          string   `json:"currency"`
	PricingEndpoint   string   `json:"pricingEndpoint"`
	InputTokensUsdPer1M *float64 `json:"inputTokensUsdPer1M,omitempty"`
	OutputTokensUsdPer1M *float64 `json:"outputTokensUsdPer1M,omitempty"`
	AgentUsdPerTask   *float64 `json:"agentUsdPerTask,omitempty"`
	Notes             []string `json:"notes"`
}

type GalSwarmTransportCapabilities struct {
	API                        GalSwarmSupportLevel `json:"api"`
	CLI                        GalSwarmSupportLevel `json:"cli"`
	MCP                        GalSwarmSupportLevel `json:"mcp"`
	Dashboard                  GalSwarmSupportLevel `json:"dashboard"`
	Streaming                  GalSwarmSupportLevel `json:"streaming"`
	ResponseCompression         GalSwarmSupportLevel `json:"responseCompression"`
	ResponseCompressionEncodings []string             `json:"responseCompressionEncodings"`
	Notes                      []string             `json:"notes"`
}

type GalSwarmCapabilityCatalog struct {
	SchemaVersion       string                          `json:"schemaVersion"`
	GeneratedAt         string                          `json:"generatedAt"`
	MaxSupportedWorkers int                             `json:"maxSupportedWorkers"`
	MaxValidatedWorkers int                             `json:"maxValidatedWorkers"`
	LaunchProfiles      []GalSwarmLaunchProfile          `json:"launchProfiles"`
	Architectures       []GalSwarmArchitectureCapability `json:"architectures"`
	RateLimits          GalSwarmRateLimitSummary          `json:"rateLimits"`
	Pricing             GalSwarmPricingSummary            `json:"pricing"`
	Transport           GalSwarmTransportCapabilities     `json:"transport"`
}

type GalSwarmCapabilityCatalogOptions struct {
	GeneratedAt        *string                             `json:"generatedAt,omitempty"`
	MaxValidatedWorkers *int                                `json:"maxValidatedWorkers,omitempty"`
	LaunchProfiles     []GalSwarmLaunchProfile              `json:"launchProfiles,omitempty"`
	Architectures      []GalSwarmArchitectureCapability     `json:"architectures,omitempty"`
	RateLimits         *GalSwarmRateLimitSummary            `json:"rateLimits,omitempty"`
	Pricing            *GalSwarmPricingSummary              `json:"pricing,omitempty"`
	Transport          *GalSwarmTransportCapabilities       `json:"transport,omitempty"`
}

// ---------------------------------------------------------------------------
// Run records types
// ---------------------------------------------------------------------------

type GalSwarmRunApiEndpoints struct {
	Dashboard string                         `json:"dashboard"`
	GalCode   string                         `json:"galCode"`
	Stratus   GalSwarmStratusEndpoints       `json:"stratus"`
}

type GalSwarmStratusEndpoints struct {
	SwarmAPI         string `json:"swarmApi"`
	SandboxController string `json:"sandboxController"`
	PreflightTask    string `json:"preflightTask"`
	BurstStartTask   string `json:"burstStartTask"`
	BurstRunTask     string `json:"burstRunTask"`
	DrainTask        string `json:"drainTask"`
}

type GalSwarmRunCreateResponse struct {
	Plan      *GalSwarmRunPlan       `json:"plan"`
	Run       *GalSwarmStoredRun     `json:"run"`
	Endpoints GalSwarmRunApiEndpoints `json:"endpoints"`
}

// ---------------------------------------------------------------------------
// Forecast types (referenced by planning package)
// ---------------------------------------------------------------------------

type GalSwarmForecastTaskInput struct {
	TaskID                   string  `json:"taskId"`
	ExpectedWallClockMinutes float64 `json:"expectedWallClockMinutes"`
	ExpectedCiMinutes        float64 `json:"expectedCiMinutes"`
	BlockingProbability      float64 `json:"blockingProbability"`
	CanRunInParallel         bool    `json:"canRunInParallel"`
}

type GalSwarmForecastCapacityInput struct {
	Action                      GalSwarmDecisionAction `json:"action"`
	RecommendedWorkers          int                    `json:"recommendedWorkers"`
	ExpectedUtilization         float64                `json:"expectedUtilization"`
	ExpectedUsefulWorkerMinutes float64                `json:"expectedUsefulWorkerMinutes"`
	ExpectedWastedWorkerMinutes float64                `json:"expectedWastedWorkerMinutes"`
	Reason                      string                 `json:"reason"`
}

type GalSwarmExecutionForecastInput struct {
	RequestID            string                        `json:"requestId"`
	HorizonMinutes       float64                       `json:"horizonMinutes"`
	CriticalPathMinutes  float64                       `json:"criticalPathMinutes"`
	TaskForecasts        []GalSwarmForecastTaskInput   `json:"taskForecasts"`
	Capacity             GalSwarmForecastCapacityInput  `json:"capacity"`
}

type GalSwarmPolicyOptions struct {
	Now                          func() string                   `json:"-"`
	ScaleUpPressureThreshold     *float64                        `json:"scaleUpPressureThreshold,omitempty"`
	HoldUtilizationThreshold     *float64                        `json:"holdUtilizationThreshold,omitempty"`
	DrainUtilizationThreshold    *float64                        `json:"drainUtilizationThreshold,omitempty"`
	ShutdownUtilizationThreshold *float64                        `json:"shutdownUtilizationThreshold,omitempty"`
	CapacityMinutesPerWorker     *int                            `json:"capacityMinutesPerWorker,omitempty"`
	LogicalWorkersPerComputeUnit *int                            `json:"logicalWorkersPerComputeUnit,omitempty"`
	ProviderCandidates           []GalSwarmProviderCandidate     `json:"providerCandidates,omitempty"`
}

type GalSwarmForecastAdapterOptions struct {
	Now                          func() string                   `json:"-"`
	ScaleUpPressureThreshold     *float64                        `json:"-"`
	HoldUtilizationThreshold     *float64                        `json:"-"`
	DrainUtilizationThreshold    *float64                        `json:"-"`
	ShutdownUtilizationThreshold *float64                        `json:"-"`
	CapacityMinutesPerWorker     *int                            `json:"-"`
	LogicalWorkersPerComputeUnit *int                            `json:"-"`
	ActiveWorkers                int                             `json:"activeWorkers"`
	BusyWorkers                  *int                            `json:"busyWorkers,omitempty"`
	AvgQueueWaitSeconds          float64                         `json:"avgQueueWaitSeconds"`
	P95QueueWaitSeconds          float64                         `json:"p95QueueWaitSeconds"`
	PriorityClass                *GalSwarmPriorityClass           `json:"priorityClass,omitempty"`
	ProviderCandidates           []GalSwarmProviderCandidate     `json:"-"`
}

// ProviderAsStrings returns providers as string slice.
func (p *GalSwarmPlan) ProviderAsStrings() []string {
	s := make([]string, len(p.Providers))
	for i, v := range p.Providers {
		s[i] = string(v)
	}
	return s
}

// ---------------------------------------------------------------------------
// Utility functions ported from TypeScript
// ---------------------------------------------------------------------------

// Now returns an ISO-8601 timestamp string (UTC).
func GalSwarmNow() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// ClampRatio clamps a value between 0 and 1.
func ClampRatio(value float64) float64 {
	if !isFinite(value) {
		return 0
	}
	if value < 0 {
		return 0
	}
	if value > 1 {
		return 1
	}
	return value
}

// ClampInteger clamps value to [min, max] and rounds up.
func ClampInteger(value float64, min, max int) int {
	v := int(ceil(value))
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// Round rounds a float64 to the given decimal precision.
func Round(value float64, precision int) float64 {
	factor := pow10(precision)
	return float64(int64(value*factor+0.5)) / factor
}

// UniqueStrings deduplicates and trims a string slice.
func UniqueStrings(values []string) []string {
	seen := make(map[string]bool)
	result := make([]string, 0, len(values))
	for _, raw := range values {
		v := trimSpace(raw)
		if v == "" || seen[v] {
			continue
		}
		seen[v] = true
		result = append(result, v)
	}
	return result
}

// UniqueCapabilities deduplicates a fleet capability slice.
func UniqueCapabilities(caps []GalSwarmFleetCapability) []GalSwarmFleetCapability {
	seen := make(map[GalSwarmFleetCapability]bool)
	result := make([]GalSwarmFleetCapability, 0, len(caps))
	for _, c := range caps {
		if seen[c] {
			continue
		}
		seen[c] = true
		result = append(result, c)
	}
	return result
}

// RiskRank returns the ordinal of a risk level in the ordered list.
func RiskRank(level GalSwarmRiskLevel) int {
	for i, l := range GalSwarmAllRiskLevels {
		if l == level {
			return i
		}
	}
	return 0
}

// HighestRiskLevel returns the highest (most severe) risk level in the slice.
func HighestRiskLevel(levels []GalSwarmRiskLevel) GalSwarmRiskLevel {
	highest := GalSwarmRiskLevelLow
	for _, l := range levels {
		if RiskRank(l) > RiskRank(highest) {
			highest = l
		}
	}
	return highest
}

// HasGalSwarmRiskLevel checks if a value is a valid risk level.
func IsGalSwarmRiskLevel(v string) bool {
	for _, l := range GalSwarmAllRiskLevels {
		if string(l) == v {
			return true
		}
	}
	return false
}

func containsString(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

func isFinite(f float64) bool { return !isNaN(f) && f != infPos && f != infNeg }

func isNaN(f float64) bool { return f != f }

var infPos = math.Inf(1)
var infNeg = math.Inf(-1)

func ceil(f float64) float64 {
	if f == float64(int(f)) {
		return f
	}
	return float64(int(f) + 1)
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\n' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\n' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}

func pow10(n int) float64 {
	p := 1.0
	for i := 0; i < n; i++ {
		p *= 10
	}
	return p
}
