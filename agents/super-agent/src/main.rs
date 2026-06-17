use std::env;
use std::net::SocketAddr;
use std::sync::Arc;

use super_agent::grpc;
use super_agent::runtime::ServiceRuntime;

fn usage() -> &'static str {
    "usage: super-agent execute <intent> [--require-consent] | status <run-id> | approve <run-id> | halt <run-id> | serve [addr]"
}

fn main() -> Result<(), String> {
    let mut args = env::args().skip(1);
    let Some(cmd) = args.next() else {
        return Err(usage().to_string());
    };

    match cmd.as_str() {
        "execute" => {
            let runtime = ServiceRuntime::load_default()?;
            let mut require_consent = false;
            let mut parts = Vec::new();
            for arg in args {
                if arg == "--require-consent" {
                    require_consent = true;
                } else {
                    parts.push(arg);
                }
            }
            if parts.is_empty() {
                return Err("execute requires an intent".to_string());
            }
            let run = runtime.execute(parts.join(" "), require_consent)?;
            println!(
                "{}",
                serde_json::to_string_pretty(&run).map_err(|err| err.to_string())?
            );
        }
        "status" => {
            let runtime = ServiceRuntime::load_default()?;
            let Some(run_id) = args.next() else {
                return Err("status requires a run id".to_string());
            };
            let Some(run) = runtime.status(&run_id)? else {
                return Err(format!("unknown run id: {run_id}"));
            };
            println!(
                "{}",
                serde_json::to_string_pretty(&run).map_err(|err| err.to_string())?
            );
        }
        "approve" => {
            let runtime = ServiceRuntime::load_default()?;
            let Some(run_id) = args.next() else {
                return Err("approve requires a run id".to_string());
            };
            let Some(run) = runtime.approve(&run_id)? else {
                return Err(format!("unknown run id: {run_id}"));
            };
            println!(
                "{}",
                serde_json::to_string_pretty(&run).map_err(|err| err.to_string())?
            );
        }
        "halt" => {
            let runtime = ServiceRuntime::load_default()?;
            let Some(run_id) = args.next() else {
                return Err("halt requires a run id".to_string());
            };
            let Some(run) = runtime.halt(&run_id)? else {
                return Err(format!("unknown run id: {run_id}"));
            };
            println!(
                "{}",
                serde_json::to_string_pretty(&run).map_err(|err| err.to_string())?
            );
        }
        "serve" => {
            let runtime = Arc::new(ServiceRuntime::load_default()?);
            let addr = parse_addr(args.next())?;
            eprintln!(
                "serving super-agent gRPC on {addr} with state {}",
                runtime.state_path().display()
            );
            let rt = tokio::runtime::Runtime::new().map_err(|err| err.to_string())?;
            rt.block_on(grpc::serve(addr, runtime))
                .map_err(|err| err.to_string())?;
        }
        _ => return Err(usage().to_string()),
    }

    Ok(())
}

fn parse_addr(raw: Option<String>) -> Result<SocketAddr, String> {
    raw.unwrap_or_else(|| "127.0.0.1:50051".to_string())
        .parse()
        .map_err(|err| format!("invalid listen addr: {err}"))
}
