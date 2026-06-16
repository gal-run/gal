use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpListener;
use tokio::sync::oneshot;

use crate::client::{ApiClient, LocalConfig};

const CALLBACK_PATH: &str = "/callback";

#[derive(Parser)]
pub struct AuthArgs {
    #[command(subcommand)]
    pub command: AuthSubcommand,
}

#[derive(Subcommand)]
pub enum AuthSubcommand {
    /// Authenticate with GitHub OAuth
    Login,
    /// Show current authentication status
    Status {
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Clear saved credentials
    Logout,
}

pub async fn run(client: ApiClient, args: AuthArgs) -> Result<()> {
    match args.command {
        AuthSubcommand::Login => cmd_login(client).await,
        AuthSubcommand::Status { json } => cmd_status(client, json).await,
        AuthSubcommand::Logout => cmd_logout().await,
    }
}

// ─── Login ──────────────────────────────────────────────────────────────────

async fn cmd_login(client: ApiClient) -> Result<()> {
    let api_url = client.base_url.clone();

    // Check if already logged in
    if client.has_token() {
        match client.get_current_user().await {
            Ok(user) => {
                println!(
                    "\n{} Already logged in as {}",
                    "Already logged in".yellow(),
                    user.login.bold()
                );
                println!(
                    "{} Use \"gal auth logout\" first to switch accounts.\n",
                    "(Hint)".dimmed()
                );
                return Ok(());
            }
            Err(_) => {
                // Token invalid, continue with login
            }
        }
    }

    println!(
        "\n{}",
        "═══════════════════════════════════════════════════".green()
    );
    println!("{}", "  GAL CLI - GitHub Authentication".green());
    println!(
        "{}\n",
        "═══════════════════════════════════════════════════".green()
    );

    // Bind the callback server to an OS-assigned ephemeral port (0) so the
    // callback URL is unpredictable — a blind local attacker cannot precompute
    // http://localhost:PORT/callback to inject a token.
    let addr: std::net::SocketAddr = ([127, 0, 0, 1], 0).into();
    let listener = TcpListener::bind(addr)
        .await
        .map_err(|e| anyhow!("Failed to start callback server: {}", e))?;
    let port = listener.local_addr()?.port();

    // CSRF state: a random nonce round-tripped through the OAuth provider. The
    // server echoes it back on the redirect; handle_callback rejects any token
    // whose accompanying state does not match.
    let state = uuid::Uuid::new_v4().to_string();

    let callback_url = format!("http://localhost:{}{}", port, CALLBACK_PATH);
    let encoded_redirect = urlencoding(&callback_url);
    let auth_url = format!(
        "{}/auth/github?redirect={}&source=cli&force_select=true&state={}",
        api_url, encoded_redirect, state
    );

    let (tx, rx) = oneshot::channel::<String>();

    println!("Opening browser for GitHub authentication...\n");
    println!(
        "If the browser doesn't open, visit:\n  {}\n",
        auth_url.blue()
    );

    // Open browser (best effort)
    open_browser(&auth_url);

    println!(
        "{}",
        "Waiting for authentication (check your browser)...".dimmed()
    );

    // Accept one connection
    tokio::select! {
        result = handle_callback(&listener, tx, &state) => {
            if let Err(e) = result {
                return Err(anyhow!("Callback server error: {}", e));
            }
        }
        _ = tokio::time::sleep(std::time::Duration::from_secs(120)) => {
            return Err(anyhow!("Authentication timed out. Please try again."));
        }
    }

    let token = rx.await.map_err(|_| anyhow!("Failed to receive auth token"))?;

    if token.starts_with("ERROR:") {
        return Err(anyhow!(
            "Authentication failed: {}",
            &token[6..]
        ));
    }

    println!("{}", "Authentication successful!".green().bold());

    // Save token to config
    let mut config = LocalConfig::load()?;

    // Fetch user info
    let mut authed_client = client.clone();
    authed_client.set_token(token.clone());
    let user = authed_client.get_current_user().await?;

    config.auth_token = Some(token);
    config.default_org = user
        .organizations
        .as_ref()
        .and_then(|orgs| orgs.first().cloned());
    config.save()?;

    println!("\n{}", "Logged in as:".green());
    println!("  User: {}", user.login.bold());
    if let Some(name) = &user.name {
        println!("  Name: {}", name);
    }
    if let Some(email) = &user.email {
        println!("  Email: {}", email);
    }
    if let Some(orgs) = &user.organizations {
        if !orgs.is_empty() {
            println!("  Organizations: {}", orgs.join(", "));
            if let Some(default) = &config.default_org {
                println!("  Default org: {}", default.bold());
            }
        }
    }

    println!(
        "\n{}",
        "You're fully set up. GAL runs automatically from here.".dimmed()
    );
    println!();

    Ok(())
}

async fn handle_callback(
    listener: &TcpListener,
    tx: oneshot::Sender<String>,
    expected_state: &str,
) -> Result<()> {
    let (mut stream, _) = listener.accept().await?;
    let mut reader = BufReader::new(&mut stream);
    let mut request_line = String::new();
    reader.read_line(&mut request_line).await?;

    // Read headers
    let mut headers = String::new();
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).await?;
        if line.trim().is_empty() {
            break;
        }
        headers.push_str(&line);
    }

    let tx = tokio::sync::Mutex::new(Some(tx));

    // Parse the request path
    let parts: Vec<&str> = request_line.split_whitespace().collect();
    let path = if parts.len() >= 2 { parts[1] } else { "/" };

    if path.starts_with(CALLBACK_PATH) {
        // Parse query params from path
        let query = path.split('?').nth(1).unwrap_or("");
        let params: std::collections::HashMap<String, String> =
            url::form_urlencoded::parse(query.as_bytes()).into_owned().collect();

        // CSRF check (FAIL-CLOSED): accept a token ONLY when the callback carries
        // a state nonce equal to the one we generated. A missing or mismatched
        // state is rejected. NOTE: this REQUIRES the OAuth server (/auth/github)
        // to echo `state` back on the redirect to localhost; until that server
        // change ships, login is intentionally rejected rather than accepting a
        // CSRF-forgeable token. (Tracked: server-side state echo + e2e test.)
        let state_ok = params.get("state").map(|s| s == expected_state).unwrap_or(false);

        if !state_ok {
            if let Some(tx_guard) = tx.lock().await.take() {
                let _ = tx_guard.send("ERROR:state mismatch (possible CSRF) — login rejected".to_string());
            }
            let html = r#"<html><body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #dc2626;">Authentication Rejected</h1>
                <p>State mismatch — possible CSRF. No token was accepted.</p>
                <p>You can close this window.</p>
            </body></html>"#;
            let response = format!(
                "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                html.len(),
                html
            );
            stream.write_all(response.as_bytes()).await?;
        } else if let Some(token_val) = params.get("token") {
            if let Some(tx_guard) = tx.lock().await.take() {
                let _ = tx_guard.send(token_val.clone());
            }
            let html = r#"<html><body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #00FF41;">Authentication Successful</h1>
                <p>You're now logged in to GAL CLI!</p>
                <p>You can close this window and return to the terminal.</p>
            </body></html>"#;
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                html.len(),
                html
            );
            stream.write_all(response.as_bytes()).await?;
        } else if let Some(error) = params.get("error") {
            if let Some(tx_guard) = tx.lock().await.take() {
                let _ = tx_guard.send(format!("ERROR:{}", error));
            }
            // HTML-escape the provider-supplied error before reflecting it (XSS).
            let html = format!(
                r#"<html><body style="font-family: system-ui; padding: 40px; text-align: center;">
                    <h1 style="color: #dc2626;">Authentication Failed</h1>
                    <p>{}</p>
                    <p>You can close this window.</p>
                </body></html>"#,
                html_escape(error)
            );
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                html.len(),
                html
            );
            stream.write_all(response.as_bytes()).await?;
        } else {
            let body = "Missing token";
            let response = format!(
                "HTTP/1.1 400 Bad Request\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
            stream.write_all(response.as_bytes()).await?;
        }
    } else {
        let body = "Not found";
        let response = format!(
            "HTTP/1.1 404 Not Found\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        stream.write_all(response.as_bytes()).await?;
    }

    Ok(())
}

// ─── Status ─────────────────────────────────────────────────────────────────

async fn cmd_status(client: ApiClient, json: bool) -> Result<()> {
    let config = LocalConfig::load()?;

    if json {
        let status = if config.auth_token.is_some() {
            match client.get_current_user().await {
                Ok(user) => serde_json::json!({
                    "authenticated": true,
                    "expired": false,
                    "user": user.login,
                    "email": user.email,
                    "name": user.name,
                    "organizations": user.organizations.unwrap_or_default(),
                    "defaultOrg": config.default_org,
                    "apiUrl": config.api_url,
                }),
                Err(_) => serde_json::json!({
                    "authenticated": false,
                    "expired": true,
                    "user": null,
                    "organizations": [],
                }),
            }
        } else {
            serde_json::json!({
                "authenticated": false,
                "expired": false,
                "user": null,
                "organizations": [],
            })
        };
        println!("{}", serde_json::to_string_pretty(&status)?);
        return Ok(());
    }

    if config.auth_token.is_none() {
        println!("\n{}", "Not authenticated.".yellow());
        println!("{}", "Run: gal auth login\n".dimmed());
        return Ok(());
    }

    print!("{} ", "Checking authentication...".dimmed());

    match client.get_current_user().await {
        Ok(user) => {
            println!("{}", "✓".green());
            println!("\n{}", "Authenticated".green());
            println!("  User: {}", user.login.bold());
            if let Some(name) = &user.name {
                println!("  Name: {}", name);
            }
            if let Some(email) = &user.email {
                println!("  Email: {}", email);
            }
            if let Some(orgs) = &user.organizations {
                if !orgs.is_empty() {
                    println!("  Organizations: {}", orgs.join(", "));
                }
            }
            if let Some(default) = &config.default_org {
                println!("  Default org: {}", default.bold());
            }
            println!(
                "  API: {}",
                config.api_url.as_deref().unwrap_or("(not set)")
            );

            // Check health
            match client.test_connection().await {
                Ok(true) => println!("  {} API reachable", "✓".green()),
                _ => println!("  {} API not reachable", "✗".red()),
            }

            println!();
        }
        Err(e) => {
            println!("{}", "✗".red());
            println!("\n{}", "Token invalid or expired".red());
            println!("  {}", e);
            println!("{}", "Run: gal auth login\n".dimmed());
        }
    }

    Ok(())
}

// ─── Logout ─────────────────────────────────────────────────────────────────

async fn cmd_logout() -> Result<()> {
    let config = LocalConfig::load()?;

    if config.auth_token.is_none() {
        println!("\n{}", "Not logged in.\n".yellow());
        return Ok(());
    }

    // Clear config
    let empty = LocalConfig {
        auth_token: None,
        api_url: config.api_url,
        default_org: None,
        api_key: None,
    };
    empty.save()?;

    println!("\n{}", "✓ Logged out successfully.\n".green());
    Ok(())
}

// ─── Helpers ────────────────────────────────────────────────────────────────

fn open_browser(url: &str) {
    let platform = std::env::consts::OS;
    let result = match platform {
        "macos" => std::process::Command::new("open").arg(url).spawn(),
        "windows" => std::process::Command::new("cmd")
            .args(["/c", "start", "", url])
            .spawn(),
        _ => std::process::Command::new("xdg-open").arg(url).spawn(),
    };

    if let Err(e) = result {
        eprintln!(
            "{} Could not open browser: {}",
            "Could not open browser".yellow(),
            e
        );
    }
}

fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

/// Minimal HTML escaping for text reflected into the callback page.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#x27;")
}

#[cfg(test)]
mod tests {
    use super::html_escape;

    #[test]
    fn escapes_html_metacharacters() {
        let out = html_escape("<script>alert('x')</script>&\"");
        assert!(!out.contains('<'));
        assert!(!out.contains('>'));
        assert!(out.contains("&lt;script&gt;"));
        assert!(out.contains("&amp;"));
        assert!(out.contains("&quot;"));
        assert!(out.contains("&#x27;"));
    }
}
