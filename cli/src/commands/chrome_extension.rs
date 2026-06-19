use anyhow::Result;
use clap::{Parser, Subcommand};

use crate::client::ApiClient;

#[derive(Parser)]
pub struct ChromeExtensionArgs {
    #[command(subcommand)]
    pub command: ChromeExtensionCommands,
}

#[derive(Subcommand)]
pub enum ChromeExtensionCommands {
    /// Start chrome-extension-gal MCP server over stdio (internal use)
    McpServer {
        /// Project root directory
        #[arg(long, default_value = ".")]
        project_path: String,
    },
}

pub async fn run(_client: ApiClient, args: ChromeExtensionArgs) -> Result<()> {
    match args.command {
        ChromeExtensionCommands::McpServer { project_path } => {
            cmd_mcp_server(project_path).await
        }
    }
}

async fn cmd_mcp_server(project_path: String) -> Result<()> {
    eprintln!("[gal chrome-extension mcp-server] Starting chrome-extension-gal MCP server");
    eprintln!("[gal chrome-extension mcp-server] Project path: {}", project_path);

    // Emit a JSON startup message to stdout for machine consumption
    println!(
        r#"{{"server":"chrome-extension","status":"starting","project_path":"{}"}}"#,
        project_path
    );

    // Chrome extension integration - in a real impl would connect to Chrome extension
    // For now, start the terminal MCP server as a fallback
    let server = crate::mcp::terminal::TerminalMcpServer::new(None);
    crate::mcp::run_stdio_server(server).await;

    Ok(())
}
