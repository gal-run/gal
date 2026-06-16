use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::{ApiClient, WorkflowTestRequest};

#[derive(Parser)]
pub struct WorkflowArgs {
    #[command(subcommand)]
    pub command: WorkflowSubcommand,
}

#[derive(Subcommand)]
pub enum WorkflowSubcommand {
    /// Test a workflow file in sandbox
    Test {
        /// Path to workflow file
        file: String,

        /// Platform (claude, cursor, gemini, codex, windsurf)
        #[arg(long, default_value = "claude")]
        platform: String,

        /// Organization name
        #[arg(long)]
        org: Option<String>,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Batch test workflows
    TestBatch {
        /// Directory containing workflow files
        dir: String,

        /// Platform (claude, cursor, gemini, codex, windsurf)
        #[arg(long, default_value = "claude")]
        platform: String,

        /// Organization name
        #[arg(long)]
        org: Option<String>,
    },
}

pub async fn run(client: ApiClient, args: WorkflowArgs) -> Result<()> {
    match args.command {
        WorkflowSubcommand::Test {
            file,
            platform,
            org,
            json,
        } => cmd_test(client, &file, &platform, org.as_deref(), json).await,
        WorkflowSubcommand::TestBatch {
            dir,
            platform,
            org,
        } => cmd_test_batch(client, &dir, &platform, org.as_deref()).await,
    }
}

async fn cmd_test(
    client: ApiClient,
    file: &str,
    platform: &str,
    org: Option<&str>,
    json: bool,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .map(|s| s.to_string())
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow::anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Reading {}...", file));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let content = std::fs::read_to_string(file)
        .with_context(|| format!("Failed to read file: {}", file))?;

    let file_name = std::path::Path::new(file)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Auto-detect type
    let test_type = if file_name.ends_with(".md") {
        "command".to_string()
    } else {
        "hook".to_string()
    };

    spinner.set_message(format!("Testing {} in sandbox...", file_name));

    let request = WorkflowTestRequest {
        file_name: file_name.clone(),
        test_type,
        platform: Some(platform.to_string()),
        content,
        test_cases: None,
        max_iterations: Some(3),
    };

    match client.test_workflow(&org, &request).await {
        Ok(result) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&result)?);
            } else {
                println!("\n{}", "=== Test Results ===".green());
                println!();

                if let Some(name) = result.get("fileName").and_then(|v| v.as_str()) {
                    println!("  File:    {}", name.bold());
                }
                if let Some(score) = result.get("finalScore").and_then(|v| v.as_f64()) {
                    let score_color = if score >= 80.0 {
                        score.to_string().green()
                    } else if score >= 60.0 {
                        score.to_string().yellow()
                    } else {
                        score.to_string().red()
                    };
                    println!("  Score:   {}/100", score_color);
                }
                if let Some(recommendation) = result.get("recommendation").and_then(|v| v.as_str()) {
                    let rec_color = match recommendation {
                        "approve" => format!("{}", recommendation.to_uppercase()).green(),
                        "revise" => format!("{}", recommendation.to_uppercase()).yellow(),
                        _ => format!("{}", recommendation.to_uppercase()).red(),
                    };
                    println!("  Recommendation: {}", rec_color);
                }
                if let Some(error) = result.get("error").and_then(|v| v.as_str()) {
                    println!("\n  Error: {}", error.red());
                }

                println!();
            }

            // Exit code based on recommendation
            if result.get("recommendation").and_then(|v| v.as_str()) == Some("reject") {
                std::process::exit(1);
            }
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Test failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_test_batch(
    client: ApiClient,
    dir: &str,
    platform: &str,
    org: Option<&str>,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .map(|s| s.to_string())
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow::anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Scanning {} for workflow files...", dir));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let mut requests = Vec::new();

    match std::fs::read_dir(dir) {
        Ok(entries) => {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    let ext_str = ext.to_str().unwrap_or("");
                    if ext_str == "md" || ext_str == "json" || ext_str == "py" || ext_str == "js" {
                        let file_name = entry.file_name().to_string_lossy().to_string();
                        let content = std::fs::read_to_string(&path)
                            .with_context(|| format!("Failed to read {}", path.display()))?;
                        let test_type = if ext_str == "md" {
                            "command".to_string()
                        } else {
                            "hook".to_string()
                        };

                        requests.push(WorkflowTestRequest {
                            file_name,
                            test_type,
                            platform: Some(platform.to_string()),
                            content,
                            test_cases: None,
                            max_iterations: Some(3),
                        });
                    }
                }
            }
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to read directory: {}", "✗".red(), e);
            return Ok(());
        }
    }

    if requests.is_empty() {
        spinner.finish_with_message(format!("{} No workflow files found in {}", "!".yellow(), dir));
        return Ok(());
    }

    spinner.set_message(format!(
        "Testing {} workflows in sandbox...",
        requests.len()
    ));

    match client.test_workflow_batch(&org, &requests).await {
        Ok(report) => {
            spinner.finish_and_clear();

            println!("\n{}", "=== Batch Test Results ===".green());
            println!();

            if let Some(total) = report.get("totalTests").and_then(|v| v.as_i64()) {
                println!("  Total Tests:      {}", total.to_string().bold());
            }
            if let Some(passed) = report.get("passedTests").and_then(|v| v.as_i64()) {
                println!("  Passed:           {}", passed.to_string().green());
            }
            if let Some(avg) = report.get("averageScore").and_then(|v| v.as_f64()) {
                println!("  Average Score:    {}", format!("{:.1}%", avg).yellow());
            }

            // Check recommendations if available
            if let Some(summary) = report.get("summary") {
                if let Some(by_rec) = summary.get("byRecommendation") {
                    println!();
                    println!("  Recommendations:");
                    if let Some(approve) = by_rec.get("approve").and_then(|v| v.as_i64()) {
                        println!("    Approve:        {}", approve.to_string().green());
                    }
                    if let Some(revise) = by_rec.get("revise").and_then(|v| v.as_i64()) {
                        println!("    Needs Revision: {}", revise.to_string().yellow());
                    }
                    if let Some(reject) = by_rec.get("reject").and_then(|v| v.as_i64()) {
                        println!("    Reject:         {}", reject.to_string().red());
                    }
                }
            }

            println!();

            // Exit code based on results
            let passed = report.get("passedTests").and_then(|v| v.as_i64()).unwrap_or(0);
            let total = report.get("totalTests").and_then(|v| v.as_i64()).unwrap_or(0);
            if passed < total {
                std::process::exit(1);
            }
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Batch test failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
