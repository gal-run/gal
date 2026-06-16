use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct FlagsArgs {
    #[command(subcommand)]
    pub command: FlagsCommands,
}

#[derive(Subcommand)]
pub enum FlagsCommands {
    /// List feature flags
    List {
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Check a specific flag
    Check {
        /// Flag name
        name: String,
    },
}

pub async fn run(client: ApiClient, args: FlagsArgs) -> Result<()> {
    match args.command {
        FlagsCommands::List { json } => cmd_list(client, json).await,
        FlagsCommands::Check { name } => cmd_check(client, &name).await,
    }
}

async fn cmd_list(client: ApiClient, json: bool) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching feature flags...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.get_feature_flags().await {
        Ok(flags) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&flags)?);
                return Ok(());
            }

            println!("\n{}", "Feature Flags:".blue().bold());
            println!("{}", "─".repeat(50).dimmed());

            let has_org_flags = flags.org_audience_tier_map.is_some();
            let has_plan_flags = flags.org_plan_map.is_some();

            if let Some(ref org_map) = flags.org_audience_tier_map {
                if let Some(map) = org_map.as_object() {
                    for (tier, flag_val) in map {
                        let enabled = flag_val
                            .as_bool()
                            .unwrap_or(false);
                        let icon = if enabled { "✓".green() } else { "✗".red() };
                        println!("  {} {}: {}", icon, tier, if enabled { "enabled" } else { "disabled" }.dimmed());
                    }
                }
            }

            if let Some(ref plan_map) = flags.org_plan_map {
                if let Some(map) = plan_map.as_object() {
                    for (plan, flag_val) in map {
                        let enabled = flag_val.as_bool().unwrap_or(false);
                        let icon = if enabled { "✓".green() } else { "✗".red() };
                        println!("  {} {}: {}", icon, plan, if enabled { "enabled" } else { "disabled" }.dimmed());
                    }
                }
            }

            if !has_org_flags && !has_plan_flags {
                println!("  No feature flags configured.");
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to fetch flags: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_check(client: ApiClient, name: &str) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Checking flag '{}'...", name));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.get_feature_flags().await {
        Ok(flags) => {
            spinner.finish_and_clear();

            // Look through all known flag locations
            let mut found = false;

            if let Some(ref org_map) = flags.org_audience_tier_map {
                if let Some(map) = org_map.as_object() {
                    if let Some(val) = map.get(name) {
                        let enabled = val.as_bool().unwrap_or(false);
                        println!("\n  {} Flag '{}' is {}", if enabled { "✓".green() } else { "✗".red() }, name, if enabled { "ENABLED" } else { "DISABLED" });
                        found = true;
                    }
                }
            }

            if let Some(ref plan_map) = flags.org_plan_map {
                if let Some(map) = plan_map.as_object() {
                    if let Some(val) = map.get(name) {
                        let enabled = val.as_bool().unwrap_or(false);
                        println!("\n  {} Flag '{}' is {}", if enabled { "✓".green() } else { "✗".red() }, name, if enabled { "ENABLED" } else { "DISABLED" });
                        found = true;
                    }
                }
            }

            if !found {
                println!("\n  Flag '{}' not found.", name.yellow());
                println!("  {} Use 'gal flags list' to see available flags.", "(Hint)".dimmed());
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Flag check failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
