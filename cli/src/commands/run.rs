use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::{ApiClient, CreateSessionRequest};

#[derive(Parser)]
pub struct RunArgs {
    #[command(subcommand)]
    pub command: RunCommands,
}

#[derive(Subcommand)]
pub enum RunCommands {
    /// Start a new task
    Start {
        /// Task name
        name: String,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Agent to use
        #[arg(long)]
        agent: Option<String>,
        /// Model to use
        #[arg(long)]
        model: Option<String>,
        /// Dispatch backend
        #[arg(long)]
        backend: Option<String>,
        /// Initial prompt
        #[arg(long)]
        prompt: Option<String>,
    },
    /// Check task status
    Status {
        /// Session ID
        id: String,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(client: ApiClient, args: RunArgs) -> Result<()> {
    match args.command {
        RunCommands::Start {
            name,
            org,
            agent,
            model,
            backend,
            prompt,
        } => cmd_start(client, &name, org, agent, model, backend, prompt).await,
        RunCommands::Status { id, json } => cmd_status(client, &id, json).await,
    }
}

async fn cmd_start(
    client: ApiClient,
    name: &str,
    org: Option<String>,
    agent: Option<String>,
    model: Option<String>,
    backend: Option<String>,
    prompt: Option<String>,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone());

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Dispatching task...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let request = CreateSessionRequest {
        name: name.to_string(),
        org,
        project_context: None,
        branch: None,
        runner_label: None,
        agent,
        initial_prompt: prompt,
        dispatch_backend: backend,
        model,
    };

    match client.create_session(&request).await {
        Ok(session) => {
            spinner.finish_with_message(format!("{} Task dispatched!", "✓".green()));

            println!("  Session ID: {}", session.id.cyan().bold());
            println!("  Name:       {}", name);
            println!("  Status:     {}", session.status.green());
            if let Some(agent_name) = &session.agent {
                println!("  Agent:      {}", agent_name);
            }
            if let Some(created) = &session.created_at {
                println!("  Created:    {}", created);
            }
            println!(
                "\n  {} Track progress: gal run status {}",
                "(Hint)".dimmed(),
                session.id
            );
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to dispatch task: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_status(client: ApiClient, id: &str, json: bool) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Fetching session {}...", id));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.get_session(id).await {
        Ok(session) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&session)?);
                return Ok(());
            }

            let status_color = match session.status.as_str() {
                "running" => session.status.green(),
                "completed" => session.status.dimmed(),
                "failed" => session.status.red(),
                "pending" => session.status.yellow(),
                _ => session.status.dimmed(),
            };

            println!("\n{} Session {}", "Session:".blue().bold(), id);
            println!("{}", "─".repeat(50).dimmed());
            println!("  Status:     {}", status_color);
            if let Some(name) = &session.name {
                println!("  Name:       {}", name);
            }
            if let Some(agent_name) = &session.agent {
                println!("  Agent:      {}", agent_name);
            }
            if let Some(created) = &session.created_at {
                println!("  Created:    {}", created);
            }
            if let Some(started) = &session.started_at {
                println!("  Started:    {}", started);
            }
            if let Some(terminated) = &session.terminated_at {
                println!("  Terminated: {}", terminated);
            }
            if let Some(error) = &session.error_message {
                println!("  Error:      {}", error.red());
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
