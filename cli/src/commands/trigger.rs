use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct TriggerArgs {
    #[command(subcommand)]
    pub command: TriggerCommands,
}

#[derive(Subcommand)]
pub enum TriggerCommands {
    /// Install a trigger
    Install {
        /// Trigger name
        name: String,
        /// Event that triggers the action
        event: String,
        /// Action to run
        action: String,
    },
    /// List installed triggers
    List {
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(_client: ApiClient, args: TriggerArgs) -> Result<()> {
    match args.command {
        TriggerCommands::Install {
            name,
            event,
            action,
        } => cmd_install(&name, &event, &action).await,
        TriggerCommands::List { json } => cmd_list(json).await,
    }
}

async fn cmd_install(name: &str, event: &str, action: &str) -> Result<()> {
    let gal_dir = dirs::home_dir()
        .ok_or_else(|| anyhow!("Cannot find home directory"))?
        .join(".gal")
        .join("triggers");

    std::fs::create_dir_all(&gal_dir)
        .map_err(|e| anyhow!("Failed to create triggers directory: {}", e))?;

    let trigger_path = gal_dir.join(format!("{}.json", name));

    if trigger_path.exists() {
        println!(
            "\n{} Trigger '{}' already exists at {}",
            "!".yellow(),
            name,
            trigger_path.display()
        );
        println!("  {}", "Remove it first to reinstall.".dimmed());
        println!();
        return Ok(());
    }

    let trigger = serde_json::json!({
        "name": name,
        "event": event,
        "action": action,
        "created_at": chrono::Utc::now().to_rfc3339(),
    });

    std::fs::write(&trigger_path, serde_json::to_string_pretty(&trigger)?)
        .map_err(|e| anyhow!("Failed to write trigger: {}", e))?;

    println!("\n{} Trigger '{}' installed!", "✓".green(), name);
    println!("  Event: {}", event);
    println!("  Action: {}", action);
    println!("  Path: {}", trigger_path.display().to_string().cyan());
    println!();
    Ok(())
}

async fn cmd_list(json: bool) -> Result<()> {
    let gal_dir = dirs::home_dir()
        .ok_or_else(|| anyhow!("Cannot find home directory"))?
        .join(".gal")
        .join("triggers");

    let triggers = if gal_dir.exists() {
        let mut list = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&gal_dir) {
            for entry in entries.flatten() {
                if entry.path().extension().map_or(false, |e| e == "json") {
                    if let Ok(content) = std::fs::read_to_string(entry.path()) {
                        if let Ok(trigger) = serde_json::from_str::<serde_json::Value>(&content) {
                            list.push(trigger);
                        }
                    }
                }
            }
        }
        list
    } else {
        vec![]
    };

    if json {
        println!("{}", serde_json::to_string_pretty(&triggers)?);
        return Ok(());
    }

    println!("\n{} Installed Triggers ({})", "Triggers:".blue().bold(), triggers.len());
    println!("{}", "─".repeat(50).dimmed());

    if triggers.is_empty() {
        println!("  No triggers installed.");
        println!("  {} Use 'gal trigger install <name> <event> <action>'", "(Hint)".dimmed());
    } else {
        for trigger in &triggers {
            let name = trigger.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
            let event = trigger.get("event").and_then(|v| v.as_str()).unwrap_or("");
            let action = trigger.get("action").and_then(|v| v.as_str()).unwrap_or("");
            println!("  {} {} → {} (on {})", "•".cyan(), name.white(), action, event);
        }
    }
    println!();

    Ok(())
}
