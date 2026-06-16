use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct SwarmArgs {
    #[command(subcommand)]
    pub command: SwarmCommands,
}

#[derive(Subcommand)]
pub enum SwarmCommands {
    /// Run a swarm operation
    Run {
        /// Swarm name
        name: String,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Agent count
        #[arg(long, default_value = "3")]
        agents: u64,
        /// Task description
        #[arg(long)]
        task: Option<String>,
    },
    /// Check swarm status
    Status {
        /// Swarm run ID
        id: String,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// List available swarm plans/catalog
    Plan,
}

pub async fn run(client: ApiClient, args: SwarmArgs) -> Result<()> {
    match args.command {
        SwarmCommands::Run {
            name,
            org,
            agents,
            task,
        } => cmd_run(client, &name, org, agents, task).await,
        SwarmCommands::Status { id, json } => cmd_status(client, &id, json).await,
        SwarmCommands::Plan => cmd_plan(client).await,
    }
}

async fn cmd_run(
    client: ApiClient,
    name: &str,
    org: Option<String>,
    agents: u64,
    task: Option<String>,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Starting swarm...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let body = serde_json::json!({
        "org": org,
        "name": name,
        "agent_count": agents,
        "task": task,
    });

    match client
        .post::<serde_json::Value>("/swarm/run", Some(&body))
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Swarm started!", "✓".green()));

            if let Some(id) = result.get("id").and_then(|v| v.as_str()) {
                println!("  Swarm ID:  {}", id.cyan().bold());
            }
            println!("  Name:      {}", name);
            println!("  Agents:    {}", agents);
            println!("  Model:     {}", "swarm");
            println!(
                "\n  {} Track status: gal swarm status <id>",
                "(Hint)".dimmed()
            );
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Swarm start failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_status(client: ApiClient, id: &str, json: bool) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Fetching swarm status for {}...", id));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!("/swarm/run/{}", id))
        .await
    {
        Ok(status) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&status)?);
                return Ok(());
            }

            let state = status.get("state").and_then(|v| v.as_str()).unwrap_or("unknown");
            let state_color = match state {
                "running" => state.green(),
                "completed" => state.dimmed(),
                "failed" => state.red(),
                "pending" => state.yellow(),
                _ => state.dimmed(),
            };

            println!("\n{} Swarm Run {}", "Swarm:".blue().bold(), id);
            println!("{}", "─".repeat(50).dimmed());
            println!("  State:      {}", state_color);

            if let Some(agents) = status.get("agents").and_then(|v| v.as_array()) {
                println!("  Agents:     {}", agents.len());
                for agent in agents {
                    let name = agent.get("name").and_then(|v| v.as_str()).unwrap_or("agent");
                    let agent_status = agent.get("status").and_then(|v| v.as_str()).unwrap_or("?");
                    let icon = match agent_status {
                        "running" => "▶".green(),
                        "completed" => "✓".green(),
                        "failed" => "✗".red(),
                        _ => "○".dimmed(),
                    };
                    println!("    {} {} ({})", icon, name, agent_status);
                }
            }

            if let Some(result) = status.get("result").and_then(|v| v.as_str()) {
                println!("  Result:     {}", result);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to fetch swarm status: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_plan(client: ApiClient) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching swarm catalog...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.get::<serde_json::Value>("/swarm/catalog").await {
        Ok(catalog) => {
            spinner.finish_and_clear();

            let empty = Vec::new();
            let plans = catalog.as_array().unwrap_or(&empty);
            println!(
                "\n{} Swarm Plans & Catalog ({})",
                "Swarm Catalog:".blue().bold(),
                plans.len()
            );
            println!("{}", "─".repeat(60).dimmed());

            for plan in plans {
                let name = plan.get("name").and_then(|v| v.as_str()).unwrap_or("unnamed");
                let desc = plan.get("description").and_then(|v| v.as_str()).unwrap_or("");
                let agents = plan.get("default_agents").and_then(|v| v.as_u64()).unwrap_or(1);

                println!("  {} {} ({} agents)", "•".cyan(), name.white(), agents);
                println!("    {}", desc.dimmed());
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to fetch swarm catalog: {}", "✗".red(), e);
        }
    }

    Ok(())
}
