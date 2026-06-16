use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct FeedbackArgs {
    #[command(subcommand)]
    pub command: FeedbackCommands,
}

#[derive(Subcommand)]
pub enum FeedbackCommands {
    /// Submit feedback
    Submit {
        /// Feedback message
        message: String,
        /// Feedback category (bug, feature, general)
        #[arg(long, default_value = "general")]
        category: String,
        /// Include system info
        #[arg(long)]
        include_info: bool,
    },
}

pub async fn run(client: ApiClient, args: FeedbackArgs) -> Result<()> {
    match args.command {
        FeedbackCommands::Submit {
            message,
            category,
            include_info,
        } => cmd_submit(client, &message, &category, include_info).await,
    }
}

async fn cmd_submit(
    client: ApiClient,
    message: &str,
    category: &str,
    include_info: bool,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;

    let valid_categories = ["bug", "feature", "general", "improvement"];
    if !valid_categories.contains(&category) {
        return Err(anyhow!(
            "Invalid category '{}'. Valid: {}",
            category,
            valid_categories.join(", ")
        ));
    }

    let mut body = serde_json::json!({
        "message": message,
        "category": category,
        "version": env!("CARGO_PKG_VERSION"),
    });

    if include_info {
        body["os"] = serde_json::json!(std::env::consts::OS);
        body["arch"] = serde_json::json!(std::env::consts::ARCH);
        body["default_org"] = serde_json::json!(config.default_org);
    }

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Submitting feedback...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .post::<serde_json::Value>("/telemetry/feedback", Some(&body))
        .await
    {
        Ok(_) => {
            spinner.finish_with_message(format!("{} Feedback submitted!", "✓".green()));
            println!("  Category: {}", category.yellow());
            println!("  Message: {}", message);
            println!("  {}", "Thank you for helping improve GAL!".dimmed());
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Feedback submission failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
