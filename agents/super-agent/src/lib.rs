use std::collections::{BTreeMap, HashMap};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

pub mod grpc;
pub mod runtime;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Topology {
    Single,
    Parallel,
    Sequential,
    Hierarchical,
    Hybrid,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ComplexityBand {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum ExecutionModel {
    SingleAgentPassthrough,
    MultiAgentOrchestration,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DagMetrics {
    pub nodes: u16,
    pub edges: u16,
    pub parallelism_width: u16,
    pub critical_path_depth: u16,
    pub coupling_score: f32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Subtask {
    pub id: String,
    pub title: String,
    pub detail: String,
    pub domains: Vec<String>,
    pub depends_on: Vec<String>,
    pub preferred_agent: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExecutionStage {
    pub stage: u16,
    pub subtask_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct OrchestrationPlan {
    pub complexity: u8,
    pub complexity_band: ComplexityBand,
    pub execution_model: ExecutionModel,
    pub domains: Vec<String>,
    pub topology: Topology,
    pub max_sub_agents: u8,
    pub hitl_required: bool,
    pub cost_bucket: String,
    pub metrics: DagMetrics,
    pub subtasks: Vec<Subtask>,
    pub execution_stages: Vec<ExecutionStage>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum RunStatus {
    Ready,
    AwaitingConsent,
    Halted,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VerifierVerdict {
    Allow,
    RequireConsent,
    Deny,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerifierReport {
    pub verdict: VerifierVerdict,
    pub reason: String,
    pub constitution_hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RunEvent {
    pub sequence: u64,
    pub kind: String,
    pub details: String,
    pub prev_hash: Option<String>,
    pub hash: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RunRecord {
    pub id: String,
    pub intent: String,
    pub plan: OrchestrationPlan,
    pub status: RunStatus,
    pub verifier: VerifierReport,
    pub events: Vec<RunEvent>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct SuperAgentService {
    next_run: u64,
    pub runs: BTreeMap<String, RunRecord>,
}

pub fn classify_complexity(intent: &str) -> u8 {
    let trimmed = intent.trim();
    if trimmed.is_empty() {
        return 1;
    }
    let lowered = trimmed.to_ascii_lowercase();

    let word_count = trimmed.split_whitespace().count() as u8;
    let clause_count = trimmed
        .split(['.', ';', '\n'])
        .filter(|part| !part.trim().is_empty())
        .count() as u8;
    let coordination = [" and ", " then ", " after ", " while ", " parallel "]
        .into_iter()
        .filter(|needle| lowered.contains(needle))
        .count() as u8;
    let domain_bonus = detect_domains(trimmed).len().saturating_sub(1) as u8;
    let risk_bonus = ["production", "delete", "transfer", "credential", "billing"]
        .into_iter()
        .filter(|needle| lowered.contains(needle))
        .count() as u8;
    let parallel_bonus = if lowered.contains("parallel") && domain_bonus > 0 {
        1
    } else {
        0
    };

    let mut score = 1u8;
    score = score.saturating_add(word_count / 20);
    score = score.saturating_add(clause_count.saturating_sub(1));
    score = score.saturating_add(coordination);
    score = score.saturating_add(domain_bonus.min(2));
    score = score.saturating_add(parallel_bonus);

    score = score.saturating_add(risk_bonus.min(4));
    if risk_bonus >= 3 {
        score = score.saturating_add(2);
    }

    score.clamp(1, 10)
}

fn complexity_band(complexity: u8) -> ComplexityBand {
    match complexity {
        0..=3 => ComplexityBand::Low,
        4..=6 => ComplexityBand::Medium,
        _ => ComplexityBand::High,
    }
}

pub fn detect_domains(intent: &str) -> Vec<String> {
    let lowered = intent.to_ascii_lowercase();
    let mut domains = Vec::new();

    for (needle, domain) in [
        ("test", "test"),
        ("review", "review"),
        ("security", "security"),
        ("deploy", "deploy"),
        ("release", "deploy"),
        ("research", "research"),
        ("data", "data"),
        ("document", "docs"),
        ("doc", "docs"),
        ("code", "code"),
        ("fix", "code"),
    ] {
        if lowered.contains(needle) && !domains.iter().any(|item| item == domain) {
            domains.push(domain.to_string());
        }
    }

    if domains.is_empty() {
        domains.push("general".to_string());
    }

    domains
}

fn ordered_domains(intent: &str) -> Vec<String> {
    let lowered = intent.to_ascii_lowercase();
    let mut mentions = Vec::new();

    for (needle, domain) in [
        ("research", "research"),
        ("fix", "code"),
        ("code", "code"),
        ("review", "review"),
        ("test", "test"),
        ("security", "security"),
        ("document", "docs"),
        ("doc", "docs"),
        ("data", "data"),
        ("deploy", "deploy"),
        ("release", "deploy"),
    ] {
        if let Some(position) = lowered.find(needle) {
            mentions.push((position, domain));
        }
    }

    mentions.sort_by_key(|(position, _)| *position);
    let mut domains = Vec::new();
    for (_, domain) in mentions {
        if !domains.iter().any(|item| item == domain) {
            domains.push(domain.to_string());
        }
    }

    if domains.is_empty() {
        detect_domains(intent)
    } else {
        domains
    }
}

fn split_intent_fragments(intent: &str) -> Vec<String> {
    let mut normalized = intent.to_ascii_lowercase();
    for needle in [",", ";", ".", "\n", " and ", " then ", " after ", " while "] {
        normalized = normalized.replace(needle, "|");
    }

    normalized
        .split('|')
        .map(str::trim)
        .filter(|fragment| !fragment.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn domain_blueprint(domain: &str) -> (&'static str, &'static str, &'static str) {
    match domain {
        "review" => (
            "Review the requested surface",
            "Inspect the requested work for correctness, risk, and scope fit before any downstream action.",
            "review-specialist",
        ),
        "test" => (
            "Test the target behavior",
            "Validate the requested behavior and gather evidence for whether downstream execution is safe.",
            "test-specialist",
        ),
        "deploy" => (
            "Prepare the deployment step",
            "Assemble the deployment-ready output after prerequisite checks are complete.",
            "deploy-specialist",
        ),
        "security" => (
            "Check the security posture",
            "Review the request for risky or destructive behavior that needs tighter controls.",
            "security-specialist",
        ),
        "docs" => (
            "Document the requested change",
            "Capture the resulting behavior and operator-facing notes for the requested work.",
            "docs-specialist",
        ),
        "code" => (
            "Implement the requested code change",
            "Handle the code-facing part of the request while preserving the current bootstrap boundaries.",
            "code-specialist",
        ),
        "research" => (
            "Research the target surface",
            "Collect the context needed to shape the downstream implementation and validation work.",
            "research-specialist",
        ),
        "data" => (
            "Prepare the data-facing work",
            "Handle the data extraction or transformation needed by the request.",
            "data-specialist",
        ),
        _ => (
            "Handle the requested work",
            "Carry the request end-to-end within the bootstrap without external dispatch.",
            "generalist",
        ),
    }
}

fn passthrough_subtask(intent: &str, domains: &[String]) -> Subtask {
    Subtask {
        id: "task-1".to_string(),
        title: "Handle the request end-to-end".to_string(),
        detail: format!(
            "Single-agent passthrough for the bootstrap planner. Intent: {}",
            intent.trim()
        ),
        domains: domains.to_vec(),
        depends_on: Vec::new(),
        preferred_agent: "generalist".to_string(),
    }
}

fn fallback_multi_agent_subtasks(intent: &str) -> Vec<Subtask> {
    vec![
        Subtask {
            id: "task-1".to_string(),
            title: "Scope the request".to_string(),
            detail: format!(
                "Break down the request into a bounded bootstrap execution outline. Intent: {}",
                intent.trim()
            ),
            domains: vec!["general".to_string()],
            depends_on: Vec::new(),
            preferred_agent: "planner".to_string(),
        },
        Subtask {
            id: "task-2".to_string(),
            title: "Execute the bounded work".to_string(),
            detail: "Carry out the main body of the request within the current bootstrap boundaries."
                .to_string(),
            domains: vec!["general".to_string()],
            depends_on: vec!["task-1".to_string()],
            preferred_agent: "worker".to_string(),
        },
        Subtask {
            id: "task-3".to_string(),
            title: "Verify the bounded result".to_string(),
            detail: "Check that the bounded bootstrap slice is internally consistent before reporting ready."
                .to_string(),
            domains: vec!["general".to_string()],
            depends_on: vec!["task-2".to_string()],
            preferred_agent: "verifier".to_string(),
        },
    ]
}

fn build_domain_subtasks(intent: &str, domains: &[String], limit: usize) -> Vec<Subtask> {
    domains
        .iter()
        .take(limit)
        .enumerate()
        .map(|(index, domain)| {
            let (title, detail, preferred_agent) = domain_blueprint(domain);
            Subtask {
                id: format!("task-{}", index + 1),
                title: title.to_string(),
                detail: format!("{detail} Source intent: {}", intent.trim()),
                domains: vec![domain.clone()],
                depends_on: Vec::new(),
                preferred_agent: preferred_agent.to_string(),
            }
        })
        .collect()
}

fn build_fragment_subtasks(fragments: &[String], limit: usize) -> Vec<Subtask> {
    fragments
        .iter()
        .take(limit)
        .enumerate()
        .map(|(index, fragment)| Subtask {
            id: format!("task-{}", index + 1),
            title: format!("Handle fragment {}", index + 1),
            detail: format!("Bootstrap fragment extracted from the original intent: {fragment}"),
            domains: detect_domains(fragment),
            depends_on: if index == 0 {
                Vec::new()
            } else {
                vec![format!("task-{}", index)]
            },
            preferred_agent: if index == 0 {
                "planner".to_string()
            } else {
                "worker".to_string()
            },
        })
        .collect()
}

fn add_dependency(subtasks: &mut [Subtask], from_domain: &str, to_domain: &str) {
    let Some(from_id) = subtasks
        .iter()
        .find(|task| task.domains.iter().any(|domain| domain == from_domain))
        .map(|task| task.id.clone())
    else {
        return;
    };
    let Some(target) = subtasks
        .iter_mut()
        .find(|task| task.domains.iter().any(|domain| domain == to_domain))
    else {
        return;
    };
    if !target
        .depends_on
        .iter()
        .any(|dependency| dependency == &from_id)
    {
        target.depends_on.push(from_id);
        target.depends_on.sort();
    }
}

fn infer_dependencies(subtasks: &mut [Subtask], intent: &str) {
    if subtasks.len() <= 1 {
        return;
    }

    let lowered = intent.to_ascii_lowercase();

    for (from_domain, to_domain) in [
        ("research", "code"),
        ("research", "review"),
        ("research", "docs"),
        ("code", "review"),
        ("code", "test"),
        ("code", "security"),
        ("code", "docs"),
        ("review", "deploy"),
        ("test", "deploy"),
        ("security", "deploy"),
        ("docs", "deploy"),
        ("data", "docs"),
    ] {
        add_dependency(subtasks, from_domain, to_domain);
    }

    let has_parallel_language = lowered.contains("parallel") || lowered.contains("independent");
    if subtasks.iter().all(|task| task.depends_on.is_empty()) && !has_parallel_language {
        for index in 1..subtasks.len() {
            subtasks[index]
                .depends_on
                .push(subtasks[index - 1].id.clone());
        }
    }
}

fn planned_subtasks(intent: &str, complexity: u8, domains: &[String]) -> Vec<Subtask> {
    let band = complexity_band(complexity);
    if band == ComplexityBand::Low {
        return vec![passthrough_subtask(intent, domains)];
    }

    let limit = match band {
        ComplexityBand::Low => 1,
        ComplexityBand::Medium => 3,
        ComplexityBand::High => 5,
    };

    let ordered = ordered_domains(intent);
    let mut subtasks =
        if ordered.len() >= 2 || ordered.first().map(|domain| domain.as_str()) != Some("general") {
            build_domain_subtasks(intent, &ordered, limit)
        } else {
            let fragments = split_intent_fragments(intent);
            if fragments.len() >= 2 {
                build_fragment_subtasks(&fragments, limit)
            } else {
                fallback_multi_agent_subtasks(intent)
            }
        };

    if subtasks.len() < 2 {
        subtasks = fallback_multi_agent_subtasks(intent);
    }

    infer_dependencies(&mut subtasks, intent);
    subtasks
}

fn compute_coupling_score(
    subtasks: &[Subtask],
    edges: u16,
    critical_path_depth: u16,
    parallelism_width: u16,
) -> f32 {
    if subtasks.len() <= 1 {
        return 0.0;
    }

    let mut shared_pairs = 0u16;
    let total_pairs = (subtasks.len() * (subtasks.len() - 1) / 2) as u16;
    for left in 0..subtasks.len() {
        for right in left + 1..subtasks.len() {
            if subtasks[left]
                .domains
                .iter()
                .any(|domain| subtasks[right].domains.iter().any(|other| other == domain))
            {
                shared_pairs += 1;
            }
        }
    }

    let max_edges = total_pairs.max(1) as f32;
    let dependency_density = edges as f32 / max_edges;
    let shared_density = shared_pairs as f32 / total_pairs.max(1) as f32;
    let depth_pressure = if critical_path_depth > parallelism_width {
        (critical_path_depth - parallelism_width) as f32 / subtasks.len() as f32
    } else {
        0.0
    };

    (dependency_density * 0.5 + shared_density * 0.3 + depth_pressure.min(1.0) * 0.2).min(1.0)
}

fn analyze_dag(subtasks: &[Subtask]) -> (Vec<ExecutionStage>, DagMetrics) {
    if subtasks.is_empty() {
        return (
            Vec::new(),
            DagMetrics {
                nodes: 0,
                edges: 0,
                parallelism_width: 0,
                critical_path_depth: 0,
                coupling_score: 0.0,
            },
        );
    }

    let mut indegree: HashMap<String, usize> = subtasks
        .iter()
        .map(|task| (task.id.clone(), task.depends_on.len()))
        .collect();
    let mut dependents: HashMap<String, Vec<String>> = subtasks
        .iter()
        .map(|task| (task.id.clone(), Vec::new()))
        .collect();
    let mut depth: HashMap<String, u16> = subtasks
        .iter()
        .map(|task| (task.id.clone(), 1u16))
        .collect();

    for task in subtasks {
        for dependency in &task.depends_on {
            dependents
                .entry(dependency.clone())
                .or_default()
                .push(task.id.clone());
        }
    }

    let mut ready = subtasks
        .iter()
        .filter(|task| task.depends_on.is_empty())
        .map(|task| task.id.clone())
        .collect::<Vec<_>>();
    ready.sort();

    let mut processed = 0usize;
    let mut stages = Vec::new();
    let mut parallelism_width = 1u16;

    while !ready.is_empty() {
        parallelism_width = parallelism_width.max(ready.len() as u16);
        let stage_ids = ready.clone();
        let mut next_ready = Vec::new();

        for task_id in &stage_ids {
            processed += 1;
            let parent_depth = *depth.get(task_id).unwrap_or(&1);
            if let Some(children) = dependents.get(task_id) {
                for child in children {
                    let entry = depth.entry(child.clone()).or_insert(1);
                    *entry = (*entry).max(parent_depth.saturating_add(1));
                    if let Some(count) = indegree.get_mut(child) {
                        *count = count.saturating_sub(1);
                        if *count == 0 {
                            next_ready.push(child.clone());
                        }
                    }
                }
            }
        }

        next_ready.sort();
        next_ready.dedup();
        stages.push(ExecutionStage {
            stage: stages.len() as u16 + 1,
            subtask_ids: stage_ids,
        });
        ready = next_ready;
    }

    if processed != subtasks.len() {
        let fallback_stages = subtasks
            .iter()
            .enumerate()
            .map(|(index, task)| ExecutionStage {
                stage: index as u16 + 1,
                subtask_ids: vec![task.id.clone()],
            })
            .collect::<Vec<_>>();
        let edges = subtasks
            .iter()
            .map(|task| task.depends_on.len())
            .sum::<usize>() as u16;
        return (
            fallback_stages,
            DagMetrics {
                nodes: subtasks.len() as u16,
                edges,
                parallelism_width: 1,
                critical_path_depth: subtasks.len() as u16,
                coupling_score: 1.0,
            },
        );
    }

    let edges = subtasks
        .iter()
        .map(|task| task.depends_on.len())
        .sum::<usize>() as u16;
    let critical_path_depth = depth.values().copied().max().unwrap_or(1);
    let coupling_score =
        compute_coupling_score(subtasks, edges, critical_path_depth, parallelism_width);

    (
        stages,
        DagMetrics {
            nodes: subtasks.len() as u16,
            edges,
            parallelism_width,
            critical_path_depth,
            coupling_score,
        },
    )
}

pub fn select_topology(metrics: &DagMetrics) -> Topology {
    if metrics.nodes <= 1 {
        return Topology::Single;
    }
    if metrics.edges == 0 {
        return Topology::Parallel;
    }
    if metrics.parallelism_width <= 1 {
        return Topology::Sequential;
    }
    if metrics.parallelism_width >= 3
        && metrics.critical_path_depth <= 2
        && metrics.coupling_score < 0.3
    {
        return Topology::Parallel;
    }
    if metrics.critical_path_depth >= 4 && metrics.coupling_score > 0.6 {
        return Topology::Hierarchical;
    }
    Topology::Hybrid
}

pub fn build_plan(intent: &str, require_consent: bool) -> OrchestrationPlan {
    let complexity = classify_complexity(intent);
    let complexity_band = complexity_band(complexity);
    let domains = detect_domains(intent);
    let subtasks = planned_subtasks(intent, complexity, &domains);
    let (execution_stages, metrics) = analyze_dag(&subtasks);
    let topology = select_topology(&metrics);
    let hitl_required = require_consent || complexity >= 9;
    let max_sub_agents_cap = match complexity_band {
        ComplexityBand::Low => 1,
        ComplexityBand::Medium => 3,
        ComplexityBand::High => 8,
    };
    let cost_bucket = match complexity_band {
        ComplexityBand::Low => "low",
        ComplexityBand::Medium => "medium",
        ComplexityBand::High => "high",
    }
    .to_string();

    OrchestrationPlan {
        complexity,
        complexity_band,
        execution_model: match complexity_band {
            ComplexityBand::Low => ExecutionModel::SingleAgentPassthrough,
            ComplexityBand::Medium | ComplexityBand::High => {
                ExecutionModel::MultiAgentOrchestration
            }
        },
        domains,
        topology,
        max_sub_agents: (subtasks.len().min(max_sub_agents_cap as usize)) as u8,
        hitl_required,
        cost_bucket,
        metrics,
        subtasks,
        execution_stages,
    }
}

fn verifier_constitution_hash() -> &'static str {
    "59cdaf9ad1e0326bb3c825e8d7a824c43f54877135df67cbc1d6fcfe2aa1e8c1"
}

fn verify_run(intent: &str, plan: &OrchestrationPlan) -> VerifierReport {
    let lowered = intent.to_ascii_lowercase();
    let destructive = ["delete", "transfer", "credential", "billing"]
        .into_iter()
        .any(|needle| lowered.contains(needle));

    let verdict = if lowered.trim().is_empty() {
        VerifierVerdict::Deny
    } else if plan.hitl_required || destructive {
        VerifierVerdict::RequireConsent
    } else {
        VerifierVerdict::Allow
    };

    let reason = match verdict {
        VerifierVerdict::Allow => "bootstrap verifier approved the orchestration plan".to_string(),
        VerifierVerdict::RequireConsent => {
            "bootstrap verifier requires explicit human consent before execution".to_string()
        }
        VerifierVerdict::Deny => {
            "bootstrap verifier rejected an empty or invalid intent".to_string()
        }
    };

    VerifierReport {
        verdict,
        reason,
        constitution_hash: verifier_constitution_hash().to_string(),
    }
}

fn hash_event(
    run_id: &str,
    sequence: u64,
    kind: &str,
    details: &str,
    prev_hash: Option<&str>,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(run_id.as_bytes());
    hasher.update(sequence.to_string().as_bytes());
    hasher.update(kind.as_bytes());
    hasher.update(details.as_bytes());
    if let Some(prev_hash) = prev_hash {
        hasher.update(prev_hash.as_bytes());
    }
    format!("{:x}", hasher.finalize())
}

fn append_event(record: &mut RunRecord, kind: impl Into<String>, details: impl Into<String>) {
    let kind = kind.into();
    let details = details.into();
    let sequence = record.events.len() as u64 + 1;
    let prev_hash = record.events.last().map(|event| event.hash.clone());
    let hash = hash_event(&record.id, sequence, &kind, &details, prev_hash.as_deref());
    record.events.push(RunEvent {
        sequence,
        kind,
        details,
        prev_hash,
        hash,
    });
}

fn format_execution_stages(stages: &[ExecutionStage]) -> String {
    stages
        .iter()
        .map(|stage| format!("stage{}={}", stage.stage, stage.subtask_ids.join("+")))
        .collect::<Vec<_>>()
        .join(", ")
}

impl SuperAgentService {
    pub fn execute(&mut self, intent: impl Into<String>, require_consent: bool) -> RunRecord {
        self.next_run += 1;
        let intent = intent.into();
        let id = format!("run-{:06}", self.next_run);
        let plan = build_plan(&intent, require_consent);
        let verifier = verify_run(&intent, &plan);
        let status = match verifier.verdict {
            VerifierVerdict::Allow => RunStatus::Ready,
            VerifierVerdict::RequireConsent => RunStatus::AwaitingConsent,
            VerifierVerdict::Deny => RunStatus::Halted,
        };
        let mut record = RunRecord {
            id: id.clone(),
            plan,
            intent,
            status,
            verifier,
            events: Vec::new(),
        };
        let plan_event_details = format!(
            "mode={:?} topology={:?} subtasks={} dependencies={} stages={} max_sub_agents={}",
            record.plan.execution_model,
            record.plan.topology,
            record.plan.subtasks.len(),
            record.plan.metrics.edges,
            record.plan.execution_stages.len(),
            record.plan.max_sub_agents
        );
        append_event(&mut record, "plan.created", plan_event_details);
        let decomposition_details = format!(
            "subtasks=[{}] stages=[{}]",
            record
                .plan
                .subtasks
                .iter()
                .map(|task| format!("{}:{}", task.id, task.preferred_agent))
                .collect::<Vec<_>>()
                .join(", "),
            format_execution_stages(&record.plan.execution_stages)
        );
        append_event(&mut record, "decomposition.built", decomposition_details);
        let verifier_event_details = format!(
            "verdict={:?} constitution_hash={}",
            record.verifier.verdict, record.verifier.constitution_hash
        );
        append_event(&mut record, "verifier.checked", verifier_event_details);
        match record.status {
            RunStatus::Ready => append_event(
                &mut record,
                "run.ready",
                "orchestration plan passed the bootstrap verifier gate",
            ),
            RunStatus::AwaitingConsent => append_event(
                &mut record,
                "run.awaiting_consent",
                "run requires explicit human approval before execution",
            ),
            RunStatus::Halted => append_event(
                &mut record,
                "run.denied",
                "bootstrap verifier denied the run before execution",
            ),
        }
        self.runs.insert(id, record.clone());
        record
    }

    pub fn status(&self, run_id: &str) -> Option<&RunRecord> {
        self.runs.get(run_id)
    }

    pub fn approve(&mut self, run_id: &str) -> Option<RunRecord> {
        let record = self.runs.get_mut(run_id)?;
        if record.status != RunStatus::AwaitingConsent {
            return Some(record.clone());
        }
        record.verifier.verdict = VerifierVerdict::Allow;
        record.verifier.reason =
            "human consent granted after bootstrap verifier review".to_string();
        record.status = RunStatus::Ready;
        append_event(
            record,
            "consent.granted",
            "human approved the run after verifier review",
        );
        append_event(
            record,
            "run.ready",
            "run transitioned to ready after explicit human approval",
        );
        Some(record.clone())
    }

    pub fn halt(&mut self, run_id: &str) -> Option<RunRecord> {
        let record = self.runs.get_mut(run_id)?;
        record.status = RunStatus::Halted;
        record.verifier.verdict = VerifierVerdict::Deny;
        record.verifier.reason = "run halted by operator".to_string();
        append_event(record, "run.halted", "operator halted the run");
        Some(record.clone())
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use super::*;

    #[test]
    fn complexity_thresholds_match_operating_bands() {
        assert!(classify_complexity("fix typo") <= 3);
        assert!(classify_complexity("review, test, and deploy this service in parallel") >= 4);
        assert!(
            classify_complexity(
                "delete production credentials and transfer billing ownership immediately"
            ) >= 8
        );
    }

    #[test]
    fn low_complexity_uses_single_agent_passthrough_plan() {
        let plan = build_plan("fix typo", false);
        assert_eq!(plan.complexity_band, ComplexityBand::Low);
        assert_eq!(plan.execution_model, ExecutionModel::SingleAgentPassthrough);
        assert_eq!(plan.topology, Topology::Single);
        assert_eq!(plan.subtasks.len(), 1);
        assert!(plan.subtasks[0].depends_on.is_empty());
        assert_eq!(plan.execution_stages.len(), 1);
    }

    #[test]
    fn medium_complexity_builds_multi_agent_orchestration() {
        let plan = build_plan("review, test, and deploy this service in parallel", false);
        assert_eq!(plan.complexity_band, ComplexityBand::Medium);
        assert_eq!(
            plan.execution_model,
            ExecutionModel::MultiAgentOrchestration
        );
        assert_eq!(plan.subtasks.len(), 3);
        assert_eq!(plan.metrics.nodes as usize, plan.subtasks.len());
        assert_eq!(plan.metrics.edges, 2);
        assert_eq!(plan.execution_stages.len(), 2);

        let deploy = plan
            .subtasks
            .iter()
            .find(|task| task.domains.iter().any(|domain| domain == "deploy"))
            .expect("deploy subtask should exist");
        let dependencies = deploy.depends_on.iter().cloned().collect::<BTreeSet<_>>();
        assert_eq!(
            dependencies,
            BTreeSet::from(["task-1".to_string(), "task-2".to_string(),])
        );
    }

    #[test]
    fn topology_router_prefers_parallel_for_independent_work() {
        let metrics = DagMetrics {
            nodes: 4,
            edges: 0,
            parallelism_width: 4,
            critical_path_depth: 1,
            coupling_score: 0.1,
        };
        assert_eq!(select_topology(&metrics), Topology::Parallel);
    }

    #[test]
    fn topology_router_prefers_hierarchy_for_deep_coupled_work() {
        let metrics = DagMetrics {
            nodes: 6,
            edges: 5,
            parallelism_width: 2,
            critical_path_depth: 5,
            coupling_score: 0.9,
        };
        assert_eq!(select_topology(&metrics), Topology::Hierarchical);
    }

    #[test]
    fn service_tracks_execute_status_and_halt() {
        let mut svc = SuperAgentService::default();
        let run = svc.execute("review and deploy the service", false);
        assert_eq!(run.status, RunStatus::Ready);
        assert!(svc.status(&run.id).is_some());
        assert!(
            run.events
                .iter()
                .any(|event| event.kind == "decomposition.built")
        );
        let halted = svc.halt(&run.id).expect("run should exist");
        assert_eq!(halted.status, RunStatus::Halted);
    }

    #[test]
    fn risky_runs_require_consent_until_approved() {
        let mut svc = SuperAgentService::default();
        let run = svc.execute(
            "delete production credentials and transfer billing ownership immediately",
            true,
        );
        assert_eq!(run.status, RunStatus::AwaitingConsent);
        assert_eq!(run.verifier.verdict, VerifierVerdict::RequireConsent);

        let approved = svc.approve(&run.id).expect("run should exist");
        assert_eq!(approved.status, RunStatus::Ready);
        assert_eq!(approved.verifier.verdict, VerifierVerdict::Allow);
    }

    #[test]
    fn run_events_are_hash_chained() {
        let mut svc = SuperAgentService::default();
        let run = svc.execute("review and test the service in parallel", false);
        assert!(run.events.len() >= 4);
        for window in run.events.windows(2) {
            assert_eq!(
                window[1].prev_hash.as_deref(),
                Some(window[0].hash.as_str())
            );
        }
    }
}
