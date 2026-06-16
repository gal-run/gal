use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::{ApiClient, CreateSessionRequest};

#[derive(Parser)]
pub struct SessionArgs {
    #[command(subcommand)]
    pub command: SessionSubcommand,
}

#[derive(Subcommand)]
pub enum SessionSubcommand {
    /// Create a new background agent session
    Create {
        /// Session name
        #[arg(long)]
        name: Option<String>,

        /// Agent to use (claude, codex, gemini)
        #[arg(long, default_value = "claude")]
        agent: String,

        /// Initial prompt
        #[arg(long)]
        prompt: String,

        /// Project context (owner/repo)
        #[arg(long)]
        project_context: Option<String>,

        /// Session name (alias)
        #[arg(long)]
        project_ctx: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// List your sessions
    List {
        /// Filter by status
        #[arg(long)]
        status: Option<String>,

        /// Limit number of sessions
        #[arg(long, default_value = "20")]
        limit: i64,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Get session details
    Get {
        /// Session ID
        id: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Terminate a session
    Terminate {
        /// Session ID
        id: String,

        /// Reason for termination
        #[arg(long)]
        reason: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Stream session output
    Stream {
        /// Session ID
        id: String,
    },
}

pub async fn run(client: ApiClient, args: SessionArgs) -> Result<()> {
    match args.command {
        SessionSubcommand::Create {
            name,
            agent,
            prompt,
            project_context,
            project_ctx,
            json,
        } => {
            cmd_create(client, name, &agent, &prompt, project_context.or(project_ctx), json).await
        }
        SessionSubcommand::List {
            status,
            limit,
            json,
        } => cmd_list(client, status.as_deref(), limit, json).await,
        SessionSubcommand::Get { id, json } => cmd_get(client, &id, json).await,
        SessionSubcommand::Terminate {
            id,
            reason,
            json,
        } => cmd_terminate(client, &id, reason.as_deref(), json).await,
        SessionSubcommand::Stream { id } => cmd_stream(client, &id).await,
    }
}

async fn cmd_create(
    client: ApiClient,
    name: Option<String>,
    agent: &str,
    prompt: &str,
    project_context: Option<String>,
    json: bool,
) -> Result<()> {
    if !client.has_token() {
        return Err(anyhow!("Not authenticated. Run: gal auth login"));
    }

    let session_name = name.unwrap_or_else(|| "CLI Session".to_string());

    let request = CreateSessionRequest {
        name: session_name.clone(),
        org: None,
        project_context: project_context.clone(),
        branch: None,
        runner_label: None,
        agent: Some(agent.to_string()),
        initial_prompt: Some(prompt.to_string()),
        dispatch_backend: None,
        model: None,
    };

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Creating session...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.create_session(&request).await {
        Ok(session) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&session)?);
            } else {
                println!("\n{} Session created\n", "✓".green());
                println!("  ID:     {}", session.id.cyan());
                println!("  Status: {}", session.status.yellow());
                if let Some(workflow_run) = &session.workflow_run_id {
                    println!("  Run:    {}", workflow_run.to_string().dimmed());
                }
                println!("  Agent:  {}", agent);
                if let Some(ctx) = &project_context {
                    println!("  Context: {}", ctx);
                }
                println!();
            }
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to create session: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_list(
    client: ApiClient,
    status: Option<&str>,
    limit: i64,
    json: bool,
) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching sessions...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.list_sessions(status, Some(limit), None).await {
        Ok(result) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&result)?);
                return Ok(());
            }

            let sessions = result.sessions;
            if sessions.is_empty() {
                println!("\n{} No sessions found.\n", "(empty)".dimmed());
                return Ok(());
            }

            println!("\n{}", "Sessions".blue().bold());
            println!();

            for session in &sessions {
                let status_color = match session.status.as_str() {
                    "ACTIVE" => session.status.green(),
                    "FAILED" => session.status.red(),
                    "TERMINATED" => session.status.dimmed(),
                    "PENDING" | "INITIALIZING" => session.status.yellow(),
                    _ => session.status.cyan(),
                };

                println!(
                    "{} {} {}",
                    &session.id[..8.min(session.id.len())].cyan(),
                    status_color,
                    session.name.as_deref().unwrap_or("(unnamed)").white()
                );
            }

            if let Some(cursor) = &result.next_cursor {
                println!("\n{} Next cursor: {}", "  ".dimmed(), cursor.dimmed());
            }

            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to fetch sessions: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_get(
    client: ApiClient,
    id: &str,
    json: bool,
) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching session...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.get_session(id).await {
        Ok(session) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&session)?);
                return Ok(());
            }

            println!("\n{}", "Session".blue().bold());
            println!();
            println!("  ID:        {}", session.id.cyan());
            println!("  Status:    {}", session.status.white());
            if let Some(name) = &session.name {
                println!("  Name:      {}", name.white());
            }
            if let Some(ctx) = &session.project_context {
                println!("  Project:   {}", ctx.white());
            }
            if let Some(branch) = &session.branch {
                println!("  Branch:    {}", branch.white());
            }
            if let Some(agent) = &session.agent {
                println!("  Agent:     {}", agent.white());
            }
            if let Some(runner) = &session.runner_label {
                println!("  Runner:    {}", runner.white());
            }
            if let Some(run) = &session.workflow_run_id {
                println!("  Run:       {}", run.to_string().dimmed());
            }
            if let Some(error) = &session.error_message {
                println!("  Error:     {}", error.red());
            }
            if let Some(created) = &session.created_at {
                println!("  Created:   {}", created.dimmed());
            }
            if let Some(started) = &session.started_at {
                println!("  Started:   {}", started.dimmed());
            }
            if let Some(terminated) = &session.terminated_at {
                println!("  Ended:     {}", terminated.dimmed());
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to fetch session: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_terminate(
    client: ApiClient,
    id: &str,
    reason: Option<&str>,
    json: bool,
) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Terminating session...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.terminate_session(id, reason).await {
        Ok(session) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&session)?);
            } else {
                println!("\n{} Session terminated\n", "✓".green());
                println!("  ID:     {}", session.id.cyan());
                println!("  Status: {}", session.status.dimmed());
                println!();
            }
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to terminate session: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_stream(client: ApiClient, id: &str) -> Result<()> {
    println!("\nStreaming session {}...\n", id.cyan());
    println!(
        "{} Press Ctrl+C to stop.\n",
        "(Hint)".dimmed()
    );

    // Poll session status
    loop {
        match client.get_session(id).await {
            Ok(session) => {
                let ts = chrono::Utc::now()
                    .format("%H:%M:%S")
                    .to_string();
                println!("[{}] Status: {}", ts.dimmed(), session.status);

                if session.status == "TERMINATED" || session.status == "FAILED" {
                    if let Some(error) = &session.error_message {
                        println!("[{}] Error: {}", ts.dimmed(), error.red());
                    }
                    println!("\n{} Session ended.", "✓".green());
                    break;
                }
            }
            Err(e) => {
                eprintln!("[{}] Error: {}", chrono::Utc::now().format("%H:%M:%S"), e);
                break;
            }
        }

        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }

    Ok(())
}
