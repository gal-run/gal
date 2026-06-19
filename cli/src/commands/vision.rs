use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct VisionArgs {
    #[command(subcommand)]
    pub command: VisionCommands,
}

#[derive(Subcommand)]
pub enum VisionCommands {
    /// Start the Vision MCP server
    Start {
        /// Port for the MCP server
        #[arg(long, default_value = "8081")]
        port: u16,
    },
}

pub async fn run(_client: ApiClient, args: VisionArgs) -> Result<()> {
    match args.command {
        VisionCommands::Start { port } => cmd_start(port).await,
    }
}

async fn cmd_start(port: u16) -> Result<()> {
    println!(
        "\n{} Starting Vision MCP server on port {}...",
        "▶".cyan(),
        port
    );

    let server = crate::mcp::vision::VisionMcpServer::new(None);
    crate::mcp::run_stdio_server(server).await;

    Ok(())
}
