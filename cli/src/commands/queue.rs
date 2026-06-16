use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct QueueArgs {
    #[command(subcommand)]
    pub command: QueueSubcommand,
}

#[derive(Subcommand)]
pub enum QueueSubcommand {
    /// Show queue health/stats
    Status,
    /// List queued items
    List {
        /// Filter by status
        #[arg(long)]
        status: Option<String>,

        /// Limit number of items
        #[arg(long, default_value = "20")]
        limit: i64,
    },
    /// Add issue to queue
    Enqueue {
        /// Command to enqueue
        #[arg(long)]
        command: String,

        /// Priority (1-5)
        #[arg(long, default_value_t = 3)]
        priority: i64,

        /// Context for the item
        #[arg(long)]
        context: Option<String>,
    },
    /// Cancel a queue item
    Cancel {
        /// Item ID
        id: String,
    },
}

pub async fn run(client: ApiClient, args: QueueArgs) -> Result<()> {
    match args.command {
        QueueSubcommand::Status => cmd_status(client).await,
        QueueSubcommand::List { status, limit } => cmd_list(client, status.as_deref(), limit).await,
        QueueSubcommand::Enqueue {
            command,
            priority,
            context,
        } => cmd_enqueue(client, &command, priority, context.as_deref()).await,
        QueueSubcommand::Cancel { id } => cmd_cancel(client, &id).await,
    }
}

async fn cmd_status(client: ApiClient) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching queue stats...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.get_queue_stats().await {
        Ok(stats) => {
            spinner.finish_and_clear();

            println!("\n{}", "Queue Status".blue().bold());
            println!();

            println!("  Pending:   {}", stats.pending.to_string().yellow());
            println!("  Active:    {}", stats.active.to_string().green());
            println!("  Completed: {}", stats.completed_today.to_string().dimmed());
            println!("  Failed:    {}", stats.failed_today.to_string().red());
            println!(
                "  Consumer:  {}",
                if stats.consumer_healthy { "healthy".green() } else { "unhealthy".red() }
            );
            println!("  Depth:     {}", stats.queue_depth);
            println!("  Cost:      ${:.2} / ${:.2}", stats.daily_cost_usd, stats.daily_budget_usd);

            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to fetch queue stats: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_list(
    client: ApiClient,
    status: Option<&str>,
    limit: i64,
) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching queue items...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.list_queue(status, Some(limit)).await {
        Ok(items) => {
            spinner.finish_and_clear();

            if items.is_empty() {
                println!("\n{} No queue items found.\n", "(empty)".dimmed());
                return Ok(());
            }

            println!("\n{}", "Queue Items".blue().bold());
            println!();

            for item in &items {
                let status_color = match item.status.as_str() {
                    "pending" => item.status.yellow(),
                    "active" | "running" => item.status.green(),
                    "completed" => item.status.dimmed(),
                    "failed" => item.status.red(),
                    "cancelled" => item.status.dimmed(),
                    _ => item.status.cyan(),
                };

                println!(
                    "  {} {} [p{}] {}",
                    &item.id[..8.min(item.id.len())].cyan(),
                    status_color,
                    item.priority,
                    item.command.white()
                );
            }

            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to fetch queue items: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_enqueue(
    client: ApiClient,
    command: &str,
    priority: i64,
    context: Option<&str>,
) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Enqueuing item...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let request = crate::client::AddToQueueRequest {
        command: command.to_string(),
        priority,
        source: None,
        context: context.map(|s| s.to_string()),
        preferred_agent: None,
    };

    match client.add_to_queue(&request).await {
        Ok(response) => {
            spinner.finish_and_clear();

            println!("\n{} Item enqueued!", "✓".green());
            println!("  ID:     {}", response.work_item.id.cyan());
            println!("  Status: {}", response.work_item.status.yellow());

            if let Some(pos) = response.queue_position {
                println!("  Position: {}", pos);
            }

            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to enqueue item: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_cancel(client: ApiClient, id: &str) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Cancelling queue item...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.cancel_queue_item(id).await {
        Ok(_) => {
            spinner.finish_with_message(format!("{} Queue item {} cancelled", "✓".green(), id.cyan()));
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to cancel queue item: {}", "✗".red(), e);
        }
    }

    Ok(())
}
