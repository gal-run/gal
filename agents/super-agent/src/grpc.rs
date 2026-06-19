use std::net::SocketAddr;
use std::sync::Arc;

use tonic::{Request, Response, Status};

use crate::runtime::ServiceRuntime;
use crate::{
    ComplexityBand, DagMetrics, ExecutionModel, ExecutionStage, OrchestrationPlan, RunEvent,
    RunRecord, RunStatus, Subtask, Topology, VerifierReport, VerifierVerdict,
};

pub mod proto {
    tonic::include_proto!("superagent.v1");
}

pub struct GrpcSuperAgentService {
    runtime: Arc<ServiceRuntime>,
}

impl GrpcSuperAgentService {
    pub fn new(runtime: Arc<ServiceRuntime>) -> Self {
        Self { runtime }
    }
}

pub fn grpc_service(
    runtime: Arc<ServiceRuntime>,
) -> proto::super_agent_server::SuperAgentServer<GrpcSuperAgentService> {
    proto::super_agent_server::SuperAgentServer::new(GrpcSuperAgentService::new(runtime))
}

pub async fn serve(
    addr: SocketAddr,
    runtime: Arc<ServiceRuntime>,
) -> Result<(), tonic::transport::Error> {
    tonic::transport::Server::builder()
        .add_service(grpc_service(runtime))
        .serve(addr)
        .await
}

#[tonic::async_trait]
impl proto::super_agent_server::SuperAgent for GrpcSuperAgentService {
    async fn execute(
        &self,
        request: Request<proto::ExecuteRequest>,
    ) -> Result<Response<proto::ExecuteResponse>, Status> {
        let request = request.into_inner();
        let run = self
            .runtime
            .execute(request.intent, request.require_consent)
            .map_err(Status::internal)?;
        Ok(Response::new(proto::ExecuteResponse {
            run: Some(run_record_proto(&run)),
        }))
    }

    async fn status(
        &self,
        request: Request<proto::StatusRequest>,
    ) -> Result<Response<proto::StatusResponse>, Status> {
        let run_id = request.into_inner().run_id;
        let run = self
            .runtime
            .status(&run_id)
            .map_err(Status::internal)?
            .ok_or_else(|| Status::not_found(format!("unknown run id: {run_id}")))?;
        Ok(Response::new(proto::StatusResponse {
            run: Some(run_record_proto(&run)),
        }))
    }

    async fn halt(
        &self,
        request: Request<proto::HaltRequest>,
    ) -> Result<Response<proto::HaltResponse>, Status> {
        let run_id = request.into_inner().run_id;
        let run = self
            .runtime
            .halt(&run_id)
            .map_err(Status::internal)?
            .ok_or_else(|| Status::not_found(format!("unknown run id: {run_id}")))?;
        Ok(Response::new(proto::HaltResponse {
            run: Some(run_record_proto(&run)),
        }))
    }
}

fn run_record_proto(run: &RunRecord) -> proto::RunRecord {
    proto::RunRecord {
        id: run.id.clone(),
        intent: run.intent.clone(),
        plan: Some(plan_proto(&run.plan)),
        status: run_status_proto(run.status.clone()) as i32,
        verifier: Some(verifier_proto(&run.verifier)),
        events: run.events.iter().map(run_event_proto).collect(),
    }
}

fn plan_proto(plan: &OrchestrationPlan) -> proto::OrchestrationPlan {
    proto::OrchestrationPlan {
        complexity: plan.complexity as u32,
        complexity_band: complexity_band_proto(plan.complexity_band) as i32,
        execution_model: execution_model_proto(plan.execution_model) as i32,
        domains: plan.domains.clone(),
        topology: topology_proto(plan.topology) as i32,
        max_sub_agents: plan.max_sub_agents as u32,
        hitl_required: plan.hitl_required,
        cost_bucket: plan.cost_bucket.clone(),
        metrics: Some(metrics_proto(&plan.metrics)),
        subtasks: plan.subtasks.iter().map(subtask_proto).collect(),
        execution_stages: plan.execution_stages.iter().map(stage_proto).collect(),
    }
}

fn metrics_proto(metrics: &DagMetrics) -> proto::DagMetrics {
    proto::DagMetrics {
        nodes: metrics.nodes as u32,
        edges: metrics.edges as u32,
        parallelism_width: metrics.parallelism_width as u32,
        critical_path_depth: metrics.critical_path_depth as u32,
        coupling_score: metrics.coupling_score,
    }
}

fn subtask_proto(task: &Subtask) -> proto::Subtask {
    proto::Subtask {
        id: task.id.clone(),
        title: task.title.clone(),
        detail: task.detail.clone(),
        domains: task.domains.clone(),
        depends_on: task.depends_on.clone(),
        preferred_agent: task.preferred_agent.clone(),
    }
}

fn stage_proto(stage: &ExecutionStage) -> proto::ExecutionStage {
    proto::ExecutionStage {
        stage: stage.stage as u32,
        subtask_ids: stage.subtask_ids.clone(),
    }
}

fn verifier_proto(verifier: &VerifierReport) -> proto::VerifierReport {
    proto::VerifierReport {
        verdict: verifier_verdict_proto(verifier.verdict) as i32,
        reason: verifier.reason.clone(),
        constitution_hash: verifier.constitution_hash.clone(),
    }
}

fn run_event_proto(event: &RunEvent) -> proto::RunEvent {
    proto::RunEvent {
        sequence: event.sequence,
        kind: event.kind.clone(),
        details: event.details.clone(),
        prev_hash: event.prev_hash.clone().unwrap_or_default(),
        hash: event.hash.clone(),
    }
}

fn topology_proto(topology: Topology) -> proto::Topology {
    match topology {
        Topology::Single => proto::Topology::Single,
        Topology::Parallel => proto::Topology::Parallel,
        Topology::Sequential => proto::Topology::Sequential,
        Topology::Hierarchical => proto::Topology::Hierarchical,
        Topology::Hybrid => proto::Topology::Hybrid,
    }
}

fn complexity_band_proto(band: ComplexityBand) -> proto::ComplexityBand {
    match band {
        ComplexityBand::Low => proto::ComplexityBand::Low,
        ComplexityBand::Medium => proto::ComplexityBand::Medium,
        ComplexityBand::High => proto::ComplexityBand::High,
    }
}

fn execution_model_proto(model: ExecutionModel) -> proto::ExecutionModel {
    match model {
        ExecutionModel::SingleAgentPassthrough => proto::ExecutionModel::SingleAgentPassthrough,
        ExecutionModel::MultiAgentOrchestration => proto::ExecutionModel::MultiAgentOrchestration,
    }
}

fn run_status_proto(status: RunStatus) -> proto::RunStatus {
    match status {
        RunStatus::Ready => proto::RunStatus::Ready,
        RunStatus::AwaitingConsent => proto::RunStatus::AwaitingConsent,
        RunStatus::Halted => proto::RunStatus::Halted,
    }
}

fn verifier_verdict_proto(verdict: VerifierVerdict) -> proto::VerifierVerdict {
    match verdict {
        VerifierVerdict::Allow => proto::VerifierVerdict::Allow,
        VerifierVerdict::RequireConsent => proto::VerifierVerdict::RequireConsent,
        VerifierVerdict::Deny => proto::VerifierVerdict::Deny,
    }
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use tokio::net::TcpListener;
    use tokio::sync::oneshot;
    use tokio_stream::wrappers::TcpListenerStream;

    use super::*;

    fn temp_state_path() -> std::path::PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("super-agent-grpc-{unique}.json"))
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn grpc_execute_status_and_halt_round_trip() {
        let state_path = temp_state_path();
        let runtime =
            Arc::new(ServiceRuntime::from_path(&state_path).expect("runtime should load"));
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .expect("listener should bind");
        let addr = listener.local_addr().expect("listener should have an addr");
        let (shutdown_tx, shutdown_rx) = oneshot::channel();

        let server = tonic::transport::Server::builder()
            .add_service(grpc_service(runtime.clone()))
            .serve_with_incoming_shutdown(TcpListenerStream::new(listener), async {
                let _ = shutdown_rx.await;
            });
        let server_handle = tokio::spawn(server);

        let mut client =
            proto::super_agent_client::SuperAgentClient::connect(format!("http://{addr}"))
                .await
                .expect("client should connect");

        let execute = client
            .execute(proto::ExecuteRequest {
                intent: "review, test, and deploy this service in parallel".to_string(),
                require_consent: false,
            })
            .await
            .expect("execute should succeed")
            .into_inner();
        let run = execute.run.expect("run should be returned");
        assert_eq!(run.status, proto::RunStatus::Ready as i32);

        let status = client
            .status(proto::StatusRequest {
                run_id: run.id.clone(),
            })
            .await
            .expect("status should succeed")
            .into_inner();
        assert_eq!(status.run.expect("status should include a run").id, run.id);

        let halted = client
            .halt(proto::HaltRequest { run_id: run.id })
            .await
            .expect("halt should succeed")
            .into_inner();
        assert_eq!(
            halted.run.expect("halt should include a run").status,
            proto::RunStatus::Halted as i32
        );

        let _ = shutdown_tx.send(());
        server_handle
            .await
            .expect("server task should finish")
            .expect("server should shut down cleanly");
        let _ = std::fs::remove_file(state_path);
    }
}
