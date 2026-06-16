use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct TerminalArgs {
    #[command(subcommand)]
    pub command: TerminalCommands,
}

#[derive(Subcommand)]
pub enum TerminalCommands {
    /// Start the Terminal MCP server
    Start {
        /// Port for the MCP server
        #[arg(long, default_value = "8080")]
        port: u16,
    },
    /// Start terminal-gal MCP server over stdio (internal use)
    McpServer {
        /// Project root directory
        #[arg(long, default_value = ".")]
        project_path: String,
    },
}

pub async fn run(_client: ApiClient, args: TerminalArgs) -> Result<()> {
    match args.command {
        TerminalCommands::Start { port } => cmd_start(port).await,
        TerminalCommands::McpServer { project_path } => cmd_mcp_server(project_path).await,
    }
}

async fn cmd_mcp_server(project_path: String) -> Result<()> {
    eprintln!("[gal terminal mcp-server] Starting terminal-gal MCP server");
    eprintln!("[gal terminal mcp-server] Project path: {}", project_path);

    // Emit a JSON startup message to stdout for machine consumption
    println!(
        r#"{{"server":"terminal","status":"starting","project_path":"{}"}}"#,
        project_path
    );

    let server = crate::mcp::terminal::TerminalMcpServer::new(None);
    crate::mcp::run_stdio_server(server).await;

    Ok(())
}

async fn cmd_start(port: u16) -> Result<()> {
    println!(
        "\n{} Starting Terminal MCP server on port {}...",
        "▶".cyan(),
        port
    );

    let server = crate::mcp::terminal::TerminalMcpServer::new(None);
    crate::mcp::run_stdio_server(server).await;

    Ok(())
}
