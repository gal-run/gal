// Package planning ports application/planning.ts and application/topology.ts
// (including topology-aliases.ts) from @gal/swarm.
package planning

import (
	"fmt"
	"math"
	"sort"
	"strings"

	"github.com/gal-run/gal/services/swarm-svc/internal/domain"
)

// ---------------------------------------------------------------------------
// Topology alias helpers (ported from topology-aliases.ts)
// ---------------------------------------------------------------------------

// topologyModeKey returns a normalized lookup key (lowercase, no non-alphanumeric).
func topologyModeKey(mode string) string {
	var b strings.Builder
	m := strings.ToLower(strings.TrimSpace(mode))
	for _, ch := range m {
		if (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') {
			b.WriteRune(ch)
		}
	}
	return b.String()
}

// GalSwarmTopologyModeMappings is the full topology alias table.
var GalSwarmTopologyModeMappings = []domain.GalSwarmTopologyModeMapping{
	{PublicMode: "SequentialWorkflow", CanonicalMode: "sequential", Family: "workflow", Reason: "Public sequential workflow maps to the GAL sequential primitive."},
	{PublicMode: "ConcurrentWorkflow", CanonicalMode: "concurrent", Family: "workflow", Reason: "Public concurrent workflow maps to independent GAL lanes."},
	{PublicMode: "GraphWorkflow", CanonicalMode: "graph", Family: "workflow", Reason: "Public graph workflow maps to GAL dependency-aware task graphs."},
	{PublicMode: "HierarchicalSwarm", CanonicalMode: "hierarchical", Family: "organization", Reason: "Public hierarchical swarm maps to GAL director-led lanes."},
	{PublicMode: "HiearchicalSwarm", CanonicalMode: "hierarchical", Family: "organization", Reason: "Preserves the public router spelling variant as a hierarchical alias."},
	{PublicMode: "MixtureOfAgents", CanonicalMode: "mixture", Family: "collaboration", Reason: "Public mixture of agents maps to GAL proposal-and-synthesis topology."},
	{PublicMode: "MoA", CanonicalMode: "mixture", Family: "collaboration", Reason: "MoA shorthand maps to GAL proposal-and-synthesis topology."},
	{PublicMode: "SelfMoASeq", CanonicalMode: "mixture", Family: "collaboration", Reason: "Sequential self-mixture maps to GAL mixture synthesis without importing Python runtime phases."},
	{PublicMode: "GroupChat", CanonicalMode: "group_chat", Family: "collaboration", Reason: "Public group chat maps to bounded GAL deliberation."},
	{PublicMode: "InteractiveGroupChat", CanonicalMode: "group_chat", Family: "collaboration", Reason: "Interactive group chat uses the same bounded GAL deliberation primitive."},
	{PublicMode: "ForestSwarm", CanonicalMode: "forest", Family: "organization", Reason: "Public forest swarm maps to GAL specialist teams under one evidence ledger."},
	{PublicMode: "Tree", CanonicalMode: "forest", Family: "organization", Reason: "Tree taxonomy maps to GAL forest planning under one evidence ledger."},
	{PublicMode: "TreeAgent", CanonicalMode: "forest", Family: "organization", Reason: "Tree-agent taxonomy maps to GAL forest planning under one evidence ledger."},
	{PublicMode: "HeavySwarm", CanonicalMode: "heavy", Family: "specialized", Reason: "Public heavy swarm maps to GAL high-risk redundant review and proof."},
	{PublicMode: "AdvisorSwarm", CanonicalMode: "heavy", Family: "specialized", Reason: "Advisor swarm maps to GAL heavy topology with redundant expert review and proof."},
	{PublicMode: "PlannerGeneratorEvaluator", CanonicalMode: "heavy", Family: "specialized", Reason: "Planner-generator-evaluator maps to GAL heavy topology with explicit planning, generation, review, and proof lanes."},
	{PublicMode: "PeerReviewProcess", CanonicalMode: "heavy", Family: "decision", Reason: "Peer review process maps to GAL heavy topology with independent review and verifier evidence."},
	{PublicMode: "TrialSimulation", CanonicalMode: "heavy", Family: "specialized", Reason: "Trial simulation maps to GAL heavy topology for adversarial review and proof."},
	{PublicMode: "SwarmRouter", CanonicalMode: "router", Family: "routing", Reason: "Public swarm router maps to explicit GAL router mode."},
	{PublicMode: "MultiAgentRouter", CanonicalMode: "router", Family: "routing", Reason: "Public multi-agent routing maps to explicit GAL router mode."},
	{PublicMode: "AgentRouter", CanonicalMode: "router", Family: "routing", Reason: "Public agent router maps to explicit GAL router mode."},
	{PublicMode: "ModelRouter", CanonicalMode: "router", Family: "routing", Reason: "Public model router maps to explicit GAL router mode; GAL keeps model routing native."},
	{PublicMode: "SkillOrchestra", CanonicalMode: "router", Family: "routing", Reason: "Skill orchestra maps to GAL router mode for native capability selection without importing an orchestration runtime."},
	{PublicMode: "AgentRearrange", CanonicalMode: "graph", Family: "organization", Reason: "Agent rearrangement maps to a deterministic GAL graph ordering."},
	{PublicMode: "SwarmRearrange", CanonicalMode: "graph", Family: "organization", Reason: "Swarm rearrangement maps to a deterministic GAL graph ordering."},
	{PublicMode: "AutoSwarmBuilder", CanonicalMode: "auto", Family: "specialized", Reason: "Public auto builder maps to GAL auto routing instead of importing a builder runtime."},
	{PublicMode: "PlannerWorkerSwarm", CanonicalMode: "hierarchical", Family: "organization", Reason: "Planner-worker-judge maps to GAL director, worker, review, and verifier lanes."},
	{PublicMode: "HybridHierarchicalClusterSwarm", CanonicalMode: "hierarchical", Family: "organization", Reason: "Hybrid hierarchical-cluster swarms map to GAL hierarchy with bounded parallel worker lanes."},
	{PublicMode: "HierarchicalStructuredCommunicationFramework", CanonicalMode: "hierarchical", Family: "organization", Reason: "Hierarchical structured communication maps to GAL hierarchy with director-led lanes and bounded handoffs."},
	{PublicMode: "HHCS", CanonicalMode: "hierarchical", Family: "organization", Reason: "HHCS shorthand maps to GAL hierarchy with bounded parallel worker lanes."},
	{PublicMode: "MajorityVoting", CanonicalMode: "mixture", Family: "decision", Reason: "Majority voting maps to GAL mixture synthesis across independent outputs."},
	{PublicMode: "CouncilAsAJudge", CanonicalMode: "heavy", Family: "decision", Reason: "Council judging maps to GAL heavy topology with independent review and proof."},
	{PublicMode: "CouncilOfJudges", CanonicalMode: "heavy", Family: "decision", Reason: "Council of judges maps to GAL heavy topology with independent review and proof."},
	{PublicMode: "LLMCouncil", CanonicalMode: "mixture", Family: "decision", Reason: "LLM council maps to GAL mixture review with synthesis."},
	{PublicMode: "DebateWithJudge", CanonicalMode: "group_chat", Family: "decision", Reason: "Debate with judge maps to bounded GAL deliberation with a judging lane."},
	{PublicMode: "OneOnOneDebate", CanonicalMode: "group_chat", Family: "collaboration", Reason: "One-on-one debate maps to bounded GAL deliberation."},
	{PublicMode: "ExpertPanelDiscussion", CanonicalMode: "group_chat", Family: "collaboration", Reason: "Expert panel discussion maps to bounded GAL deliberation."},
	{PublicMode: "RoundTableDiscussion", CanonicalMode: "group_chat", Family: "collaboration", Reason: "Round-table discussion maps to bounded GAL deliberation."},
	{PublicMode: "InterviewSeries", CanonicalMode: "sequential", Family: "workflow", Reason: "Interview series maps to GAL sequential lanes."},
	{PublicMode: "MediationSession", CanonicalMode: "group_chat", Family: "collaboration", Reason: "Mediation session maps to bounded GAL deliberation."},
	{PublicMode: "BrainstormingSession", CanonicalMode: "group_chat", Family: "collaboration", Reason: "Brainstorming session maps to bounded GAL deliberation."},
	{PublicMode: "CouncilMeeting", CanonicalMode: "group_chat", Family: "collaboration", Reason: "Council meeting maps to bounded GAL deliberation."},
	{PublicMode: "MentorshipSession", CanonicalMode: "group_chat", Family: "collaboration", Reason: "Mentorship session maps to bounded GAL deliberation."},
	{PublicMode: "NegotiationSession", CanonicalMode: "group_chat", Family: "collaboration", Reason: "Negotiation session maps to bounded GAL deliberation."},
	{PublicMode: "RoundRobin", CanonicalMode: "concurrent", Family: "routing", Reason: "Round-robin distribution maps to GAL concurrent lane assignment."},
	{PublicMode: "RoundRobinSwarm", CanonicalMode: "concurrent", Family: "routing", Reason: "Round-robin distribution maps to GAL concurrent lane assignment."},
	{PublicMode: "BatchedGridWorkflow", CanonicalMode: "mixture", Family: "workflow", Reason: "Batched grid comparison maps to GAL mixture synthesis across a task-agent matrix."},
	{PublicMode: "SpreadSheetSwarm", CanonicalMode: "concurrent", Family: "workflow", Reason: "Spreadsheet-style row or cell processing maps to GAL concurrent lanes."},
	{PublicMode: "SpreadsheetSwarm", CanonicalMode: "concurrent", Family: "workflow", Reason: "Spreadsheet-style row or cell processing maps to GAL concurrent lanes."},
	{PublicMode: "SocialAlgorithms", CanonicalMode: "group_chat", Family: "collaboration", Reason: "Custom social algorithms map to bounded GAL deliberation unless a future GAL primitive is added."},
	{PublicMode: "Broadcast", CanonicalMode: "group_chat", Family: "collaboration", Reason: "Broadcast social topology maps to bounded GAL deliberation."},
	{PublicMode: "CircularSwarm", CanonicalMode: "graph", Family: "organization", Reason: "Circular social topology maps to an explicit GAL graph."},
	{PublicMode: "MeshSwarm", CanonicalMode: "graph", Family: "organization", Reason: "Mesh social topology maps to an explicit GAL graph."},
	{PublicMode: "OneToOne", CanonicalMode: "graph", Family: "organization", Reason: "One-to-one social topology maps to an explicit GAL graph edge."},
	{PublicMode: "PyramidSwarm", CanonicalMode: "hierarchical", Family: "organization", Reason: "Pyramid social topology maps to GAL hierarchy."},
	{PublicMode: "StarSwarm", CanonicalMode: "graph", Family: "organization", Reason: "Star social topology maps to an explicit GAL graph with a hub lane."},
	{PublicMode: "broadcast", CanonicalMode: "group_chat", Family: "collaboration", Reason: "Broadcast social topology maps to bounded GAL deliberation."},
	{PublicMode: "circular_swarm", CanonicalMode: "graph", Family: "organization", Reason: "Circular social topology maps to an explicit GAL graph."},
	{PublicMode: "grid_swarm", CanonicalMode: "graph", Family: "organization", Reason: "Grid social topology maps to an explicit GAL graph."},
	{PublicMode: "mesh_swarm", CanonicalMode: "graph", Family: "organization", Reason: "Mesh social topology maps to an explicit GAL graph."},
	{PublicMode: "one_to_one", CanonicalMode: "graph", Family: "organization", Reason: "One-to-one social topology maps to an explicit GAL graph edge."},
	{PublicMode: "pyramid_swarm", CanonicalMode: "hierarchical", Family: "organization", Reason: "Pyramid social topology maps to GAL hierarchy."},
	{PublicMode: "star_swarm", CanonicalMode: "graph", Family: "organization", Reason: "Star social topology maps to an explicit GAL graph with a hub lane."},
	{PublicMode: "AdvancedResearch", CanonicalMode: "heavy", Family: "specialized", Reason: "Advanced research maps to GAL heavy topology for stronger review and evidence."},
	{PublicMode: "MALT", CanonicalMode: "heavy", Family: "specialized", Reason: "Multi-agent learning and training maps to GAL heavy topology until GAL owns a training primitive."},
	{PublicMode: "auto", CanonicalMode: "auto", Family: "routing", Reason: "Public auto mode maps to GAL auto routing."},
}

// ListGalSwarmTopologyAliases returns all topology aliases (canonical + public).
func ListGalSwarmTopologyAliases() []domain.GalSwarmTopologyAlias {
	var aliases []domain.GalSwarmTopologyAlias
	for _, mode := range domain.GalSwarmAllOrchestrationModes {
		aliases = append(aliases, domain.GalSwarmTopologyAlias{
			Alias:         string(mode),
			CanonicalMode: string(mode),
			Family:        "canonical",
			Source:        "gal",
		})
	}
	aliases = append(aliases, domain.GalSwarmTopologyAlias{
		Alias: "auto", CanonicalMode: "auto", Family: "canonical", Source: "gal",
	})

	seen := make(map[string]bool)
	for _, a := range aliases {
		seen[a.Alias] = true
	}
	for _, m := range GalSwarmTopologyModeMappings {
		if seen[m.PublicMode] {
			continue
		}
		aliases = append(aliases, domain.GalSwarmTopologyAlias{
			Alias: m.PublicMode, CanonicalMode: m.CanonicalMode,
			Family: m.Family, Source: "public",
		})
		seen[m.PublicMode] = true
	}
	return aliases
}

// FormatGalSwarmTopologyAliasHelp returns a formatted string of all aliases.
func FormatGalSwarmTopologyAliasHelp(prefix string) string {
	var b strings.Builder
	for _, a := range ListGalSwarmTopologyAliases() {
		b.WriteString(prefix)
		b.WriteString(a.Alias)
		b.WriteString(" -> ")
		b.WriteString(a.CanonicalMode)
		b.WriteString("\n")
	}
	return strings.TrimRight(b.String(), "\n")
}

// NormalizeGalSwarmTopologyMode resolves any mode input to a normalized mode.
func NormalizeGalSwarmTopologyMode(inputMode string) (domain.GalSwarmNormalizedTopologyMode, error) {
	trimmed := strings.TrimSpace(inputMode)
	key := topologyModeKey(trimmed)

	// Build canonical lookup map
	canonicalByKey := make(map[string]string)
	for _, mode := range domain.GalSwarmAllOrchestrationModes {
		canonicalByKey[topologyModeKey(string(mode))] = string(mode)
	}
	canonicalByKey[topologyModeKey("auto")] = "auto"

	if canon, ok := canonicalByKey[key]; ok {
		reason := fmt.Sprintf("Canonical GAL topology mode requested: %s.", canon)
		if canon == "auto" {
			reason = "GAL auto mode uses router heuristics to select a concrete topology."
		}
		return domain.GalSwarmNormalizedTopologyMode{
			InputMode:     trimmed,
			PublicMode:    canon,
			CanonicalMode: canon,
			Reason:        reason,
		}, nil
	}

	// Build public mapping
	publicByKey := make(map[string]domain.GalSwarmTopologyModeMapping)
	for _, m := range GalSwarmTopologyModeMappings {
		publicByKey[topologyModeKey(m.PublicMode)] = m
	}

	if mapping, ok := publicByKey[key]; ok {
		return domain.GalSwarmNormalizedTopologyMode{
			InputMode:     trimmed,
			PublicMode:    mapping.PublicMode,
			CanonicalMode: mapping.CanonicalMode,
			Reason:        mapping.Reason,
		}, nil
	}

	return domain.GalSwarmNormalizedTopologyMode{}, fmt.Errorf("invalid topology mode: %s", inputMode)
}

// ---------------------------------------------------------------------------
// Topology routing (ported from application/topology.ts)
// ---------------------------------------------------------------------------

// RouteGalSwarmTopology selects the optimal orchestration mode for a request.
func RouteGalSwarmTopology(req domain.GalSwarmTopologyRequest) (domain.GalSwarmTopologyRouteDecision, error) {
	if err := validateTopologyRequest(req); err != nil {
		return domain.GalSwarmTopologyRouteDecision{}, err
	}

	var desiredMode *domain.GalSwarmNormalizedTopologyMode
	if req.DesiredMode != nil && *req.DesiredMode != "" {
		m, err := NormalizeGalSwarmTopologyMode(*req.DesiredMode)
		if err != nil {
			return domain.GalSwarmTopologyRouteDecision{}, err
		}
		desiredMode = &m
	}

	if desiredMode != nil && desiredMode.CanonicalMode != "auto" {
		reason := fmt.Sprintf("Explicit topology mode requested: %s.", desiredMode.CanonicalMode)
		if desiredMode.InputMode != desiredMode.CanonicalMode {
			reason = fmt.Sprintf("Public topology mode %s maps to GAL %s. %s", desiredMode.InputMode, desiredMode.CanonicalMode, desiredMode.Reason)
		}
		return domain.GalSwarmTopologyRouteDecision{
			Mode:   domain.GalSwarmOrchestrationMode(desiredMode.CanonicalMode),
			Reason: reason,
		}, nil
	}

	orderedTasks := OrderGalSwarmTopologyTasks(req.Tasks)
	taskCount := len(orderedTasks)
	hasDependencies := false
	for _, t := range orderedTasks {
		if len(t.DependsOn) > 0 {
			hasDependencies = true
			break
		}
	}
	governance := normalizeGovernance(req.Governance)
	repositoryCount := len(domain.UniqueStrings(appendRepos(req.Repositories, orderedTasks)))

	evidenceWeight := len(req.EvidenceRequirements)
	for _, t := range orderedTasks {
		evidenceWeight += len(t.EvidenceRequirements)
	}

	riskLevel := domain.HighestRiskLevel(collectRiskLevels(req.RiskLevel, orderedTasks))
	hasReviewNeed := governance.RequireIndependentReview || hasKind(orderedTasks, "review") || evidenceWeight > 0

	if domain.RiskRank(riskLevel) >= domain.RiskRank(domain.GalSwarmRiskLevelHigh) && (hasReviewNeed || taskCount >= 4) {
		return modeResult(domain.GalSwarmOrchestrationModeHeavy, "High-risk or critical work with review/evidence needs requires heavy topology."), nil
	}
	if hasDependencies {
		return modeResult(domain.GalSwarmOrchestrationModeGraph, "Task dependencies require graph topology."), nil
	}
	if allScopeReviewDocs(orderedTasks) && hasReviewNeed {
		return modeResult(domain.GalSwarmOrchestrationModeGroupChat, "Bounded deliberation work can use group_chat topology before execution."), nil
	}
	if domain.RiskRank(riskLevel) == domain.RiskRank(domain.GalSwarmRiskLevelMedium) && hasReviewNeed && taskCount > 1 {
		return modeResult(domain.GalSwarmOrchestrationModeMixture, "Medium-risk work with review or evidence needs benefits from mixture review."), nil
	}
	if repositoryCount >= 3 && taskCount >= 6 {
		return modeResult(domain.GalSwarmOrchestrationModeForest, "Broad independent multi-repository work benefits from forest topology."), nil
	}
	if taskCount >= 5 || repositoryCount > 1 {
		return modeResult(domain.GalSwarmOrchestrationModeHierarchical, "Multi-task or multi-repository work needs director-led hierarchical topology."), nil
	}
	if taskCount > 1 {
		allParallel := true
		for _, t := range orderedTasks {
			if t.CanRunInParallel != nil && !*t.CanRunInParallel {
				allParallel = false
				break
			}
		}
		if allParallel {
			return modeResult(domain.GalSwarmOrchestrationModeConcurrent, "Independent tasks can run concurrently."), nil
		}
	}

	return modeResult(domain.GalSwarmOrchestrationModeSequential, "Small bounded work can run sequentially."), nil
}

// CreateGalSwarmTopologyPlan builds a full topology plan from a request.
func CreateGalSwarmTopologyPlan(req domain.GalSwarmTopologyRequest) (domain.GalSwarmTopologyPlan, error) {
	if err := validateTopologyRequest(req); err != nil {
		return domain.GalSwarmTopologyPlan{}, err
	}

	route, err := RouteGalSwarmTopology(req)
	if err != nil {
		return domain.GalSwarmTopologyPlan{}, err
	}

	tasks := OrderGalSwarmTopologyTasks(req.Tasks)
	repositories := domain.UniqueStrings(appendRepos(req.Repositories, tasks))
	issues := domain.UniqueStrings(appendIssues(req.Issues, tasks))
	governance := normalizeGovernance(req.Governance)

	if err := assertRepositoriesAllowed(repositories, governance); err != nil {
		return domain.GalSwarmTopologyPlan{}, err
	}

	riskLevel := domain.HighestRiskLevel(collectRiskLevels(req.RiskLevel, tasks))
	evidenceRequirements := normalizeEvidenceRequirements(req, tasks, riskLevel, governance)

	laneDrafts := createLaneDrafts(createLaneDraftInput{
		objective:            strings.TrimSpace(req.Objective),
		mode:                 route.Mode,
		tasks:                tasks,
		repositories:         repositories,
		issues:               issues,
		governance:           governance,
		evidenceRequirements: evidenceRequirements,
		riskLevel:            riskLevel,
	})

	lanes := make([]domain.GalSwarmExecutionLane, len(laneDrafts))
	for i, draft := range laneDrafts {
		placement := SelectGalSwarmLanePlacement(draft, req.Fleet)
		lanes[i] = domain.GalSwarmExecutionLane{
			ID:                   draft.ID,
			Role:                 draft.Role,
			Title:                draft.Title,
			TaskIDs:              draft.TaskIDs,
			DependsOnLaneIDs:     draft.DependsOnLaneIDs,
			RequiredCapabilities: draft.RequiredCapabilities,
			Ownership:            draft.Ownership,
			EvidenceExpectations: draft.EvidenceExpectations,
			Placement:            placement,
		}
	}

	return domain.GalSwarmTopologyPlan{
		SchemaVersion:        domain.GalSwarmTopologySchemaVersion,
		Objective:            strings.TrimSpace(req.Objective),
		Mode:                 route.Mode,
		RouteReason:          route.Reason,
		RiskLevel:            riskLevel,
		Repositories:         repositories,
		Issues:               issues,
		Tasks:                tasks,
		Lanes:                lanes,
		EvidenceRequirements: evidenceRequirements,
		Governance:           governance,
	}, nil
}

// OrderGalSwarmTopologyTasks performs a topological sort on tasks.
func OrderGalSwarmTopologyTasks(tasks []domain.GalSwarmTopologyTask) []domain.GalSwarmTopologyTask {
	normalized := normalizeTasks(tasks)
	indexByID := make(map[string]int)
	for i, t := range normalized {
		if _, ok := indexByID[t.ID]; ok {
			panic(fmt.Sprintf("Duplicate topology task id: %s", t.ID))
		}
		indexByID[t.ID] = i
	}

	adj := make(map[string][]string)
	indeg := make(map[string]int)
	for _, t := range normalized {
		adj[t.ID] = []string{}
		indeg[t.ID] = 0
	}

	for _, t := range normalized {
		for _, depID := range t.DependsOn {
			if _, ok := indexByID[depID]; !ok {
				panic(fmt.Sprintf("Topology task %s depends on unknown task %s", t.ID, depID))
			}
			if depID == t.ID {
				panic(fmt.Sprintf("Topology task %s cannot depend on itself", t.ID))
			}
			adj[depID] = append(adj[depID], t.ID)
			indeg[t.ID]++
		}
	}

	var ready []domain.GalSwarmTopologyTask
	for _, t := range normalized {
		if indeg[t.ID] == 0 {
			ready = append(ready, t)
		}
	}
	sort.Slice(ready, func(i, j int) bool {
		return indexByID[ready[i].ID] < indexByID[ready[j].ID]
	})

	var ordered []domain.GalSwarmTopologyTask
	for len(ready) > 0 {
		task := ready[0]
		ready = ready[1:]
		ordered = append(ordered, task)

		for _, depID := range adj[task.ID] {
			indeg[depID]--
			if indeg[depID] == 0 {
				ready = append(ready, normalized[indexByID[depID]])
				sort.Slice(ready, func(i, j int) bool {
					return indexByID[ready[i].ID] < indexByID[ready[j].ID]
				})
			}
		}
	}

	if len(ordered) != len(normalized) {
		panic("Topology task graph contains a dependency cycle")
	}
	return ordered
}

// ScoreGalSwarmFleetPlacement scores a lane placement on a fleet node.
func ScoreGalSwarmFleetPlacement(lane executionLaneDraft, node domain.GalSwarmFleetNode) domain.GalSwarmLanePlacement {
	nodeCaps := inferFleetNodeCapabilities(node)
	required := domain.UniqueCapabilities(lane.RequiredCapabilities)
	var matched, missing []domain.GalSwarmFleetCapability
	for _, cap := range required {
		if nodeCaps[string(cap)] {
			matched = append(matched, cap)
		} else {
			missing = append(missing, cap)
		}
	}

	cpuScore := math.Min(float64(derefInt(node.CPUCores)), 32) / 8.0
	memScore := math.Min(float64(derefInt(node.MemoryGb)), 128) / 32.0
	resourceScore := cpuScore + memScore

	score := 0.0
	if node.Available != nil && !*node.Available {
		score = 0
	} else {
		matchSum := 0.0
		for _, c := range matched {
			matchSum += fleetCapWeight(c)
		}
		missSum := 0.0
		for _, c := range missing {
			missSum += fleetCapWeight(c)
		}
		score = domain.Round(10+matchSum-missSum+resourceScore, 3)
	}

	reason := fmt.Sprintf("Selected %s with all required capabilities.", node.Label)
	if len(missing) > 0 {
		missStrs := make([]string, len(missing))
		for i, c := range missing {
			missStrs[i] = string(c)
		}
		reason = fmt.Sprintf("Selected %s; missing %s.", node.Label, strings.Join(missStrs, ", "))
	}

	runnerLabel := node.RunnerLabels[0]
	if runnerLabel == "" {
		runnerLabel = fallbackRunnerLabel(lane)
	}

	return domain.GalSwarmLanePlacement{
		LaneID:              lane.ID,
		NodeID:              &node.ID,
		RunnerLabel:         runnerLabel,
		Score:               score,
		MatchedCapabilities: matched,
		MissingCapabilities: missing,
		Reason:              reason,
	}
}

// SelectGalSwarmLanePlacement picks the best fleet node for a lane.
func SelectGalSwarmLanePlacement(lane executionLaneDraft, fleet []domain.GalSwarmFleetNode) domain.GalSwarmLanePlacement {
	var available []domain.GalSwarmFleetNode
	for _, n := range fleet {
		if n.Available == nil || *n.Available {
			available = append(available, n)
		}
	}

	var ranked []domain.GalSwarmLanePlacement
	for _, n := range available {
		ranked = append(ranked, ScoreGalSwarmFleetPlacement(lane, n))
	}
	sort.Slice(ranked, func(i, j int) bool {
		if ranked[i].Score != ranked[j].Score {
			return ranked[i].Score > ranked[j].Score
		}
		ni := derefStr(ranked[i].NodeID)
		nj := derefStr(ranked[j].NodeID)
		return ni < nj
	})

	if len(ranked) > 0 {
		return ranked[0]
	}

	return domain.GalSwarmLanePlacement{
		LaneID:              lane.ID,
		RunnerLabel:         fallbackRunnerLabel(lane),
		Score:               0,
		MatchedCapabilities: []domain.GalSwarmFleetCapability{},
		MissingCapabilities: domain.UniqueCapabilities(lane.RequiredCapabilities),
		Reason:              "No available fleet inventory was supplied; using default x64 runner fallback.",
	}
}

// ---------------------------------------------------------------------------
// Lane draft (internal, ports the GalSwarmExecutionLaneDraft omit type)
// ---------------------------------------------------------------------------

type executionLaneDraft struct {
	ID                   string
	Role                 domain.GalSwarmLaneRole
	Title                string
	TaskIDs              []string
	DependsOnLaneIDs     []string
	RequiredCapabilities []domain.GalSwarmFleetCapability
	Ownership            domain.GalSwarmLaneOwnership
	EvidenceExpectations []string
}

// ---------------------------------------------------------------------------
// Planning (ported from application/planning.ts)
// ---------------------------------------------------------------------------

// ValidateGalSwarmPlan validates a swarm plan.
func ValidateGalSwarmPlan(plan *domain.GalSwarmPlan) error {
	if plan.SchemaVersion != domain.GalSwarmPlanSchemaVersion {
		return fmt.Errorf("Swarm plan schemaVersion must be %s", domain.GalSwarmPlanSchemaVersion)
	}
	if strings.TrimSpace(plan.SwarmID) == "" {
		return fmt.Errorf("Swarm plan swarmId is required")
	}
	if plan.MaxWorkers < plan.MinWorkers {
		return fmt.Errorf("Swarm plan maxWorkers must be >= minWorkers")
	}
	if plan.MaxSpendUsd < 0 {
		return fmt.Errorf("Swarm plan maxSpendUsd must be non-negative")
	}
	if len(plan.ComputeProfiles) == 0 {
		return fmt.Errorf("Swarm plan must declare at least one compute profile")
	}
	if plan.ServerlessFallback != nil && plan.ServerlessFallback.Enabled {
		if plan.ServerlessFallback.SwitchBelowUtilization <= 0 || plan.ServerlessFallback.SwitchBelowUtilization >= 1 {
			return fmt.Errorf("Serverless fallback switchBelowUtilization must be >0 and <1")
		}
		if plan.ServerlessFallback.MinSustainSeconds < 0 {
			return fmt.Errorf("Serverless fallback minSustainSeconds must be >=0")
		}
		found := false
		for _, ep := range plan.ServerlessEndpoints {
			if ep.ID == plan.ServerlessFallback.EndpointID {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("Serverless fallback endpointId must reference a declared serverless endpoint")
		}
	}
	return nil
}

// CalculateGalSwarmEffectiveUtilization returns busy/active ratio.
func CalculateGalSwarmEffectiveUtilization(load domain.GalSwarmLoadSnapshot) float64 {
	if load.ActiveWorkers <= 0 {
		return 0
	}
	return domain.ClampRatio(float64(load.BusyWorkers) / float64(load.ActiveWorkers))
}

// CalculateGalSwarmPressure returns expected / target runtime ratio.
func CalculateGalSwarmPressure(load domain.GalSwarmLoadSnapshot) float64 {
	if load.TargetCompletionWindowMinutes <= 0 {
		return math.Inf(1)
	}
	return load.ExpectedRuntimeMinutes / load.TargetCompletionWindowMinutes
}

// HighestRunnablePriority returns the highest priority class with runnable work.
func HighestRunnablePriority(plan *domain.GalSwarmPlan, load domain.GalSwarmLoadSnapshot) *domain.GalSwarmPriorityClass {
	for _, pc := range plan.PriorityOrder {
		for _, mix := range load.PriorityMix {
			if mix.PriorityClass == pc && mix.RunnableWorkUnits > 0 {
				return &pc
			}
		}
	}
	return nil
}

// EstimateGalSwarmProviderCost estimates cost for a provider candidate.
func EstimateGalSwarmProviderCost(candidate domain.GalSwarmProviderCandidate, expectedRuntimeMinutes float64, desiredWorkers int) (estimatedCostUsd float64, billableSeconds int) {
	if candidate.HourlyCostUsd < 0 {
		panic("Provider candidate hourlyCostUsd must be non-negative.")
	}
	if expectedRuntimeMinutes < 0 {
		panic("expectedRuntimeMinutes must be non-negative.")
	}
	if desiredWorkers < 0 {
		panic("desiredWorkers must be non-negative.")
	}

	lifecycleSecs := float64(derefInt(candidate.EstimatedStartupSeconds)) + expectedRuntimeMinutes*60 + float64(derefInt(candidate.EstimatedShutdownSeconds))
	billable := int(math.Max(lifecycleSecs, float64(derefInt(candidate.MinBillableSeconds))))
	cost := domain.Round(candidate.HourlyCostUsd*float64(desiredWorkers)*float64(billable)/3600, 4)
	return cost, billable
}

// RankGalSwarmProviders ranks provider candidates by score.
func RankGalSwarmProviders(input domain.GalSwarmProviderSelectionInput) []domain.GalSwarmRankedProviderCandidate {
	allowedProvs := makeSet(input.Plan.ProviderAsStrings())
	profIDs := makeSet(profileIDs(input.Plan.ComputeProfiles))
	desiredCU := input.DesiredComputeUnits
	if desiredCU == nil {
		d := input.DesiredWorkers
		desiredCU = &d
	}

	var results []domain.GalSwarmRankedProviderCandidate
	for _, c := range input.Candidates {
		if !allowedProvs[string(c.Provider)] {
			continue
		}
		if !profIDs[c.ComputeProfileID] {
			continue
		}

		cost, billSec := EstimateGalSwarmProviderCost(c, input.ExpectedRuntimeMinutes, *desiredCU)
		spendPressure := 1.0
		if input.Plan.MaxSpendUsd > 0 {
			spendPressure = domain.ClampRatio(cost / input.Plan.MaxSpendUsd)
		}
		reliability := domain.ClampRatio(c.ReliabilityScore)
		locality := domain.ClampRatio(derefF64(c.LocalityScore, 0.5))
		availPenalty := 0.0
		if !c.Available {
			availPenalty = 2
		}
		reservationPenalty := 0.0
		if c.RequiresReservation != nil && *c.RequiresReservation {
			reservationPenalty = 0.35
		}
		score := domain.Round(cost*(1+spendPressure)+(1-reliability)*10+(1-locality)*2+availPenalty*100+reservationPenalty*10, 4)

		reason := fmt.Sprintf("Provider candidate is currently unavailable.")
		if c.Available {
			reason = fmt.Sprintf("Estimated burst cost is $%.4f with reliability score %.4f.", cost, reliability)
		}

		results = append(results, domain.GalSwarmRankedProviderCandidate{
			Provider:              c.Provider,
			ComputeProfileID:      c.ComputeProfileID,
			HourlyCostUsd:         c.HourlyCostUsd,
			EstimatedStartupSeconds: c.EstimatedStartupSeconds,
			EstimatedShutdownSeconds: c.EstimatedShutdownSeconds,
			MinBillableSeconds:    c.MinBillableSeconds,
			Available:             c.Available,
			ReliabilityScore:      c.ReliabilityScore,
			LocalityScore:         c.LocalityScore,
			RequiresReservation:   c.RequiresReservation,
			Notes:                 c.Notes,
			EstimatedCostUsd:      cost,
			BillableSeconds:       billSec,
			Score:                 score,
			Reason:                reason,
		})
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].Score < results[j].Score
	})
	return results
}

// SelectGalSwarmProvider selects the best provider from candidates.
func SelectGalSwarmProvider(input domain.GalSwarmProviderSelectionInput) domain.GalSwarmProviderSelection {
	ranked := RankGalSwarmProviders(input)
	var selected *domain.GalSwarmRankedProviderCandidate
	for _, c := range ranked {
		if c.Available && c.EstimatedCostUsd <= input.Plan.MaxSpendUsd {
			selected = &c
			break
		}
	}
	return domain.GalSwarmProviderSelection{
		Selected:         selected,
		RankedCandidates: ranked,
	}
}

// BuildGalSwarmLoadFromForecast builds a load snapshot from a forecast.
func BuildGalSwarmLoadFromForecast(plan *domain.GalSwarmPlan, forecast domain.GalSwarmExecutionForecastInput, options *domain.GalSwarmForecastAdapterOptions) domain.GalSwarmLoadSnapshot {
	pc := plan.PriorityOrder[0]
	if options != nil && options.PriorityClass != nil {
		pc = *options.PriorityClass
	}

	activeWorkers := 0
	if options != nil {
		activeWorkers = options.ActiveWorkers
	}

	runnableWU := 0
	for _, t := range forecast.TaskForecasts {
		if t.BlockingProbability < 0.75 {
			runnableWU++
		}
	}

	busyWorkers := 0
	if options != nil && options.BusyWorkers != nil {
		busyWorkers = *options.BusyWorkers
	} else {
		busyWorkers = int(math.Min(float64(activeWorkers), math.Ceil(float64(activeWorkers)*domain.ClampRatio(forecast.Capacity.ExpectedUtilization))))
	}
	idleWorkers := int(math.Max(float64(activeWorkers-busyWorkers), 0))

	avgWait := 0.0
	p95Wait := 0.0
	if options != nil {
		avgWait = options.AvgQueueWaitSeconds
		p95Wait = options.P95QueueWaitSeconds
	}

	expectedRunMin := math.Max(forecast.Capacity.ExpectedUsefulWorkerMinutes, forecast.CriticalPathMinutes)

	priorityMix := []domain.GalSwarmPriorityMix{}
	priorityMix = append(priorityMix, domain.GalSwarmPriorityMix{
		PriorityClass:           pc,
		RunnableWorkUnits:       runnableWU,
		ExpectedRuntimeMinutes: forecast.Capacity.ExpectedUsefulWorkerMinutes,
	})

	return domain.GalSwarmLoadSnapshot{
		QueuedWorkUnits:              len(forecast.TaskForecasts),
		RunnableWorkUnits:            runnableWU,
		ActiveWorkers:                activeWorkers,
		BusyWorkers:                  busyWorkers,
		IdleWorkers:                  idleWorkers,
		AvgQueueWaitSeconds:          avgWait,
		P95QueueWaitSeconds:          p95Wait,
		ExpectedRuntimeMinutes:       expectedRunMin,
		TargetCompletionWindowMinutes: forecast.HorizonMinutes,
		PriorityMix:                  priorityMix,
	}
}

// PlanGalSwarmDecision computes a capacity decision from load/cost.
func PlanGalSwarmDecision(plan *domain.GalSwarmPlan, load domain.GalSwarmLoadSnapshot, cost domain.GalSwarmCostSnapshot, options *domain.GalSwarmPolicyOptions) domain.GalSwarmDecision {
	if err := ValidateGalSwarmPlan(plan); err != nil {
		panic(err.Error())
	}

	now := func() string { return domain.GalSwarmNow() }
	if options != nil && options.Now != nil {
		now = options.Now
	}

	scaleUpThreshold := 1.2
	holdUtilThreshold := plan.MinEffectiveUtilization
	drainUtilThreshold := 0.35
	shutdownUtilThreshold := 0.2
	capMinPerWorker := 60

	if options != nil {
		if options.ScaleUpPressureThreshold != nil {
			scaleUpThreshold = *options.ScaleUpPressureThreshold
		}
		if options.HoldUtilizationThreshold != nil {
			holdUtilThreshold = *options.HoldUtilizationThreshold
		}
		if options.DrainUtilizationThreshold != nil {
			drainUtilThreshold = *options.DrainUtilizationThreshold
		}
		if options.ShutdownUtilizationThreshold != nil {
			shutdownUtilThreshold = *options.ShutdownUtilizationThreshold
		}
		if options.CapacityMinutesPerWorker != nil {
			capMinPerWorker = *options.CapacityMinutesPerWorker
		}
	}

	effUtil := CalculateGalSwarmEffectiveUtilization(load)
	pressure := CalculateGalSwarmPressure(load)
	priorityClass := HighestRunnablePriority(plan, load)
	canSpend := cost.ProjectedSpendUsd <= plan.MaxSpendUsd
	slEndpoint := selectServerlessFallbackEndpoint(plan)

	build := func(action domain.GalSwarmDecisionAction, workers int, routing *domain.GalSwarmRoutingTarget, reason string) domain.GalSwarmDecision {
		d := domain.GalSwarmDecision{
			SchemaVersion:       domain.GalSwarmDecisionSchemaVersion,
			SwarmID:             plan.SwarmID,
			Action:              action,
			DesiredWorkers:      workers,
			Reason:              reason,
			Pressure:            pressure,
			EffectiveUtilization: effUtil,
			ProjectedSpendUsd:   cost.ProjectedSpendUsd,
			PriorityClass:       priorityClass,
			EvaluatedAt:         now(),
		}
		if routing != nil {
			d.RoutingTarget = routing
		}
		return d
	}

	// Shutdown check
	if load.RunnableWorkUnits == 0 && effUtil <= shutdownUtilThreshold {
		d := build(domain.GalSwarmDecisionActionShutdown, 0, ptr(domain.GalSwarmRoutingTargetServerless), "No runnable work and utilization is below shutdown threshold.")
		if slEndpoint != nil {
			d.ServerlessEndpointID = &slEndpoint.ID
		}
		return d
	}

	// Serverless fallback
	if slEndpoint != nil && load.RunnableWorkUnits > 0 && effUtil <= plan.ServerlessFallback.SwitchBelowUtilization && pressure < scaleUpThreshold {
		workers := int(math.Max(float64(plan.MinWorkers), math.Min(float64(load.BusyWorkers), float64(load.ActiveWorkers))))
		if !plan.ServerlessFallback.DrainSelfHosted {
			workers = domain.ClampInteger(float64(load.ActiveWorkers), plan.MinWorkers, plan.MaxWorkers)
		}
		d := build(domain.GalSwarmDecisionActionRouteServerless, workers, ptr(domain.GalSwarmRoutingTargetServerless), "Self-hosted utilization is below the serverless switch threshold; route new work to the serverless endpoint and drain burst capacity.")
		d.ServerlessEndpointID = &slEndpoint.ID
		d.Provider = &slEndpoint.Provider
		return d
	}

	// Scale up
	if pressure >= scaleUpThreshold && canSpend && priorityClass != nil {
		workersForWindow := int(math.Ceil(load.ExpectedRuntimeMinutes / float64(capMinPerWorker)))
		desiredWorkers := domain.ClampInteger(float64(workersForWindow), plan.MinWorkers, plan.MaxWorkers)

		logicalW := 1
		if options != nil && options.LogicalWorkersPerComputeUnit != nil {
			logicalW = *options.LogicalWorkersPerComputeUnit
		}
		desiredCU := int(math.Max(math.Ceil(float64(desiredWorkers)/float64(logicalW)), func() float64 { if desiredWorkers > 0 { return 1 }; return 0 }()))

		if desiredWorkers > load.ActiveWorkers {
			d := build(domain.GalSwarmDecisionActionScaleUp, desiredWorkers, ptr(domain.GalSwarmRoutingTargetSelfHosted), "Runnable work pressure exceeds scale-up threshold and projected spend is within budget.")
			d.DesiredComputeUnits = &desiredCU
			if options != nil && len(options.ProviderCandidates) > 0 {
				sel := SelectGalSwarmProvider(domain.GalSwarmProviderSelectionInput{
					Plan:               plan,
					ExpectedRuntimeMinutes: load.ExpectedRuntimeMinutes,
					DesiredWorkers:     desiredWorkers,
					DesiredComputeUnits: &desiredCU,
					Candidates:         options.ProviderCandidates,
				})
				if sel.Selected != nil {
					p := sel.Selected.Provider
					d.Provider = &p
					d.ComputeProfileID = &sel.Selected.ComputeProfileID
				}
			}
			if d.Provider == nil {
				cp := selectComputeProfile(plan, cost.Provider)
				if cp != nil {
					d.Provider = &cp.Provider
					d.ComputeProfileID = &cp.ID
				}
			}
			return d
		}
	}

	// Hold
	if effUtil >= holdUtilThreshold || (priorityClass != nil && pressure >= 1) {
		workers := domain.ClampInteger(float64(load.ActiveWorkers), plan.MinWorkers, plan.MaxWorkers)
		d := build(domain.GalSwarmDecisionActionHold, workers, ptr(domain.GalSwarmRoutingTargetSelfHosted), "Current capacity is justified by utilization or deadline pressure.")
		return d
	}

	// Drain
	if effUtil <= drainUtilThreshold {
		workers := int(math.Max(float64(plan.MinWorkers), math.Min(float64(load.BusyWorkers), float64(load.ActiveWorkers))))
		routing := domain.GalSwarmRoutingTargetSelfHosted
		if slEndpoint != nil {
			routing = domain.GalSwarmRoutingTargetServerless
		}
		d := build(domain.GalSwarmDecisionActionDrain, workers, &routing, "Utilization is below drain threshold; stop accepting new work and let active workers finish.")
		if slEndpoint != nil {
			d.ServerlessEndpointID = &slEndpoint.ID
		}
		return d
	}

	// Default: hold
	workers := domain.ClampInteger(float64(load.ActiveWorkers), plan.MinWorkers, plan.MaxWorkers)
	return build(domain.GalSwarmDecisionActionHold, workers, ptr(domain.GalSwarmRoutingTargetSelfHosted), "No scale-up, drain, or shutdown threshold was crossed.")
}

// PlanGalSwarmDecisionFromForecast computes a decision from a forecast.
func PlanGalSwarmDecisionFromForecast(plan *domain.GalSwarmPlan, forecast domain.GalSwarmExecutionForecastInput, cost domain.GalSwarmCostSnapshot, options *domain.GalSwarmForecastAdapterOptions) domain.GalSwarmDecision {
	if err := ValidateGalSwarmPlan(plan); err != nil {
		panic(err.Error())
	}

	load := BuildGalSwarmLoadFromForecast(plan, forecast, options)
	priorityClass := HighestRunnablePriority(plan, load)
	effUtil := CalculateGalSwarmEffectiveUtilization(load)
	pressure := CalculateGalSwarmPressure(load)
	canSpend := cost.ProjectedSpendUsd <= plan.MaxSpendUsd

	now := func() string { return domain.GalSwarmNow() }
	if options != nil && options.Now != nil {
		now = options.Now
	}

	build := func(action domain.GalSwarmDecisionAction, workers int, routing *domain.GalSwarmRoutingTarget, reason string) domain.GalSwarmDecision {
		d := domain.GalSwarmDecision{
			SchemaVersion:       domain.GalSwarmDecisionSchemaVersion,
			SwarmID:             plan.SwarmID,
			Action:              action,
			DesiredWorkers:      workers,
			Reason:              reason,
			Pressure:            pressure,
			EffectiveUtilization: effUtil,
			ProjectedSpendUsd:   cost.ProjectedSpendUsd,
			PriorityClass:       priorityClass,
			EvaluatedAt:         now(),
		}
		if routing != nil {
			d.RoutingTarget = routing
		}
		return d
	}

	if forecast.Capacity.Action == "shutdown" && load.RunnableWorkUnits == 0 {
		sl := selectServerlessFallbackEndpoint(plan)
		d := build(domain.GalSwarmDecisionActionShutdown, 0, ptr(domain.GalSwarmRoutingTargetServerless), "Prediction forecast recommends shutdown: "+forecast.Capacity.Reason)
		if sl != nil {
			d.ServerlessEndpointID = &sl.ID
		}
		return d
	}

	if forecast.Capacity.Action == "drain" {
		sl := selectServerlessFallbackEndpoint(plan)
		workers := int(math.Max(float64(plan.MinWorkers), math.Min(float64(load.BusyWorkers), float64(load.ActiveWorkers))))
		routing := domain.GalSwarmRoutingTargetSelfHosted
		if sl != nil {
			routing = domain.GalSwarmRoutingTargetServerless
		}
		d := build(domain.GalSwarmDecisionActionDrain, workers, &routing, "Prediction forecast recommends drain: "+forecast.Capacity.Reason)
		if sl != nil {
			d.ServerlessEndpointID = &sl.ID
		}
		return d
	}

	if forecast.Capacity.Action == "route_serverless" {
		sl := selectServerlessFallbackEndpoint(plan)
		workers := domain.ClampInteger(float64(load.ActiveWorkers), plan.MinWorkers, plan.MaxWorkers)
		if sl != nil && plan.ServerlessFallback != nil && plan.ServerlessFallback.DrainSelfHosted {
			workers = int(math.Max(float64(plan.MinWorkers), math.Min(float64(load.BusyWorkers), float64(load.ActiveWorkers))))
		}
		d := build(domain.GalSwarmDecisionActionRouteServerless, workers, ptr(domain.GalSwarmRoutingTargetServerless), "Prediction forecast recommends serverless fallback: "+forecast.Capacity.Reason)
		if sl != nil {
			d.ServerlessEndpointID = &sl.ID
			d.Provider = &sl.Provider
		}
		return d
	}

	if forecast.Capacity.Action == "scale_up" && canSpend && priorityClass != nil {
		workers := domain.ClampInteger(float64(forecast.Capacity.RecommendedWorkers), plan.MinWorkers, plan.MaxWorkers)
		logicalW := 1
		if options != nil && options.LogicalWorkersPerComputeUnit != nil {
			logicalW = *options.LogicalWorkersPerComputeUnit
		}
		desiredCU := int(math.Max(math.Ceil(float64(workers)/float64(logicalW)), func() float64 { if workers > 0 { return 1 }; return 0 }()))

		if workers > load.ActiveWorkers {
			d := build(domain.GalSwarmDecisionActionScaleUp, workers, ptr(domain.GalSwarmRoutingTargetSelfHosted), "Prediction forecast recommends scale-up: "+forecast.Capacity.Reason)
			d.DesiredComputeUnits = &desiredCU
			if options != nil && len(options.ProviderCandidates) > 0 {
				sel := SelectGalSwarmProvider(domain.GalSwarmProviderSelectionInput{
					Plan:               plan,
					ExpectedRuntimeMinutes: forecast.HorizonMinutes,
					DesiredWorkers:     workers,
					DesiredComputeUnits: &desiredCU,
					Candidates:         options.ProviderCandidates,
				})
				if sel.Selected != nil {
					p := sel.Selected.Provider
					d.Provider = &p
					d.ComputeProfileID = &sel.Selected.ComputeProfileID
					d.ProjectedSpendUsd = sel.Selected.EstimatedCostUsd
				}
			}
			if d.Provider == nil {
				cp := selectComputeProfile(plan, cost.Provider)
				if cp != nil {
					d.Provider = &cp.Provider
					d.ComputeProfileID = &cp.ID
				}
			}
			return d
		}
	}

	opts := &domain.GalSwarmPolicyOptions{
		CapacityMinutesPerWorker: func() *int { v := int(forecast.HorizonMinutes); return &v }(),
	}
	if options != nil {
		opts.Now = options.Now
		opts.ScaleUpPressureThreshold = options.ScaleUpPressureThreshold
		opts.HoldUtilizationThreshold = options.HoldUtilizationThreshold
		opts.DrainUtilizationThreshold = options.DrainUtilizationThreshold
		opts.ShutdownUtilizationThreshold = options.ShutdownUtilizationThreshold
	}
	return PlanGalSwarmDecision(plan, load, cost, opts)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

func modeResult(mode domain.GalSwarmOrchestrationMode, reason string) domain.GalSwarmTopologyRouteDecision {
	return domain.GalSwarmTopologyRouteDecision{Mode: mode, Reason: reason}
}

func validateTopologyRequest(req domain.GalSwarmTopologyRequest) error {
	if req.SchemaVersion != nil && *req.SchemaVersion != domain.GalSwarmTopologySchemaVersion {
		return fmt.Errorf("Topology schemaVersion must be %s", domain.GalSwarmTopologySchemaVersion)
	}
	if strings.TrimSpace(req.Objective) == "" {
		return fmt.Errorf("Topology objective is required.")
	}
	if !isValidRiskLevel(string(req.RiskLevel)) {
		return fmt.Errorf("Invalid risk level: %s", req.RiskLevel)
	}
	if req.DesiredMode != nil && *req.DesiredMode != "" {
		if _, err := NormalizeGalSwarmTopologyMode(*req.DesiredMode); err != nil {
			return err
		}
	}
	if len(req.Tasks) == 0 {
		return fmt.Errorf("Topology request must include at least one task.")
	}
	for _, repo := range req.Repositories {
		if strings.TrimSpace(repo) == "" {
			return fmt.Errorf("Topology repositories cannot include blank entries.")
		}
	}
	for _, task := range req.Tasks {
		if strings.TrimSpace(task.ID) == "" {
			return fmt.Errorf("Topology task id is required.")
		}
		if strings.TrimSpace(task.Title) == "" {
			return fmt.Errorf("Topology task %s title is required.", task.ID)
		}
		if !isValidTaskKind(string(task.Kind)) {
			return fmt.Errorf("Invalid topology task kind: %s", task.Kind)
		}
		if task.RiskLevel != nil && !isValidRiskLevel(string(*task.RiskLevel)) {
			return fmt.Errorf("Invalid topology task risk level: %s", *task.RiskLevel)
		}
		for _, cap := range task.RequiredCapabilities {
			if !isValidFleetCapability(string(cap)) {
				return fmt.Errorf("Invalid task capability: %s", cap)
			}
		}
	}
	return nil
}

func normalizeGovernance(g *domain.GalSwarmGovernanceConstraints) domain.GalSwarmGovernanceNormalized {
	if g == nil {
		g = &domain.GalSwarmGovernanceConstraints{}
	}
	ng := domain.GalSwarmGovernanceNormalized{
		AllowedRepositories: domain.UniqueStrings(g.AllowedRepositories),
		AllowedTools:        domain.UniqueStrings(g.AllowedTools),
		MaxConcurrentLanes:     8,
		RequireFileLeases:            true,
		RequireIndependentReview:     false,
		RequireApprovalForDeployments: true,
		AllowDeployments:             false,
	}
	if g.MaxConcurrentLanes != nil {
		ng.MaxConcurrentLanes = *g.MaxConcurrentLanes
	}
	if g.RequireFileLeases != nil {
		ng.RequireFileLeases = *g.RequireFileLeases
	}
	if g.RequireIndependentReview != nil {
		ng.RequireIndependentReview = *g.RequireIndependentReview
	}
	if g.RequireApprovalForDeployments != nil {
		ng.RequireApprovalForDeployments = *g.RequireApprovalForDeployments
	}
	if g.AllowDeployments != nil {
		ng.AllowDeployments = *g.AllowDeployments
	}
	return ng
}

func normalizeTasks(tasks []domain.GalSwarmTopologyTask) []domain.GalSwarmTopologyTask {
	result := make([]domain.GalSwarmTopologyTask, len(tasks))
	for i, t := range tasks {
		deps := domain.UniqueStrings(t.DependsOn)
		if deps == nil {
			deps = []string{}
		}
		refs := domain.UniqueStrings(t.IssueRefs)
		if refs == nil {
			refs = []string{}
		}
		evReq := domain.UniqueStrings(t.EvidenceRequirements)
		if evReq == nil {
			evReq = []string{}
		}
		repo := strings.TrimSpace(derefStr(t.Repository))
		if repo == "" {
			repo = ""
		}
		result[i] = domain.GalSwarmTopologyTask{
			ID:                  strings.TrimSpace(t.ID),
			Title:               strings.TrimSpace(t.Title),
			Kind:                t.Kind,
			Repository:          optionalStr(repo),
			IssueRefs:           refs,
			DependsOn:           deps,
			CanRunInParallel:    t.CanRunInParallel,
			RiskLevel:           t.RiskLevel,
			RequiredCapabilities: domain.UniqueCapabilities(t.RequiredCapabilities),
			EvidenceRequirements: evReq,
		}
	}
	return result
}

func appendRepos(repos []string, tasks []domain.GalSwarmTopologyTask) []string {
	result := make([]string, len(repos))
	copy(result, repos)
	for _, t := range tasks {
		if t.Repository != nil && *t.Repository != "" {
			result = append(result, *t.Repository)
		}
	}
	return result
}

func appendIssues(issues []string, tasks []domain.GalSwarmTopologyTask) []string {
	result := make([]string, len(issues))
	copy(result, issues)
	for _, t := range tasks {
		result = append(result, t.IssueRefs...)
	}
	return result
}

func assertRepositoriesAllowed(repos []string, gov domain.GalSwarmGovernanceNormalized) error {
	if len(gov.AllowedRepositories) == 0 {
		return nil
	}
	allowed := makeSet(gov.AllowedRepositories)
	for _, r := range repos {
		if !allowed[r] {
			return fmt.Errorf("Topology repository %s is outside governance.allowedRepositories", r)
		}
	}
	return nil
}

func normalizeEvidenceRequirements(req domain.GalSwarmTopologyRequest, tasks []domain.GalSwarmTopologyTask, riskLevel domain.GalSwarmRiskLevel, gov domain.GalSwarmGovernanceNormalized) []domain.GalSwarmEvidenceRequirement {
	var ev []domain.GalSwarmEvidenceRequirement
	ev = append(ev, domain.GalSwarmEvidenceRequirement{
		ID: "task-graph", Title: "A deterministic task graph and lane assignment record is attached.",
		RequiredForRoles: []domain.GalSwarmLaneRole{domain.GalSwarmLaneRoleDirector},
	})
	ev = append(ev, domain.GalSwarmEvidenceRequirement{
		ID: "bounded-ownership", Title: "Every lane declares bounded repositories, issues, tools, and file-lease expectations.",
		RequiredForRoles: []domain.GalSwarmLaneRole{domain.GalSwarmLaneRoleScope, domain.GalSwarmLaneRoleDirector},
	})

	if gov.RequireFileLeases {
		ev = append(ev, domain.GalSwarmEvidenceRequirement{
			ID: "file-leases", Title: "Workers must publish file ownership before edits and release it before reconciliation.",
			RequiredForRoles: []domain.GalSwarmLaneRole{domain.GalSwarmLaneRoleWorker, domain.GalSwarmLaneRoleReconciler},
		})
	}

	if tasksHaveKind(tasks, []string{"implementation", "build", "test", "release", "verify"}) {
		ev = append(ev, domain.GalSwarmEvidenceRequirement{
			ID: "tests", Title: "Tests, build output, or an explicit no-test rationale must be attached.",
			RequiredForRoles: []domain.GalSwarmLaneRole{domain.GalSwarmLaneRoleWorker, domain.GalSwarmLaneRoleVerifier},
		})
	}

	if gov.RequireIndependentReview || domain.RiskRank(riskLevel) >= domain.RiskRank(domain.GalSwarmRiskLevelHigh) {
		r := domain.GalSwarmRiskLevelMedium
		ev = append(ev, domain.GalSwarmEvidenceRequirement{
			ID: "independent-review", Title: "An independent reviewer lane must review risky diffs before reconciliation.",
			RequiredForRoles:    []domain.GalSwarmLaneRole{domain.GalSwarmLaneRoleReviewer, domain.GalSwarmLaneRoleReconciler},
			RequiredForRiskAtLeast: &r,
		})
	}

	if domain.RiskRank(riskLevel) >= domain.RiskRank(domain.GalSwarmRiskLevelHigh) || tasksHaveKind(tasks, []string{"release"}) {
		r := domain.GalSwarmRiskLevelHigh
		ev = append(ev, domain.GalSwarmEvidenceRequirement{
			ID: "runtime-proof", Title: "Runtime, CI, or release evidence must prove the requested outcome before closeout.",
			RequiredForRoles:    []domain.GalSwarmLaneRole{domain.GalSwarmLaneRoleVerifier},
			RequiredForRiskAtLeast: &r,
		})
	}

	if tasksHaveKind(tasks, []string{"security"}) {
		ev = append(ev, domain.GalSwarmEvidenceRequirement{
			ID: "security-findings", Title: "Security worker findings and residual-risk notes must be attached.",
			RequiredForRoles: []domain.GalSwarmLaneRole{domain.GalSwarmLaneRoleWorker, domain.GalSwarmLaneRoleReviewer, domain.GalSwarmLaneRoleVerifier},
		})
	}

	// Add any from the request
	ev = append(ev, req.EvidenceRequirements...)
	return uniqueEvidenceRequirements(ev)
}

type createLaneDraftInput struct {
	objective            string
	mode                 domain.GalSwarmOrchestrationMode
	tasks                []domain.GalSwarmTopologyTask
	repositories         []string
	issues               []string
	governance           domain.GalSwarmGovernanceNormalized
	evidenceRequirements []domain.GalSwarmEvidenceRequirement
	riskLevel            domain.GalSwarmRiskLevel
}

func createLaneDrafts(input createLaneDraftInput) []executionLaneDraft {
	taskByID := make(map[string]domain.GalSwarmTopologyTask)
	for _, t := range input.tasks {
		taskByID[t.ID] = t
	}

	workerLaneIDs := make([]string, len(input.tasks))
	for i, t := range input.tasks {
		workerLaneIDs[i] = workerLaneID(t.ID)
	}

	allTaskIDs := make([]string, len(input.tasks))
	for i, t := range input.tasks {
		allTaskIDs[i] = t.ID
	}

	var lanes []executionLaneDraft

	// Director lane
	lanes = append(lanes, newLaneDraft(laneDraftInput{
		id:                  "lane-director",
		role:                domain.GalSwarmLaneRoleDirector,
		title:               "Director: " + input.objective,
		taskIds:             allTaskIDs,
		dependsOnLaneIds:    nil,
		requiredCapabilities: []domain.GalSwarmFleetCapability{domain.GalSwarmFleetCapabilityReview},
		repositories:        input.repositories,
		issueRefs:           input.issues,
		governance:          input.governance,
		evidenceExpectations: append([]string{"assignment-record"}, evidenceIDsForLane(input.evidenceRequirements, domain.GalSwarmLaneRoleDirector, input.riskLevel)...),
	}))

	// Scope lane
	lanes = append(lanes, newLaneDraft(laneDraftInput{
		id:                  "lane-scope",
		role:                domain.GalSwarmLaneRoleScope,
		title:               "Scope and governance aperture",
		taskIds:             allTaskIDs,
		dependsOnLaneIds:    []string{"lane-director"},
		requiredCapabilities: []domain.GalSwarmFleetCapability{domain.GalSwarmFleetCapabilityReview},
		repositories:        input.repositories,
		issueRefs:           input.issues,
		governance:          input.governance,
		evidenceExpectations: append([]string{"repo-contract", "policy-boundary"}, evidenceIDsForLane(input.evidenceRequirements, domain.GalSwarmLaneRoleScope, input.riskLevel)...),
	}))

	// Worker lanes per task
	for _, task := range input.tasks {
		deps := []string{"lane-scope"}
		for _, depID := range task.DependsOn {
			deps = append(deps, workerLaneID(depID))
		}

		evReq := []string{"worker-summary"}
		evReq = append(evReq, task.EvidenceRequirements...)
		taskRisk := input.riskLevel
		if task.RiskLevel != nil {
			taskRisk = *task.RiskLevel
		}
		evReq = append(evReq, evidenceIDsForLane(input.evidenceRequirements, domain.GalSwarmLaneRoleWorker, taskRisk)...)

		taskRepo := input.repositories
		if task.Repository != nil && *task.Repository != "" {
			taskRepo = []string{*task.Repository}
		}

		lanes = append(lanes, newLaneDraft(laneDraftInput{
			id:        workerLaneID(task.ID),
			role:      domain.GalSwarmLaneRoleWorker,
			title:     fmt.Sprintf("%s: %s", task.Kind, task.Title),
			taskIds:   []string{task.ID},
			dependsOnLaneIds: domain.UniqueStrings(deps),
			requiredCapabilities: inferGalSwarmTaskCapabilities(task),
			repositories:   taskRepo,
			issueRefs:      task.IssueRefs,
			governance:     input.governance,
			evidenceExpectations: domain.UniqueStrings(evReq),
		}))
	}

	// Reviewer lane
	needsReviewer := input.governance.RequireIndependentReview ||
		domain.RiskRank(input.riskLevel) >= domain.RiskRank(domain.GalSwarmRiskLevelMedium) ||
		mapContains([]string{"heavy", "mixture", "group_chat", "router"}, string(input.mode))
	if needsReviewer {
		lanes = append(lanes, newLaneDraft(laneDraftInput{
			id:                  "lane-reviewer",
			role:                domain.GalSwarmLaneRoleReviewer,
			title:               "Independent review",
			taskIds:             allTaskIDs,
			dependsOnLaneIds:    workerLaneIDs,
			requiredCapabilities: []domain.GalSwarmFleetCapability{domain.GalSwarmFleetCapabilityReview},
			repositories:        input.repositories,
			issueRefs:           input.issues,
			governance:          input.governance,
			evidenceExpectations: append([]string{"review-notes"}, evidenceIDsForLane(input.evidenceRequirements, domain.GalSwarmLaneRoleReviewer, input.riskLevel)...),
		}))
	}

	reviewerLaneID := ""
	if needsReviewer {
		reviewerLaneID = "lane-reviewer"
	}

	// Reconciler lane
	needsReconciler := len(input.tasks) > 1 || input.mode != domain.GalSwarmOrchestrationModeSequential
	if needsReconciler {
		depLanes := workerLaneIDs
		if reviewerLaneID != "" {
			depLanes = []string{reviewerLaneID}
		}
		lanes = append(lanes, newLaneDraft(laneDraftInput{
			id:                  "lane-reconciler",
			role:                domain.GalSwarmLaneRoleReconciler,
			title:               "Reconcile worker outputs",
			taskIds:             allTaskIDs,
			dependsOnLaneIds:    depLanes,
			requiredCapabilities: []domain.GalSwarmFleetCapability{domain.GalSwarmFleetCapabilityRepoWrite},
			repositories:        input.repositories,
			issueRefs:           input.issues,
			governance:          input.governance,
			evidenceExpectations: append([]string{"merged-output", "conflict-check"}, evidenceIDsForLane(input.evidenceRequirements, domain.GalSwarmLaneRoleReconciler, input.riskLevel)...),
		}))
	}

	// Verifier lane
	verifierDepLanes := workerLaneIDs
	if reviewerLaneID != "" {
		verifierDepLanes = []string{reviewerLaneID}
	}
	if needsReconciler {
		verifierDepLanes = []string{"lane-reconciler"}
	}

	lanes = append(lanes, newLaneDraft(laneDraftInput{
		id:                  "lane-verifier",
		role:                domain.GalSwarmLaneRoleVerifier,
		title:               "Verify and attach proof",
		taskIds:             allTaskIDs,
		dependsOnLaneIds:    verifierDepLanes,
		requiredCapabilities: inferGalSwarmVerifierCapabilities(input.tasks),
		repositories:        input.repositories,
		issueRefs:           input.issues,
		governance:          input.governance,
		evidenceExpectations: append([]string{"verification-result"}, evidenceIDsForLane(input.evidenceRequirements, domain.GalSwarmLaneRoleVerifier, input.riskLevel)...),
	}))

	// Validate
	assertLaneDraftsValid(lanes, taskByID)

	return lanes
}

type laneDraftInput struct {
	id                   string
	role                 domain.GalSwarmLaneRole
	title                string
	taskIds              []string
	dependsOnLaneIds     []string
	requiredCapabilities []domain.GalSwarmFleetCapability
	repositories         []string
	issueRefs            []string
	governance           domain.GalSwarmGovernanceNormalized
	evidenceExpectations []string
}

func newLaneDraft(in laneDraftInput) executionLaneDraft {
	ownershipRepos := domain.UniqueStrings(in.repositories)
	if len(in.governance.AllowedRepositories) > 0 {
		var filtered []string
		allowed := makeSet(in.governance.AllowedRepositories)
		for _, r := range ownershipRepos {
			if allowed[r] {
				filtered = append(filtered, r)
			}
		}
		ownershipRepos = filtered
	}

	return executionLaneDraft{
		ID:                   in.id,
		Role:                 in.role,
		Title:                in.title,
		TaskIDs:              domain.UniqueStrings(in.taskIds),
		DependsOnLaneIDs:     domain.UniqueStrings(in.dependsOnLaneIds),
		RequiredCapabilities: domain.UniqueCapabilities(in.requiredCapabilities),
		Ownership: domain.GalSwarmLaneOwnership{
			TaskIDs:           domain.UniqueStrings(in.taskIds),
			Repositories:      ownershipRepos,
			IssueRefs:         domain.UniqueStrings(in.issueRefs),
			AllowedTools:      in.governance.AllowedTools,
			FileLeasesRequired: in.governance.RequireFileLeases,
		},
		EvidenceExpectations: domain.UniqueStrings(in.evidenceExpectations),
	}
}

func assertLaneDraftsValid(lanes []executionLaneDraft, taskByID map[string]domain.GalSwarmTopologyTask) {
	laneIDs := make(map[string]bool)
	for _, l := range lanes {
		if laneIDs[l.ID] {
			panic(fmt.Sprintf("Duplicate topology lane id: %s", l.ID))
		}
		laneIDs[l.ID] = true
	}

	for _, l := range lanes {
		for _, depID := range l.DependsOnLaneIDs {
			if !laneIDs[depID] {
				panic(fmt.Sprintf("Lane %s depends on unknown lane %s", l.ID, depID))
			}
		}
		for _, tID := range l.TaskIDs {
			if _, ok := taskByID[tID]; !ok {
				panic(fmt.Sprintf("Lane %s references unknown task %s", l.ID, tID))
			}
		}
	}
}

func inferGalSwarmTaskCapabilities(task domain.GalSwarmTopologyTask) []domain.GalSwarmFleetCapability {
	caps := make([]domain.GalSwarmFleetCapability, len(task.RequiredCapabilities))
	copy(caps, task.RequiredCapabilities)

	switch task.Kind {
	case domain.GalSwarmTaskKindBuild:
		caps = append(caps, domain.GalSwarmFleetCapabilityLinuxX64, domain.GalSwarmFleetCapabilityBuild, domain.GalSwarmFleetCapabilityDocker)
	case domain.GalSwarmTaskKindTest:
		caps = append(caps, domain.GalSwarmFleetCapabilityLinuxX64, domain.GalSwarmFleetCapabilityTest)
	case domain.GalSwarmTaskKindSecurity:
		caps = append(caps, domain.GalSwarmFleetCapabilityKali, domain.GalSwarmFleetCapabilitySecurity)
	case domain.GalSwarmTaskKindMacIOS:
		caps = append(caps, domain.GalSwarmFleetCapabilityDarwinArm64, domain.GalSwarmFleetCapabilityMac, domain.GalSwarmFleetCapabilityIOS)
	case domain.GalSwarmTaskKindRelease:
		caps = append(caps, domain.GalSwarmFleetCapabilityLinuxX64, domain.GalSwarmFleetCapabilityBuild, domain.GalSwarmFleetCapabilityTest)
	case domain.GalSwarmTaskKindImplementation, domain.GalSwarmTaskKindDocs, domain.GalSwarmTaskKindReconcile:
		caps = append(caps, domain.GalSwarmFleetCapabilityRepoWrite)
	case domain.GalSwarmTaskKindReview:
		caps = append(caps, domain.GalSwarmFleetCapabilityReview)
	case domain.GalSwarmTaskKindVerify:
		caps = append(caps, domain.GalSwarmFleetCapabilityTest)
	case domain.GalSwarmTaskKindScope:
		caps = append(caps, domain.GalSwarmFleetCapabilityReview)
	}

	return domain.UniqueCapabilities(caps)
}

func inferGalSwarmVerifierCapabilities(tasks []domain.GalSwarmTopologyTask) []domain.GalSwarmFleetCapability {
	hasKind := func(kinds ...string) bool {
		for _, t := range tasks {
			for _, k := range kinds {
				if string(t.Kind) == k {
					return true
				}
			}
		}
		return false
	}

	if hasKind("mac_ios") {
		return []domain.GalSwarmFleetCapability{domain.GalSwarmFleetCapabilityDarwinArm64, domain.GalSwarmFleetCapabilityMac, domain.GalSwarmFleetCapabilityIOS, domain.GalSwarmFleetCapabilityTest}
	}
	if hasKind("security") {
		return []domain.GalSwarmFleetCapability{domain.GalSwarmFleetCapabilityKali, domain.GalSwarmFleetCapabilitySecurity, domain.GalSwarmFleetCapabilityTest}
	}
	if hasKind("build", "test", "release") {
		return []domain.GalSwarmFleetCapability{domain.GalSwarmFleetCapabilityLinuxX64, domain.GalSwarmFleetCapabilityTest}
	}
	return []domain.GalSwarmFleetCapability{domain.GalSwarmFleetCapabilityTest}
}

func workerLaneID(taskID string) string {
	return "lane-worker-" + strings.NewReplacer(
		"/", "-", "\\", "-", " ", "-", ".", "-",
	).Replace(taskID)
}

func inferFleetNodeCapabilities(node domain.GalSwarmFleetNode) map[string]bool {
	caps := make(map[string]bool)
	for _, c := range node.Capabilities {
		caps[string(c)] = true
	}
	if node.OS == "linux" && node.Arch == "x64" {
		caps["linux-x64"] = true
	}
	if node.OS == "darwin" && node.Arch == "arm64" {
		caps["darwin-arm64"] = true
		caps["mac"] = true
	}
	searchable := strings.ToLower(node.ID + " " + node.Label + " " + strings.Join(node.RunnerLabels, " "))
	if strings.Contains(searchable, "kali") {
		caps["kali"] = true
		caps["security"] = true
	}
	return caps
}

func fallbackRunnerLabel(lane executionLaneDraft) string {
	caps := make(map[string]bool)
	for _, c := range lane.RequiredCapabilities {
		caps[string(c)] = true
	}
	if caps["kali"] || caps["security"] || caps["build"] {
		return domain.GalSwarmDefaultX64RunnerLabels[2]
	}
	if caps["test"] || caps["docker"] {
		return domain.GalSwarmDefaultX64RunnerLabels[1]
	}
	return domain.GalSwarmDefaultX64RunnerLabels[0]
}

func fleetCapWeight(cap domain.GalSwarmFleetCapability) float64 {
	switch cap {
	case domain.GalSwarmFleetCapabilityKali, domain.GalSwarmFleetCapabilitySecurity:
		return 26
	case domain.GalSwarmFleetCapabilityDarwinArm64, domain.GalSwarmFleetCapabilityMac, domain.GalSwarmFleetCapabilityIOS:
		return 24
	case domain.GalSwarmFleetCapabilityLinuxX64, domain.GalSwarmFleetCapabilityBuild, domain.GalSwarmFleetCapabilityTest, domain.GalSwarmFleetCapabilityDocker:
		return 18
	case domain.GalSwarmFleetCapabilityBrowser, domain.GalSwarmFleetCapabilityGPU:
		return 12
	case domain.GalSwarmFleetCapabilityRepoWrite, domain.GalSwarmFleetCapabilityReview:
		return 10
	default:
		return 0
	}
}

func selectServerlessFallbackEndpoint(plan *domain.GalSwarmPlan) *domain.GalSwarmServerlessEndpointProfile {
	if plan.ServerlessFallback == nil || !plan.ServerlessFallback.Enabled {
		return nil
	}
	for _, ep := range plan.ServerlessEndpoints {
		if ep.ID == plan.ServerlessFallback.EndpointID {
			return &ep
		}
	}
	return nil
}

func selectComputeProfile(plan *domain.GalSwarmPlan, preferredProvider domain.GalSwarmProviderKind) *domain.GalSwarmComputeProfile {
	for i := range plan.ComputeProfiles {
		if plan.ComputeProfiles[i].Provider == preferredProvider {
			return &plan.ComputeProfiles[i]
		}
	}
	for i := range plan.ComputeProfiles {
		for _, p := range plan.Providers {
			if plan.ComputeProfiles[i].Provider == p {
				return &plan.ComputeProfiles[i]
			}
		}
	}
	return nil
}

func evidenceIDsForLane(reqs []domain.GalSwarmEvidenceRequirement, role domain.GalSwarmLaneRole, risk domain.GalSwarmRiskLevel) []string {
	var ids []string
	for _, r := range reqs {
		if r.RequiredForRoles != nil {
			hasRole := false
			for _, rr := range r.RequiredForRoles {
				if rr == role {
					hasRole = true
					break
				}
			}
			if !hasRole {
				continue
			}
		}
		if r.RequiredForRiskAtLeast != nil && domain.RiskRank(risk) < domain.RiskRank(*r.RequiredForRiskAtLeast) {
			continue
		}
		ids = append(ids, r.ID)
	}
	return ids
}

func uniqueEvidenceRequirements(reqs []domain.GalSwarmEvidenceRequirement) []domain.GalSwarmEvidenceRequirement {
	seen := make(map[string]bool)
	var result []domain.GalSwarmEvidenceRequirement
	for _, r := range reqs {
		id := strings.TrimSpace(r.ID)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		roles := r.RequiredForRoles
		if roles != nil {
			cp := make([]domain.GalSwarmLaneRole, len(roles))
			copy(cp, roles)
			roles = cp
		}
		result = append(result, domain.GalSwarmEvidenceRequirement{
			ID:                    id,
			Title:                 strings.TrimSpace(r.Title),
			RequiredForRoles:      roles,
			RequiredForRiskAtLeast: r.RequiredForRiskAtLeast,
		})
	}
	return result
}

func isValidRiskLevel(v string) bool {
	for _, l := range domain.GalSwarmAllRiskLevels {
		if string(l) == v {
			return true
		}
	}
	return false
}

func isValidTaskKind(v string) bool {
	for _, k := range domain.GalSwarmAllTaskKinds {
		if string(k) == v {
			return true
		}
	}
	return false
}

func isValidFleetCapability(v string) bool {
	for _, c := range domain.GalSwarmAllFleetCapabilities {
		if string(c) == v {
			return true
		}
	}
	return false
}

func hasKind(tasks []domain.GalSwarmTopologyTask, kind string) bool {
	for _, t := range tasks {
		if string(t.Kind) == kind {
			return true
		}
	}
	return false
}

func tasksHaveKind(tasks []domain.GalSwarmTopologyTask, kinds []string) bool {
	for _, t := range tasks {
		for _, k := range kinds {
			if string(t.Kind) == k {
				return true
			}
		}
	}
	return false
}

func allScopeReviewDocs(tasks []domain.GalSwarmTopologyTask) bool {
	for _, t := range tasks {
		k := string(t.Kind)
		if k != "scope" && k != "review" && k != "docs" {
			return false
		}
	}
	return true
}

func collectRiskLevels(risk domain.GalSwarmRiskLevel, tasks []domain.GalSwarmTopologyTask) []domain.GalSwarmRiskLevel {
	levels := []domain.GalSwarmRiskLevel{risk}
	for _, t := range tasks {
		if t.RiskLevel != nil {
			levels = append(levels, *t.RiskLevel)
		}
	}
	return levels
}

func profileIDs(profiles []domain.GalSwarmComputeProfile) []string {
	ids := make([]string, len(profiles))
	for i, p := range profiles {
		ids[i] = p.ID
	}
	return ids
}

func makeSet(items []string) map[string]bool {
	s := make(map[string]bool, len(items))
	for _, v := range items {
		s[v] = true
	}
	return s
}

func derefInt(p *int) int {
	if p == nil {
		return 0
	}
	return *p
}

func derefF64(p *float64, fallback float64) float64 {
	if p == nil {
		return fallback
	}
	return *p
}

func ptr[T any](v T) *T { return &v }

func optionalStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func mapContains(slice []string, v string) bool {
	for _, s := range slice {
		if s == v {
			return true
		}
	}
	return false
}
