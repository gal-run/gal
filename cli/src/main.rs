mod client;
mod commands;
mod enforcement;
mod enforce_hooks;
mod enforce_srt;

// ── Ported from @gal/types and @gal/core ─────────────────────────────────
pub mod types;
pub mod core;
pub mod enforce_rules;

// ── MCP (Model Context Protocol) servers ────────────────────────────────
pub mod mcp;

// ── Enterprise Edition (commercial) ─────────────────────────────────────
// Compiled only with the `ee` feature. OSS builds
// (cargo build --no-default-features) drop this module entirely, so the
// published OSS crate contains zero commercial code. EE subcommands read
// GAL_LICENSE_KEY and self-disable when absent. License: ./src/ee/LICENSE.
#[cfg(feature = "ee")]
mod ee;

use clap::{Parser, Subcommand};
use commands::{
    admin, approve, audit, auth, browser, capability, capture, check, chrome_extension, compliance,
    config, delegation, discover, distribute, docs, enforce, feedback, fetch, flags, fleet,
    governance, hooks,
    init, install, join, maintain, memory, ops, policy, protect, propose, quality,
    queue, research, run, sandbox, scan, sdlc, security, sesh, setup, status, swarm,
    sync, template, terminal, test_cmd, trigger, uninstall, update, vision, vscode,
    work, workflow, workspace,
};
use client::ApiClient;
use tracing_subscriber::EnvFilter;

#[derive(Parser)]
#[command(name = "gal", version, about = "GAL CLI - Enterprise governance for AI coding agents")]
struct Cli {
    #[arg(long, env = "GAL_API_URL", default_value = "https://api.gal.run")]
    api_url: String,
    #[arg(long, env = "GAL_TOKEN")]
    token: Option<String>,
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    Auth(auth::AuthArgs),
    Sync(sync::SyncArgs),
    Status(status::StatusArgs),
    #[command(name = "approved-config")]
    ApprovedConfig(config::ConfigArgs),
    Propose(propose::ProposeArgs),
    Join(join::JoinArgs),
    #[command(name = "agent-session")]
    Session(sesh::SessionArgs),
    /// CapabilityManifest governance gate (agent-only, spend-only, report-only grants)
    Capability(capability::CapabilityArgs),
    /// Capture a Claude Code Stop-hook transcript and ship it to telemetry (best-effort)
    #[command(name = "capture-session")]
    Capture(capture::CaptureArgs),
    Queue(queue::QueueArgs),
    Workflow(workflow::WorkflowArgs),
    Admin(admin::AdminArgs),
    /// Delegation/HITL routing engine (who approves a decision; does it need a human)
    Delegation(delegation::DelegationArgs),
    /// Discover repos and AI configs across the organization
    Discover(discover::DiscoverArgs),
    /// Scan for AI agent configuration files
    Scan(scan::ScanArgs),
    /// Approve proposals and manage approvals
    Approve(approve::ApproveArgs),
    /// Query and manage audit logs
    Audit(audit::AuditArgs),
    /// Browser profile management
    Browser(browser::BrowserArgs),
    /// Validate configurations and check health
    Check(check::CheckArgs),
    /// Compliance reporting and auditing
    Compliance(compliance::ComplianceArgs),
    /// Distribute configurations across the organization
    Distribute(distribute::DistributeArgs),
    /// Generate documentation from configuration
    Docs(docs::DocsArgs),
    /// Install enforcement hooks (e.g., product issue gate)
    Enforce(enforce::EnforceArgs),
    /// Submit feedback to GAL
    Feedback(feedback::FeedbackArgs),
    /// Fetch configuration and logs
    Fetch(fetch::FetchArgs),
    /// Manage feature flags
    Flags(flags::FlagsArgs),
    /// Manage fleet members
    Fleet(fleet::FleetArgs),
    /// Governance policy management
    Governance(governance::GovernanceArgs),
    /// Install and manage git hooks
    Hooks(hooks::HooksArgs),
    /// Initialize GAL in a project
    #[command(name = "init")]
    Init(init::InitArgs),
    /// Install or reinstall the GAL CLI
    Install(install::InstallArgs),
    /// Maintenance operations
    Maintain(maintain::MaintainArgs),
    /// Shared memory management
    Memory(memory::MemoryArgs),
    /// Operational commands (orgs, sessions)
    Ops(ops::OpsArgs),
    /// Policy management
    Policy(policy::PolicyArgs),
    /// Protection and guard rules
    Protect(protect::ProtectArgs),
    /// Quality checks
    Quality(quality::QualityArgs),
    /// Research operations
    Research(research::ResearchArgs),
    /// Run tasks and check their status
    Run(run::RunArgs),
    /// Sandbox management and validation
    Sandbox(sandbox::SandboxArgs),
    /// SDLC lifecycle management
    Sdlc(sdlc::SdlcArgs),
    /// Security scanning
    Security(security::SecurityArgs),
    /// Setup wizard
    Setup(setup::SetupArgs),
    /// Swarm orchestration
    Swarm(swarm::SwarmArgs),
    /// Template management
    Template(template::TemplateArgs),
    /// Test framework
    Test(test_cmd::TestCmdArgs),
    /// Trigger management
    Trigger(trigger::TriggerArgs),
    /// Uninstall GAL CLI
    Uninstall(uninstall::UninstallArgs),
    /// Update GAL CLI
    Update(update::UpdateArgs),
    /// Work item management
    Work(work::WorkArgs),
    /// Workspace management
    Workspace(workspace::WorkspaceArgs),
    /// Terminal MCP server
    Terminal(terminal::TerminalArgs),
    /// Vision MCP server
    Vision(vision::VisionArgs),
    /// VS Code MCP server
    Vscode(vscode::VscodeArgs),
    /// Chrome Extension MCP server
    ChromeExtension(chrome_extension::ChromeExtensionArgs),
    /// MCP (Model Context Protocol) servers for AI coding agents
    Mcp(McpArgs),
}

#[derive(Parser)]
pub struct McpArgs {
    #[command(subcommand)]
    pub server: McpServer,
}

#[derive(Subcommand)]
pub enum McpServer {
    /// Terminal MCP server - PTY-based terminal session management
    Terminal,
    /// Vision MCP server - Image/video analysis via Gemini API
    Vision,
    /// Browser MCP server - Headless Chrome browser automation
    Browser,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env().add_directive("gal=info".parse()?))
        .with_target(false)
        // Diagnostic logs MUST go to stderr: the MCP servers (terminal/vision/browser/
        // chrome-extension/computer-use) speak JSON-RPC 2.0 over stdout, so any log line
        // on stdout corrupts the protocol stream for the connected client.
        .with_writer(std::io::stderr)
        .init();

    let cli = Cli::parse();

    // Enterprise Edition subcommands self-disable without a valid signed
    // license key (read from env/secret). Compiled only with the `ee` feature.
    #[cfg(feature = "ee")]
    {
        let _ = ee::licensed_features_enabled();
    }

    // Handle MCP subcommand (no API client needed)
    if let Commands::Mcp(mcp_args) = &cli.command {
        return run_mcp_server(mcp_args).await;
    }

    let client = ApiClient::new(&cli.api_url, cli.token)?;

    match cli.command {
        Commands::Auth(args) => auth::run(client, args).await,
        Commands::Sync(args) => sync::run(client, args).await,
        Commands::Status(args) => status::run(client, args).await,
        Commands::ApprovedConfig(args) => config::run(client, args).await,
        Commands::Propose(args) => propose::run(client, args).await,
        Commands::Join(args) => join::run(client, args).await,
        Commands::Session(args) => sesh::run(client, args).await,
        Commands::Capability(args) => capability::run(client, args).await,
        Commands::Capture(args) => capture::run(client, args).await,
        Commands::Queue(args) => queue::run(client, args).await,
        Commands::Workflow(args) => workflow::run(client, args).await,
        Commands::Admin(args) => admin::run(client, args).await,
        Commands::Delegation(args) => delegation::run(client, args).await,
        Commands::Discover(args) => discover::run(client, args).await,
        Commands::Scan(args) => scan::run(client, args).await,
        Commands::Approve(args) => approve::run(client, args).await,
        Commands::Audit(args) => audit::run(client, args).await,
        Commands::Browser(args) => browser::run(client, args).await,
        Commands::Check(args) => check::run(client, args).await,
        Commands::Compliance(args) => compliance::run(client, args).await,
        Commands::Distribute(args) => distribute::run(client, args).await,
        Commands::Docs(args) => docs::run(client, args).await,
        Commands::Enforce(args) => enforce::run(client, args).await,
        Commands::Feedback(args) => feedback::run(client, args).await,
        Commands::Fetch(args) => fetch::run(client, args).await,
        Commands::Flags(args) => flags::run(client, args).await,
        Commands::Fleet(args) => fleet::run(client, args).await,
        Commands::Governance(args) => governance::run(client, args).await,
        Commands::Hooks(args) => hooks::run(client, args).await,
        Commands::Init(args) => init::run(client, args).await,
        Commands::Install(args) => install::run(client, args).await,
        Commands::Maintain(args) => maintain::run(client, args).await,
        Commands::Memory(args) => memory::run(client, args).await,
        Commands::Ops(args) => ops::run(client, args).await,
        Commands::Policy(args) => policy::run(client, args).await,
        Commands::Protect(args) => protect::run(client, args).await,
        Commands::Quality(args) => quality::run(client, args).await,
        Commands::Research(args) => research::run(client, args).await,
        Commands::Run(args) => run::run(client, args).await,
        Commands::Sandbox(args) => sandbox::run(client, args).await,
        Commands::Sdlc(args) => sdlc::run(client, args).await,
        Commands::Security(args) => security::run(client, args).await,
        Commands::Setup(args) => setup::run(client, args).await,
        Commands::Swarm(args) => swarm::run(client, args).await,
        Commands::Template(args) => template::run(client, args).await,
        Commands::Test(args) => test_cmd::run(client, args).await,
        Commands::Trigger(args) => trigger::run(client, args).await,
        Commands::Uninstall(args) => uninstall::run(client, args).await,
        Commands::Update(args) => update::run(client, args).await,
        Commands::Work(args) => work::run(client, args).await,
        Commands::Workspace(args) => workspace::run(client, args).await,
        Commands::Terminal(args) => terminal::run(client, args).await,
        Commands::Vision(args) => vision::run(client, args).await,
        Commands::Vscode(args) => vscode::run(client, args).await,
        Commands::ChromeExtension(args) => chrome_extension::run(client, args).await,
        Commands::Mcp(_) => unreachable!(), // handled above
    }
}

/// Run an MCP server over stdio.
async fn run_mcp_server(args: &McpArgs) -> anyhow::Result<()> {
    match &args.server {
        McpServer::Terminal => {
            tracing::info!("Starting Terminal MCP server");
            let server = mcp::terminal::TerminalMcpServer::new(None);
            mcp::run_stdio_server(server).await;
        }
        McpServer::Vision => {
            tracing::info!("Starting Vision MCP server");
            let server = mcp::vision::VisionMcpServer::new(None);
            mcp::run_stdio_server(server).await;
        }
        McpServer::Browser => {
            tracing::info!("Starting Browser MCP server");
            let server = mcp::browser::BrowserMcpServer::new();
            mcp::run_stdio_server(server).await;
        }
    }
    Ok(())
}
