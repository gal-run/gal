use std::collections::BTreeMap;
use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkerState {
    Idle,
    Claimed,
    Running,
    Failed,
    DeadLetter,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WorkerPoolSpec {
    pub min_workers: u16,
    pub max_workers: u16,
    pub scale_up_threshold: f32,
    pub scale_down_threshold: f32,
    pub lease_timeout_secs: u64,
    pub heartbeat_interval_secs: u64,
    pub max_retries: u8,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MemoryConfig {
    pub vector_dimensions: u16,
    pub kv_max_value_size: u64,
    pub graph_max_nodes: u64,
    pub episodic_retention_hours: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GovernanceConfig {
    pub enforcement_points: Vec<String>,
    pub require_human_consent_for_destructive: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ImprovementPipeline {
    pub cadence_minutes: u64,
    pub requires_human_approval: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SystemManifest {
    pub worker_pool: WorkerPoolSpec,
    pub memory: MemoryConfig,
    pub governance: GovernanceConfig,
    pub improvement: ImprovementPipeline,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ManifestMetadata {
    pub name: String,
    pub revision: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ManifestEnvelope {
    #[serde(rename = "apiVersion")]
    pub api_version: String,
    pub kind: String,
    pub metadata: ManifestMetadata,
    pub spec: SystemManifest,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Worker {
    pub id: String,
    pub state: WorkerState,
    pub retries: u8,
    pub heartbeat_epoch: u64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct UtilizationInput {
    pub active_leases: u16,
    pub queued_tasks: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UtilizationSource {
    RuntimeDerived,
    ExternalSnapshot,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScalingDirection {
    Up,
    Down,
    Hold,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScalingStatus {
    pub source: UtilizationSource,
    pub active_leases: u16,
    pub queued_tasks: u16,
    pub total_demand: u16,
    pub schedulable_workers: u16,
    pub utilization_ratio: f32,
    pub desired_workers: u16,
    pub direction: ScalingDirection,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct RuntimePlan {
    pub steps: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ObservedRuntimeState {
    pub current_workers: u16,
    pub claimed_workers: u16,
    pub failed_workers: u16,
    pub dead_letter_workers: u16,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ApplyResult {
    pub dry_run: bool,
    pub actions: Vec<String>,
    pub persisted_state_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct VerifyResult {
    pub success: bool,
    pub checks: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ReconcileResult {
    #[serde(rename = "apiVersion")]
    pub api_version: String,
    pub kind: String,
    pub metadata: ManifestMetadata,
    pub observe: ObservedRuntimeState,
    pub observed_after: Option<ObservedRuntimeState>,
    pub scaling: ScalingStatus,
    pub diff: Vec<String>,
    pub plan: RuntimePlan,
    pub apply: ApplyResult,
    pub verify: VerifyResult,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct RuntimeStateMetadata {
    pub manifest_name: String,
    pub manifest_revision: u64,
    pub last_reconciled_epoch: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct RuntimeState {
    pub metadata: RuntimeStateMetadata,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_scaling: Option<ScalingStatus>,
    pub runtime: AgentRuntime,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
pub struct AgentRuntime {
    next_worker: u64,
    pub workers: BTreeMap<String, Worker>,
}

#[derive(Debug, Default)]
struct DrainOutcome {
    drained: Vec<String>,
    blocked: Vec<String>,
}

impl WorkerState {
    fn is_active(&self) -> bool {
        matches!(self, Self::Claimed | Self::Running)
    }

    fn is_schedulable(&self) -> bool {
        matches!(self, Self::Idle | Self::Claimed | Self::Running)
    }

    fn drain_priority(&self) -> Option<u8> {
        match self {
            Self::DeadLetter => Some(0),
            Self::Failed => Some(1),
            Self::Idle => Some(2),
            Self::Claimed | Self::Running => None,
        }
    }
}

impl UtilizationSource {
    fn as_str(&self) -> &'static str {
        match self {
            Self::RuntimeDerived => "runtime-derived",
            Self::ExternalSnapshot => "external-snapshot",
        }
    }
}

impl ScalingDirection {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Up => "scale-up",
            Self::Down => "scale-down",
            Self::Hold => "hold",
        }
    }
}

impl AgentRuntime {
    pub fn seed_pool(&mut self, spec: &WorkerPoolSpec, now: u64) {
        self.seed_pool_to(spec.min_workers, now);
    }

    pub fn claim(&mut self, worker_id: &str, now: u64) -> Option<()> {
        let worker = self.workers.get_mut(worker_id)?;
        worker.state = WorkerState::Claimed;
        worker.heartbeat_epoch = now;
        Some(())
    }

    pub fn renew_heartbeat(&mut self, worker_id: &str, now: u64) -> Option<()> {
        let worker = self.workers.get_mut(worker_id)?;
        worker.heartbeat_epoch = now;
        Some(())
    }

    pub fn reap_stale(&mut self, spec: &WorkerPoolSpec, now: u64) -> Vec<String> {
        let mut stale = Vec::new();
        for worker in self.workers.values_mut() {
            if !worker.state.is_active() {
                continue;
            }
            if now.saturating_sub(worker.heartbeat_epoch) <= spec.lease_timeout_secs {
                continue;
            }

            if worker.retries >= spec.max_retries {
                worker.state = WorkerState::DeadLetter;
            } else {
                worker.retries += 1;
                worker.state = WorkerState::Failed;
            }
            stale.push(worker.id.clone());
        }
        stale
    }

    fn schedulable_workers(&self) -> u16 {
        self.workers
            .values()
            .filter(|worker| worker.state.is_schedulable())
            .count() as u16
    }

    fn active_workers(&self) -> u16 {
        self.workers
            .values()
            .filter(|worker| worker.state.is_active())
            .count() as u16
    }

    fn scaling_status(
        &self,
        spec: &WorkerPoolSpec,
        utilization_input: Option<UtilizationInput>,
    ) -> ScalingStatus {
        let source = if utilization_input.is_some() {
            UtilizationSource::ExternalSnapshot
        } else {
            UtilizationSource::RuntimeDerived
        };
        let input = utilization_input.unwrap_or_else(|| UtilizationInput {
            active_leases: self.active_workers(),
            queued_tasks: 0,
        });
        let schedulable_workers = self.schedulable_workers();
        let total_demand = input.active_leases.saturating_add(input.queued_tasks);
        let utilization_ratio = if schedulable_workers == 0 {
            total_demand as f32
        } else {
            total_demand as f32 / schedulable_workers as f32
        };

        let (desired_workers, direction, reason) = if schedulable_workers == 0 {
            (
                spec.min_workers,
                if spec.min_workers > 0 {
                    ScalingDirection::Up
                } else {
                    ScalingDirection::Hold
                },
                format!(
                    "bootstrap empty runtime to minimum pool size {}",
                    spec.min_workers
                ),
            )
        } else if utilization_ratio >= spec.scale_up_threshold {
            let desired = ceil_workers_for_ratio(total_demand, spec.scale_up_threshold)
                .clamp(spec.min_workers, spec.max_workers)
                .max(spec.min_workers)
                .max(schedulable_workers.min(spec.max_workers));
            (
                desired,
                compare_direction(schedulable_workers, desired),
                format!(
                    "observed {:.2} utilization exceeds scale-up threshold {:.2}",
                    utilization_ratio, spec.scale_up_threshold
                ),
            )
        } else if utilization_ratio <= spec.scale_down_threshold {
            let desired = if total_demand == 0 {
                spec.min_workers
            } else {
                floor_workers_for_ratio(total_demand, spec.scale_down_threshold)
                    .clamp(spec.min_workers, spec.max_workers)
            }
            .min(schedulable_workers)
            .max(spec.min_workers);
            (
                desired,
                compare_direction(schedulable_workers, desired),
                format!(
                    "observed {:.2} utilization is at or below scale-down threshold {:.2}",
                    utilization_ratio, spec.scale_down_threshold
                ),
            )
        } else {
            let desired = schedulable_workers.clamp(spec.min_workers, spec.max_workers);
            (
                desired,
                compare_direction(schedulable_workers, desired),
                format!(
                    "observed {:.2} utilization is within steady-state thresholds {:.2}..{:.2}",
                    utilization_ratio, spec.scale_down_threshold, spec.scale_up_threshold
                ),
            )
        };

        ScalingStatus {
            source,
            active_leases: input.active_leases,
            queued_tasks: input.queued_tasks,
            total_demand,
            schedulable_workers,
            utilization_ratio,
            desired_workers,
            direction,
            reason,
        }
    }

    fn seed_pool_to(&mut self, target: u16, now: u64) -> Vec<String> {
        let mut seeded = Vec::new();
        while self.schedulable_workers() < target {
            self.next_worker += 1;
            let id = format!("worker-{:06}", self.next_worker);
            self.workers.insert(
                id.clone(),
                Worker {
                    id: id.clone(),
                    state: WorkerState::Idle,
                    retries: 0,
                    heartbeat_epoch: now,
                },
            );
            seeded.push(id);
        }
        seeded
    }

    fn revive_failed_to(&mut self, target: u16, now: u64) -> Vec<String> {
        let mut revived = Vec::new();
        let failed_ids: Vec<String> = self
            .workers
            .values()
            .filter(|worker| worker.state == WorkerState::Failed)
            .map(|worker| worker.id.clone())
            .collect();

        for worker_id in failed_ids {
            if self.schedulable_workers() >= target {
                break;
            }
            if let Some(worker) = self.workers.get_mut(&worker_id) {
                worker.state = WorkerState::Idle;
                worker.heartbeat_epoch = now;
                revived.push(worker_id);
            }
        }

        revived
    }

    fn drain_to(&mut self, target: u16) -> DrainOutcome {
        let mut outcome = DrainOutcome::default();
        if self.workers.len() <= target as usize {
            return outcome;
        }

        let mut drain_candidates: Vec<(u8, u64, String)> = self
            .workers
            .values()
            .filter_map(|worker| {
                Some((
                    worker.state.drain_priority()?,
                    worker.heartbeat_epoch,
                    worker.id.clone(),
                ))
            })
            .collect();
        drain_candidates.sort();

        for (_, _, worker_id) in drain_candidates {
            if self.workers.len() <= target as usize {
                break;
            }
            if self.workers.remove(&worker_id).is_some() {
                outcome.drained.push(worker_id);
            }
        }

        if self.workers.len() > target as usize {
            outcome.blocked = self
                .workers
                .values()
                .filter(|worker| worker.state.is_active())
                .map(|worker| worker.id.clone())
                .collect();
        }

        outcome
    }
}

impl ManifestEnvelope {
    pub fn validate(&self) -> Result<(), String> {
        if self.api_version != "agent-os.dev/v1alpha1" {
            return Err(format!("unsupported apiVersion: {}", self.api_version));
        }
        if self.kind != "AgentRuntime" {
            return Err(format!("unsupported manifest kind: {}", self.kind));
        }
        if self.metadata.name.trim().is_empty() {
            return Err("manifest metadata.name is required".to_string());
        }
        if self.spec.worker_pool.min_workers > self.spec.worker_pool.max_workers {
            return Err(
                "worker_pool.min_workers cannot exceed worker_pool.max_workers".to_string(),
            );
        }
        if !(0.0 < self.spec.worker_pool.scale_down_threshold
            && self.spec.worker_pool.scale_down_threshold
                < self.spec.worker_pool.scale_up_threshold
            && self.spec.worker_pool.scale_up_threshold <= 1.0)
        {
            return Err(
                "worker_pool thresholds must satisfy 0 < scale_down_threshold < scale_up_threshold <= 1"
                    .to_string(),
            );
        }
        if self.spec.governance.enforcement_points.is_empty() {
            return Err("governance.enforcement_points must not be empty".to_string());
        }
        Ok(())
    }
}

pub fn build_plan(manifest: &SystemManifest) -> RuntimePlan {
    RuntimePlan {
        steps: vec![
            format!(
                "reconcile worker pool {}..{} workers with lease timeout {}s",
                manifest.worker_pool.min_workers,
                manifest.worker_pool.max_workers,
                manifest.worker_pool.lease_timeout_secs
            ),
            format!(
                "configure memory stores: vector={}d kv={}B graph={} nodes episodic={}h",
                manifest.memory.vector_dimensions,
                manifest.memory.kv_max_value_size,
                manifest.memory.graph_max_nodes,
                manifest.memory.episodic_retention_hours
            ),
            format!(
                "install governance enforcement points: {}",
                manifest.governance.enforcement_points.join(", ")
            ),
            format!(
                "schedule self-improvement cadence every {} minutes (human approval: {})",
                manifest.improvement.cadence_minutes, manifest.improvement.requires_human_approval
            ),
        ],
    }
}

pub fn observe_runtime(runtime: &AgentRuntime) -> ObservedRuntimeState {
    let current_workers = runtime.workers.len() as u16;
    let claimed_workers = runtime
        .workers
        .values()
        .filter(|worker| matches!(worker.state, WorkerState::Claimed | WorkerState::Running))
        .count() as u16;
    let failed_workers = runtime
        .workers
        .values()
        .filter(|worker| worker.state == WorkerState::Failed)
        .count() as u16;
    let dead_letter_workers = runtime
        .workers
        .values()
        .filter(|worker| worker.state == WorkerState::DeadLetter)
        .count() as u16;

    ObservedRuntimeState {
        current_workers,
        claimed_workers,
        failed_workers,
        dead_letter_workers,
    }
}

pub fn load_runtime_state(path: &Path) -> Result<RuntimeState, String> {
    if !path.exists() {
        return Ok(RuntimeState::default());
    }

    let raw = fs::read_to_string(path)
        .map_err(|err| format!("failed to read runtime state {}: {err}", path.display()))?;
    serde_json::from_str(&raw)
        .map_err(|err| format!("failed to parse runtime state {}: {err}", path.display()))
}

pub fn save_runtime_state(path: &Path, state: &RuntimeState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| {
            format!(
                "failed to create runtime state directory {}: {err}",
                parent.display()
            )
        })?;
    }

    let raw = serde_json::to_string_pretty(state)
        .map_err(|err| format!("failed to serialize runtime state: {err}"))?;
    fs::write(path, raw)
        .map_err(|err| format!("failed to write runtime state {}: {err}", path.display()))
}

pub fn ensure_runtime_state_matches_manifest(
    envelope: &ManifestEnvelope,
    state: &RuntimeState,
) -> Result<(), String> {
    if state.metadata.manifest_name.is_empty()
        || state.metadata.manifest_name == envelope.metadata.name
    {
        return Ok(());
    }

    Err(format!(
        "runtime state belongs to manifest {} but apply requested {}",
        state.metadata.manifest_name, envelope.metadata.name
    ))
}

pub fn reconcile_manifest(
    envelope: &ManifestEnvelope,
    runtime: &AgentRuntime,
    now: u64,
    utilization_input: Option<UtilizationInput>,
) -> Result<ReconcileResult, String> {
    let (_, reconcile) = reconcile_runtime(
        envelope,
        runtime.clone(),
        now,
        true,
        None,
        utilization_input,
    )?;
    Ok(reconcile)
}

pub fn apply_manifest(
    envelope: &ManifestEnvelope,
    state: &mut RuntimeState,
    now: u64,
    persisted_state_path: &Path,
    utilization_input: Option<UtilizationInput>,
) -> Result<ReconcileResult, String> {
    ensure_runtime_state_matches_manifest(envelope, state)?;

    let (runtime, reconcile) = reconcile_runtime(
        envelope,
        state.runtime.clone(),
        now,
        false,
        Some(persisted_state_path.display().to_string()),
        utilization_input,
    )?;

    state.runtime = runtime;
    state.metadata = RuntimeStateMetadata {
        manifest_name: envelope.metadata.name.clone(),
        manifest_revision: envelope.metadata.revision,
        last_reconciled_epoch: now,
    };
    state.last_scaling = Some(reconcile.scaling.clone());

    Ok(reconcile)
}

fn reconcile_runtime(
    envelope: &ManifestEnvelope,
    mut runtime: AgentRuntime,
    now: u64,
    dry_run: bool,
    persisted_state_path: Option<String>,
    utilization_input: Option<UtilizationInput>,
) -> Result<(AgentRuntime, ReconcileResult), String> {
    envelope.validate()?;

    let observe = observe_runtime(&runtime);
    let mut diff = build_diff(envelope, &observe);
    let mut plan = build_plan(&envelope.spec);

    let stale = runtime.reap_stale(&envelope.spec.worker_pool, now);
    let scaling = runtime.scaling_status(&envelope.spec.worker_pool, utilization_input);
    let desired_workers = scaling.desired_workers;
    plan.steps.push(format!(
        "evaluate {} utilization input active={} queued={} total={} across {} schedulable workers -> {} ({})",
        scaling.source.as_str(),
        scaling.active_leases,
        scaling.queued_tasks,
        scaling.total_demand,
        scaling.schedulable_workers,
        desired_workers,
        scaling.direction.as_str()
    ));

    if !stale.is_empty() {
        diff.push(format!(
            "stale workers requiring recovery this pass: {}",
            stale.join(", ")
        ));
    }
    match scaling.direction {
        ScalingDirection::Up => diff.push(format!(
            "utilization-driven scale up: observed {:.2} with {} demand unit(s) across {} schedulable worker(s), targeting {}",
            scaling.utilization_ratio,
            scaling.total_demand,
            scaling.schedulable_workers,
            scaling.desired_workers
        )),
        ScalingDirection::Down => diff.push(format!(
            "utilization-driven scale down: observed {:.2} with {} demand unit(s) across {} schedulable worker(s), targeting {}",
            scaling.utilization_ratio,
            scaling.total_demand,
            scaling.schedulable_workers,
            scaling.desired_workers
        )),
        ScalingDirection::Hold => {}
    }

    let mut actions = Vec::new();
    if !stale.is_empty() {
        actions.push(format!(
            "reaped stale worker leases and transitioned: {}",
            stale.join(", ")
        ));
    }

    let revived = runtime.revive_failed_to(desired_workers, now);
    if !revived.is_empty() {
        actions.push(format!(
            "revived failed workers back to idle capacity: {}",
            revived.join(", ")
        ));
    }

    let seeded = runtime.seed_pool_to(desired_workers, now);
    if !seeded.is_empty() {
        actions.push(format!(
            "seeded worker pool to target {} with {}",
            desired_workers,
            seeded.join(", ")
        ));
    }

    let drained = runtime.drain_to(desired_workers);
    if !drained.drained.is_empty() {
        actions.push(format!(
            "drained worker pool down to target {} by removing {}",
            desired_workers,
            drained.drained.join(", ")
        ));
    }
    if !drained.blocked.is_empty() {
        actions.push(format!(
            "unable to drain below {} until active leases release: {}",
            desired_workers,
            drained.blocked.join(", ")
        ));
    }

    if actions.is_empty() {
        actions.push(format!(
            "runtime already satisfied target {} with no worker mutations",
            desired_workers
        ));
    }

    let observed_after = observe_runtime(&runtime);
    let verify = verify_runtime(
        envelope,
        &observed_after,
        &scaling,
        now,
        persisted_state_path.as_deref(),
        dry_run,
    );

    let apply = ApplyResult {
        dry_run,
        actions: if dry_run {
            actions
                .into_iter()
                .map(|action| format!("dry-run apply: {action}"))
                .collect()
        } else {
            actions
        },
        persisted_state_path,
    };

    let reconcile = ReconcileResult {
        api_version: envelope.api_version.clone(),
        kind: envelope.kind.clone(),
        metadata: envelope.metadata.clone(),
        observe,
        observed_after: Some(observed_after),
        scaling,
        diff,
        plan,
        apply,
        verify,
    };

    Ok((runtime, reconcile))
}

fn build_diff(envelope: &ManifestEnvelope, observe: &ObservedRuntimeState) -> Vec<String> {
    let mut diff = Vec::new();
    if observe.current_workers < envelope.spec.worker_pool.min_workers {
        diff.push(format!(
            "worker pool below minimum: observed {} desired at least {}",
            observe.current_workers, envelope.spec.worker_pool.min_workers
        ));
    }
    if observe.current_workers > envelope.spec.worker_pool.max_workers {
        diff.push(format!(
            "worker pool above maximum: observed {} desired at most {}",
            observe.current_workers, envelope.spec.worker_pool.max_workers
        ));
    }
    if observe.failed_workers > 0 {
        diff.push(format!(
            "worker pool contains {} retry-pending failed worker(s)",
            observe.failed_workers
        ));
    }
    if observe.dead_letter_workers > 0 {
        diff.push(format!(
            "dead-letter queue contains {} worker(s) that require review",
            observe.dead_letter_workers
        ));
    }
    if diff.is_empty() {
        diff.push("runtime matches bootstrap expectations at this layer".to_string());
    }
    diff
}

fn verify_runtime(
    envelope: &ManifestEnvelope,
    observed_after: &ObservedRuntimeState,
    scaling: &ScalingStatus,
    now: u64,
    persisted_state_path: Option<&str>,
    dry_run: bool,
) -> VerifyResult {
    let mut checks = Vec::new();
    let mut success = true;

    if observed_after.current_workers < envelope.spec.worker_pool.min_workers
        || observed_after.current_workers > envelope.spec.worker_pool.max_workers
    {
        success = false;
        checks.push(format!(
            "worker pool out of bounds after reconcile: observed {} allowed {}..{}",
            observed_after.current_workers,
            envelope.spec.worker_pool.min_workers,
            envelope.spec.worker_pool.max_workers
        ));
    } else {
        checks.push(format!(
            "worker pool in bounds after reconcile: {} worker(s) within {}..{}",
            observed_after.current_workers,
            envelope.spec.worker_pool.min_workers,
            envelope.spec.worker_pool.max_workers
        ));
    }

    if observed_after.claimed_workers > observed_after.current_workers {
        success = false;
        checks.push("claimed worker count exceeded total worker count".to_string());
    } else {
        checks.push(format!(
            "active lease count stable at {} worker(s)",
            observed_after.claimed_workers
        ));
    }

    checks.push(format!(
        "utilization input {} active={} queued={} total={} -> {:.2} ratio, targeted {} schedulable worker(s) at epoch {}",
        scaling.source.as_str(),
        scaling.active_leases,
        scaling.queued_tasks,
        scaling.total_demand,
        scaling.utilization_ratio,
        scaling.desired_workers,
        now
    ));

    if observed_after.dead_letter_workers > 0 {
        checks.push(format!(
            "dead-letter queue still holds {} worker(s) for operator review",
            observed_after.dead_letter_workers
        ));
    } else {
        checks.push("dead-letter queue is empty after reconcile".to_string());
    }

    if let Some(path) = persisted_state_path {
        if dry_run {
            checks.push(format!(
                "dry-run only; runtime state would persist to {path}"
            ));
        } else {
            checks.push(format!("persisted runtime state to {path}"));
        }
    }

    VerifyResult { success, checks }
}

fn compare_direction(current: u16, desired: u16) -> ScalingDirection {
    if desired > current {
        ScalingDirection::Up
    } else if desired < current {
        ScalingDirection::Down
    } else {
        ScalingDirection::Hold
    }
}

fn ceil_workers_for_ratio(total_demand: u16, threshold: f32) -> u16 {
    ((total_demand as f32 / threshold).ceil() as u16).max(1)
}

fn floor_workers_for_ratio(total_demand: u16, threshold: f32) -> u16 {
    (total_demand as f32 / threshold).floor() as u16
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample_spec() -> WorkerPoolSpec {
        WorkerPoolSpec {
            min_workers: 2,
            max_workers: 5,
            scale_up_threshold: 0.7,
            scale_down_threshold: 0.2,
            lease_timeout_secs: 30,
            heartbeat_interval_secs: 10,
            max_retries: 2,
        }
    }

    fn sample_manifest() -> SystemManifest {
        SystemManifest {
            worker_pool: sample_spec(),
            memory: MemoryConfig {
                vector_dimensions: 1536,
                kv_max_value_size: 1_048_576,
                graph_max_nodes: 1_000_000,
                episodic_retention_hours: 2_160,
            },
            governance: GovernanceConfig {
                enforcement_points: vec![
                    "dispatch".to_string(),
                    "tool_call".to_string(),
                    "memory_access".to_string(),
                ],
                require_human_consent_for_destructive: true,
            },
            improvement: ImprovementPipeline {
                cadence_minutes: 60,
                requires_human_approval: true,
            },
        }
    }

    fn sample_envelope() -> ManifestEnvelope {
        ManifestEnvelope {
            api_version: "agent-os.dev/v1alpha1".to_string(),
            kind: "AgentRuntime".to_string(),
            metadata: ManifestMetadata {
                name: "bootstrap-runtime".to_string(),
                revision: 1,
            },
            spec: sample_manifest(),
        }
    }

    #[test]
    fn runtime_seeds_pool_and_claims_workers() {
        let spec = sample_spec();
        let mut runtime = AgentRuntime::default();
        runtime.seed_pool(&spec, 100);
        assert_eq!(runtime.workers.len(), 2);
        runtime.claim("worker-000001", 120).expect("worker exists");
        assert_eq!(runtime.workers["worker-000001"].state, WorkerState::Claimed);
    }

    #[test]
    fn stale_workers_retry_then_dead_letter() {
        let spec = sample_spec();
        let mut runtime = AgentRuntime::default();
        runtime.seed_pool(&spec, 0);
        runtime.claim("worker-000001", 0).expect("worker exists");
        runtime.claim("worker-000002", 0).expect("worker exists");
        let stale = runtime.reap_stale(&spec, 100);
        assert_eq!(stale.len(), 2);
        assert_eq!(runtime.workers["worker-000001"].state, WorkerState::Failed);
        runtime.claim("worker-000001", 100).expect("worker exists");
        runtime.claim("worker-000002", 100).expect("worker exists");
        runtime.reap_stale(&spec, 200);
        runtime.claim("worker-000001", 200).expect("worker exists");
        runtime.claim("worker-000002", 200).expect("worker exists");
        runtime.reap_stale(&spec, 300);
        assert_eq!(
            runtime.workers["worker-000001"].state,
            WorkerState::DeadLetter
        );
    }

    #[test]
    fn plan_summarizes_manifest_reconcile_actions() {
        let manifest = sample_manifest();

        let plan = build_plan(&manifest);
        assert_eq!(plan.steps.len(), 4);
        assert!(plan.steps[0].contains("worker pool"));
    }

    #[test]
    fn manifest_envelope_is_validated() {
        let envelope = sample_envelope();
        envelope.validate().unwrap();
    }

    #[test]
    fn utilization_signal_scales_up_within_manifest_cap() {
        let spec = sample_spec();
        let mut runtime = AgentRuntime::default();
        runtime.seed_pool(&spec, 100);

        let scaling = runtime.scaling_status(
            &spec,
            Some(UtilizationInput {
                active_leases: 2,
                queued_tasks: 2,
            }),
        );

        assert_eq!(scaling.direction, ScalingDirection::Up);
        assert_eq!(scaling.desired_workers, 5);
        assert_eq!(scaling.source, UtilizationSource::ExternalSnapshot);
    }

    #[test]
    fn reconcile_result_projects_resulting_state() {
        let envelope = sample_envelope();
        let runtime = AgentRuntime::default();

        let reconcile = reconcile_manifest(&envelope, &runtime, 100, None).unwrap();
        assert_eq!(reconcile.api_version, "agent-os.dev/v1alpha1");
        assert_eq!(reconcile.kind, "AgentRuntime");
        assert_eq!(reconcile.observe.current_workers, 0);
        assert_eq!(reconcile.plan.steps.len(), 5);
        assert!(reconcile.apply.dry_run);
        assert_eq!(reconcile.scaling.direction, ScalingDirection::Up);
        assert_eq!(
            reconcile
                .observed_after
                .as_ref()
                .expect("projected runtime")
                .current_workers,
            2
        );
        assert!(reconcile.verify.success);
    }

    #[test]
    fn apply_manifest_persists_runtime_state_across_runs() {
        let dir = tempdir().expect("tempdir");
        let state_path = dir.path().join("runtime-state.json");
        let envelope = sample_envelope();
        let mut state = RuntimeState::default();

        let first = apply_manifest(&envelope, &mut state, 100, &state_path, None).unwrap();
        save_runtime_state(&state_path, &state).unwrap();

        assert!(!first.apply.dry_run);
        assert_eq!(state.runtime.workers.len(), 2);
        assert_eq!(state.metadata.manifest_name, "bootstrap-runtime");
        assert_eq!(state.metadata.last_reconciled_epoch, 100);
        assert_eq!(
            state
                .last_scaling
                .as_ref()
                .expect("persisted scaling")
                .desired_workers,
            2
        );

        let mut reloaded = load_runtime_state(&state_path).unwrap();
        let second = apply_manifest(&envelope, &mut reloaded, 200, &state_path, None).unwrap();
        save_runtime_state(&state_path, &reloaded).unwrap();

        assert_eq!(reloaded.runtime.workers.len(), 2);
        assert_eq!(reloaded.metadata.manifest_revision, 1);
        assert!(second.verify.success);
        assert!(
            second.apply.actions[0].contains("runtime already satisfied")
                || second
                    .apply
                    .actions
                    .iter()
                    .any(|action| action.contains("target 2"))
        );
    }

    #[test]
    fn apply_manifest_scales_up_and_down_from_utilization_signal() {
        let dir = tempdir().expect("tempdir");
        let state_path = dir.path().join("runtime-state.json");
        let envelope = sample_envelope();
        let mut state = RuntimeState::default();

        apply_manifest(&envelope, &mut state, 100, &state_path, None).unwrap();
        save_runtime_state(&state_path, &state).unwrap();

        let up = apply_manifest(
            &envelope,
            &mut state,
            200,
            &state_path,
            Some(UtilizationInput {
                active_leases: 2,
                queued_tasks: 2,
            }),
        )
        .unwrap();
        save_runtime_state(&state_path, &state).unwrap();

        assert_eq!(up.scaling.direction, ScalingDirection::Up);
        assert_eq!(up.scaling.desired_workers, 5);
        assert_eq!(state.runtime.workers.len(), 5);

        let down = apply_manifest(
            &envelope,
            &mut state,
            300,
            &state_path,
            Some(UtilizationInput {
                active_leases: 0,
                queued_tasks: 0,
            }),
        )
        .unwrap();

        assert_eq!(down.scaling.direction, ScalingDirection::Down);
        assert_eq!(down.scaling.desired_workers, 2);
        assert_eq!(state.runtime.workers.len(), 2);
        assert_eq!(
            state
                .last_scaling
                .as_ref()
                .expect("persisted scaling")
                .direction,
            ScalingDirection::Down
        );
    }

    #[test]
    fn state_file_rejects_different_manifest_name() {
        let envelope = sample_envelope();
        let state = RuntimeState {
            metadata: RuntimeStateMetadata {
                manifest_name: "other-runtime".to_string(),
                manifest_revision: 9,
                last_reconciled_epoch: 10,
            },
            last_scaling: None,
            runtime: AgentRuntime::default(),
        };

        let err = ensure_runtime_state_matches_manifest(&envelope, &state).unwrap_err();
        assert!(err.contains("other-runtime"));
    }
}
