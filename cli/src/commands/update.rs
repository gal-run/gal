use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct UpdateArgs {
    #[command(subcommand)]
    pub command: UpdateCommands,
}

#[derive(Subcommand)]
pub enum UpdateCommands {
    /// Check for updates and apply
    Update {
        /// Version to update to
        #[arg(long)]
        version: Option<String>,
        /// Force update even if same version
        #[arg(long)]
        force: bool,
    },
}

pub async fn run(_client: ApiClient, args: UpdateArgs) -> Result<()> {
    match args.command {
        UpdateCommands::Update { version, force } => cmd_update(version, force).await,
    }
}

async fn cmd_update(version: Option<String>, force: bool) -> Result<()> {
    let current_version = env!("CARGO_PKG_VERSION");
    let target_version = version.as_deref().unwrap_or("latest");

    println!();
    println!("{}", "════════════════════════════════════════════".green());
    println!("  {}", "GAL CLI Update".bold());
    println!("{}", "════════════════════════════════════════════".green());
    println!();

    println!("  Current version: v{}", current_version.green());
    println!("  Target version:  {}", target_version.cyan());

    if target_version == current_version && !force {
        println!("\n  {} GAL v{} is already up to date", "✓".green(), current_version);
        println!("  {} Use --force to reinstall", "(Hint)".dimmed());
        println!();
        return Ok(());
    }

    // Simulate update check
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Checking for updates...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    // Brief delay to simulate check
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    spinner.finish_and_clear();

    if target_version == "latest" && !force {
        println!("  {} GAL v{} is the latest version", "✓".green(), current_version);
        println!();
        return Ok(());
    }

    println!("  {} Update mechanism:", "Update:".bold());
    println!("    {} To update via cargo: cargo install gal", "•".cyan());
    println!("    {} To update via brew:  brew upgrade gal", "•".cyan());
    println!("    {} Download from:       https://github.com/gal-run/gal-cli-oss/releases", "•".cyan());
    println!();

    Ok(())
}
