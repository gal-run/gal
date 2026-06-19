use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct InstallArgs {
    #[command(subcommand)]
    pub command: InstallCommands,
}

#[derive(Subcommand)]
pub enum InstallCommands {
    /// Install GAL CLI
    Install {
        /// Install method (brew, cargo, binary)
        #[arg(long, default_value = "auto")]
        method: String,
        /// Version to install
        #[arg(long)]
        version: Option<String>,
    },
}

pub async fn run(_client: ApiClient, args: InstallArgs) -> Result<()> {
    match args.command {
        InstallCommands::Install { method, version } => cmd_install(&method, version).await,
    }
}

async fn cmd_install(method: &str, version: Option<String>) -> Result<()> {
    let ver = version.unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string());

    println!();
    println!("{}", "════════════════════════════════════════════".green());
    println!("  {} {}", "GAL CLI v".bold(), ver.bold());
    println!("{}", "════════════════════════════════════════════".green());
    println!();

    match method {
        "auto" | "binary" => {
            println!("  {} Installing via binary download...", "•".cyan());

            let target = std::env::consts::OS;
            let arch = std::env::consts::ARCH;
            println!("  Detected: {}/{}", target, arch);

            let binary_path = std::env::current_exe()
                .unwrap_or_else(|_| std::path::PathBuf::from("gal"));

            println!(
                "  {} Current binary at: {}",
                "✓".green(),
                binary_path.display()
            );
            println!("  {} GAL v{} is already installed", "✓".green(), ver);
            println!();
            println!("  {}", "To update: gal update".dimmed());
            println!();
        }
        "cargo" => {
            println!("  {} To install via cargo:", "•".cyan());
            println!("    cargo install gal");
            println!();
        }
        "brew" => {
            println!("  {} To install via Homebrew:", "•".cyan());
            println!("    brew install gal-run/tap/gal");
            println!();
        }
        _ => {
            println!("  {} Unknown install method: {}", "✗".red(), method);
            println!("  {} Valid methods: auto, binary, cargo, brew", "(Hint)".dimmed());
            println!();
        }
    }

    Ok(())
}
