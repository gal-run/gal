use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::{ApiClient, WorkflowTestRequest};

#[derive(Parser)]
pub struct TestCmdArgs {
    #[command(subcommand)]
    pub command: TestCmdCommands,
}

#[derive(Subcommand)]
pub enum TestCmdCommands {
    /// Run a test
    Run {
        /// File name to test
        file: String,
        /// Test type (unit, integration, e2e)
        #[arg(long, default_value = "unit")]
        test_type: String,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Platform
        #[arg(long)]
        platform: Option<String>,
        /// Max iterations
        #[arg(long)]
        max_iterations: Option<i64>,
    },
}

pub async fn run(client: ApiClient, args: TestCmdArgs) -> Result<()> {
    match args.command {
        TestCmdCommands::Run {
            file,
            test_type,
            org,
            platform,
            max_iterations,
        } => cmd_run(client, &file, &test_type, org, platform, max_iterations).await,
    }
}

async fn cmd_run(
    client: ApiClient,
    file: &str,
    test_type: &str,
    org: Option<String>,
    platform: Option<String>,
    max_iterations: Option<i64>,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    // Read file content
    let content = std::fs::read_to_string(file)
        .map_err(|e| anyhow!("Failed to read file '{}': {}", file, e))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Running {} test '{}'...", test_type, file));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let request = WorkflowTestRequest {
        file_name: file.to_string(),
        test_type: test_type.to_string(),
        platform,
        content,
        test_cases: None,
        max_iterations,
    };

    match client.test_workflow(&org, &request).await {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Test run complete!", "✓".green()));

            let passed = result.get("passed").and_then(|v| v.as_bool()).unwrap_or(false);
            if passed {
                println!("  {} All tests passed", "✓".green());
            } else {
                println!("  {} Tests failed", "✗".red());
            }

            if let Some(summary) = result.get("summary").and_then(|v| v.as_str()) {
                println!("  Summary: {}", summary);
            }
            if let Some(details) = result.get("details").and_then(|v| v.as_object()) {
                for (key, val) in details {
                    println!("  {}: {}", key, val);
                }
            }
            if let Some(errors) = result.get("errors").and_then(|v| v.as_array()) {
                for error in errors {
                    let msg = error.get("message").and_then(|v| v.as_str()).unwrap_or("");
                    println!("  {} Error: {}", "!".red(), msg);
                }
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Test run failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
