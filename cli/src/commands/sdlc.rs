use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct SdlcArgs {
    #[command(subcommand)]
    pub command: SdlcCommands,
}

#[derive(Subcommand)]
pub enum SdlcCommands {
    /// Get SDLC status by ID
    Status {
        /// SDLC run ID
        id: String,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Advance to next SDLC phase
    Phase {
        /// SDLC run ID
        id: String,
        /// Phase name
        phase: String,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
    },
    /// Complete an SDLC run
    Complete {
        /// SDLC run ID
        id: String,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
    },
}

pub async fn run(client: ApiClient, args: SdlcArgs) -> Result<()> {
    match args.command {
        SdlcCommands::Status { id, json } => cmd_status(client, &id, json).await,
        SdlcCommands::Phase {
            id,
            phase,
            org,
        } => cmd_phase(client, &id, &phase, org).await,
        SdlcCommands::Complete { id, org } => cmd_complete(client, &id, org).await,
    }
}

async fn cmd_status(client: ApiClient, id: &str, json: bool) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Fetching SDLC status for {}...", id));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.get::<serde_json::Value>(&format!("/sdlc/status/{}", id)).await {
        Ok(status) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&status)?);
                return Ok(());
            }

            let current_phase = status.get("current_phase").and_then(|v| v.as_str()).unwrap_or("unknown");
            let state = status.get("state").and_then(|v| v.as_str()).unwrap_or("unknown");

            println!("\n{} SDLC Run {}", "SDLC:".blue().bold(), id);
            println!("{}", "─".repeat(50).dimmed());
            println!("  Current Phase: {}", current_phase);
            println!("  State:         {}", state);

            if let Some(phases) = status.get("phases").and_then(|v| v.as_array()) {
                println!("\n  {}", "Phases:".bold());
                for phase in phases {
                    let name = phase.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let completed = phase.get("completed").and_then(|v| v.as_bool()).unwrap_or(false);
                    let icon = if completed { "✓".green() } else { "○".dimmed() };
                    println!("    {} {}", icon, name);
                }
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to fetch SDLC status: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_phase(
    client: ApiClient,
    id: &str,
    phase: &str,
    org: Option<String>,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Advancing to phase {}...", phase));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let body = serde_json::json!({
        "org": org,
        "phase": phase,
    });

    match client
        .post::<serde_json::Value>(
            "/sdlc/phase",
            Some(&body),
        )
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Phase transition complete!", "✓".green()));

            let new_phase = result.get("current_phase").and_then(|v| v.as_str()).unwrap_or(phase);
            println!("  SDLC ID: {}", id);
            println!("  Phase:   {}", new_phase.green());
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Phase transition failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_complete(
    client: ApiClient,
    id: &str,
    org: Option<String>,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Completing SDLC run {}...", id));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let body = serde_json::json!({
        "org": org,
        "sdlc_id": id,
    });

    match client
        .post::<serde_json::Value>("/sdlc/complete", Some(&body))
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} SDLC run completed!", "✓".green()));

            let final_state = result.get("state").and_then(|v| v.as_str()).unwrap_or("completed");
            println!("  SDLC ID: {}", id);
            println!("  State:   {}", final_state.green());
            if let Some(summary) = result.get("summary").and_then(|v| v.as_str()) {
                println!("  Summary: {}", summary);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} SDLC completion failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
