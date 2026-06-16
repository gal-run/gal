use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct UninstallArgs {
    #[command(subcommand)]
    pub command: UninstallCommands,
}

#[derive(Subcommand)]
pub enum UninstallCommands {
    /// Uninstall GAL CLI
    Uninstall {
        /// Remove all configuration files
        #[arg(long)]
        purge: bool,
    },
}

pub async fn run(_client: ApiClient, args: UninstallArgs) -> Result<()> {
    match args.command {
        UninstallCommands::Uninstall { purge } => cmd_uninstall(purge).await,
    }
}

async fn cmd_uninstall(purge: bool) -> Result<()> {
    println!();
    println!("{}", "════════════════════════════════════════════".red());
    println!("  {}", "GAL CLI Uninstall".bold());
    println!("{}", "════════════════════════════════════════════".red());
    println!();

    let binary_path = std::env::current_exe()
        .ok()
        .map(|p| p.display().to_string())
        .unwrap_or_else(|| "gal".to_string());

    println!("  Binary: {}", binary_path.cyan());

    if purge {
        // Remove ~/.gal directory
        let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("~"));
        let gal_dir = home.join(".gal");
        if gal_dir.exists() {
            println!("  {} Removing {}...", "•".dimmed(), gal_dir.display());
            std::fs::remove_dir_all(&gal_dir)
                .map_err(|e| anyhow::anyhow!("Failed to remove {}: {}", gal_dir.display(), e))?;
            println!("  {} Configuration removed", "✓".green());
        } else {
            println!("  {} No configuration directory found", "○".dimmed());
        }
    } else {
        println!("  {} Configuration directory preserved", "○".dimmed());
        println!("  {} Use --purge to also remove configuration", "(Hint)".dimmed());
    }

    println!();
    println!("  {}", "To complete uninstallation:".bold());
    println!("    {} Remove the binary at:", "1.".cyan());
    println!("       {}", binary_path.dimmed());
    println!("    {} Remove any PATH entries for gal", "2.".cyan());
    println!();
    println!(
        "  {}",
        "Thank you for using GAL!".dimmed()
    );
    println!();

    Ok(())
}
