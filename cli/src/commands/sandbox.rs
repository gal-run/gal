use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct SandboxArgs {
    #[command(subcommand)]
    pub command: SandboxCommands,
}

#[derive(Subcommand)]
pub enum SandboxCommands {
    /// Validate org sandbox configuration
    ValidateOrg {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
    },
    /// Test sandbox execution
    TestExec {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Command to test
        command: String,
    },
}

pub async fn run(client: ApiClient, args: SandboxArgs) -> Result<()> {
    match args.command {
        SandboxCommands::ValidateOrg { org } => cmd_validate_org(client, org).await,
        SandboxCommands::TestExec { org, command } => cmd_test_exec(client, org, &command).await,
    }
}

async fn cmd_validate_org(client: ApiClient, org: Option<String>) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Validating sandbox for {}...", org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!("/compliance-status/sandbox/validate?org={}", org))
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Sandbox validation complete!", "✓".green()));

            let valid = result.get("valid").and_then(|v| v.as_bool()).unwrap_or(false);
            let checks = result.get("checks").and_then(|v| v.as_array()).cloned().unwrap_or_default();

            if valid {
                println!("  {} Sandbox configuration is valid", "✓".green());
            } else {
                println!("  {} Sandbox configuration has issues", "✗".red());
            }

            for check in &checks {
                let name = check.get("name").and_then(|v| v.as_str()).unwrap_or("check");
                let passed = check.get("passed").and_then(|v| v.as_bool()).unwrap_or(false);
                let icon = if passed { "✓".green() } else { "✗".red() };
                let msg = check.get("message").and_then(|v| v.as_str()).unwrap_or("");
                println!("    {} {}: {}", icon, name, msg);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Sandbox validation failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_test_exec(
    client: ApiClient,
    org: Option<String>,
    command: &str,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Testing sandbox execution...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let body = serde_json::json!({
        "org": org,
        "command": command,
    });

    match client
        .post::<serde_json::Value>(
            "/compliance-status/sandbox/test",
            Some(&body),
        )
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Execution test complete!", "✓".green()));

            let success = result.get("success").and_then(|v| v.as_bool()).unwrap_or(false);
            if success {
                println!("  {} Command executed successfully", "✓".green());
            } else {
                println!("  {} Execution failed", "✗".red());
            }

            if let Some(output) = result.get("output").and_then(|v| v.as_str()) {
                println!("\n  Output:\n{}", output);
            }
            if let Some(error) = result.get("error").and_then(|v| v.as_str()) {
                println!("  Error: {}", error.red());
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Sandbox test failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
