use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct VscodeArgs {
    #[command(subcommand)]
    pub command: VscodeCommands,
}

#[derive(Subcommand)]
pub enum VscodeCommands {
    /// Start the VS Code MCP server
    Start {
        /// Port for the MCP server
        #[arg(long, default_value = "8082")]
        port: u16,
    },
    /// Start vscode-gal MCP server over stdio (internal use)
    McpServer {
        /// Project root directory
        #[arg(long, default_value = ".")]
        project_path: String,
    },
}

pub async fn run(_client: ApiClient, args: VscodeArgs) -> Result<()> {
    match args.command {
        VscodeCommands::Start { port } => cmd_start(port).await,
        VscodeCommands::McpServer { project_path } => cmd_mcp_server(project_path).await,
    }
}

async fn cmd_mcp_server(project_path: String) -> Result<()> {
    eprintln!("[gal vscode mcp-server] Starting vscode-gal MCP server");
    eprintln!("[gal vscode mcp-server] Project path: {}", project_path);

    // Emit a JSON startup message to stdout for machine consumption
    println!(
        r#"{{"server":"vscode","status":"starting","project_path":"{}"}}"#,
        project_path
    );

    // VS Code integration - in a real impl would connect to VS Code extension
    // For now, start the terminal MCP server as a fallback
    let server = crate::mcp::terminal::TerminalMcpServer::new(None);
    crate::mcp::run_stdio_server(server).await;

    Ok(())
}

async fn cmd_start(port: u16) -> Result<()> {
    println!(
        "\n{} Starting VS Code MCP server on port {}...",
        "▶".cyan(),
        port
    );
    // VS Code integration - in a real impl would connect to VS Code extension
    println!("  {} VS Code MCP server starting...", "•".dimmed());
    println!("  {}", "This feature requires the GAL VS Code extension.".dimmed());
    println!();

    // For now, start the terminal MCP server as a fallback
    let server = crate::mcp::terminal::TerminalMcpServer::new(None);
    crate::mcp::run_stdio_server(server).await;

    Ok(())
}
