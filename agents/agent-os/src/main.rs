use std::env;
use std::fs;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use agent_os::{
    ManifestEnvelope, UtilizationInput, apply_manifest, ensure_runtime_state_matches_manifest,
    load_runtime_state, reconcile_manifest, save_runtime_state,
};

enum Command {
    Plan,
    Apply,
}

struct Cli {
    command: Command,
    manifest_path: PathBuf,
    state_path: Option<PathBuf>,
    utilization_input: Option<UtilizationInput>,
    now: u64,
}

fn usage() -> &'static str {
    "usage: agent-os <plan|apply|reconcile> <manifest.yaml> [--state <runtime-state.json>] [--active-leases <count>] [--queued-tasks <count>] [--now <epoch-secs>]"
}

fn main() -> Result<(), String> {
    let cli = parse_args()?;
    let raw = fs::read_to_string(&cli.manifest_path).map_err(|err| {
        format!(
            "failed to read manifest {}: {err}",
            cli.manifest_path.display()
        )
    })?;
    let manifest: ManifestEnvelope =
        serde_yaml::from_str(&raw).map_err(|err| format!("failed to parse manifest: {err}"))?;

    match cli.command {
        Command::Plan => {
            let runtime = if let Some(state_path) = &cli.state_path {
                let state = load_runtime_state(state_path)?;
                ensure_runtime_state_matches_manifest(&manifest, &state)?;
                state.runtime
            } else {
                Default::default()
            };

            let reconcile =
                reconcile_manifest(&manifest, &runtime, cli.now, cli.utilization_input.clone())?;
            println!(
                "{}",
                serde_json::to_string_pretty(&reconcile).map_err(|err| err.to_string())?
            );
        }
        Command::Apply => {
            let state_path = cli
                .state_path
                .ok_or_else(|| "apply requires --state <runtime-state.json>".to_string())?;
            let mut state = load_runtime_state(&state_path)?;
            let reconcile = apply_manifest(
                &manifest,
                &mut state,
                cli.now,
                &state_path,
                cli.utilization_input,
            )?;
            save_runtime_state(&state_path, &state)?;
            println!(
                "{}",
                serde_json::to_string_pretty(&reconcile).map_err(|err| err.to_string())?
            );
        }
    }

    Ok(())
}

fn parse_args() -> Result<Cli, String> {
    let mut args = env::args().skip(1);
    let Some(cmd) = args.next() else {
        return Err(usage().to_string());
    };

    let command = match cmd.as_str() {
        "plan" => Command::Plan,
        "apply" | "reconcile" => Command::Apply,
        _ => return Err(usage().to_string()),
    };

    let Some(manifest_path) = args.next() else {
        return Err(format!("{cmd} requires a manifest path"));
    };

    let mut state_path = None;
    let mut active_leases = None;
    let mut queued_tasks = None;
    let mut now = current_epoch();

    while let Some(arg) = args.next() {
        match arg.as_str() {
            "--state" => {
                let Some(path) = args.next() else {
                    return Err("--state requires a file path".to_string());
                };
                state_path = Some(PathBuf::from(path));
            }
            "--now" => {
                let Some(value) = args.next() else {
                    return Err("--now requires an epoch-secs value".to_string());
                };
                now = value
                    .parse::<u64>()
                    .map_err(|err| format!("invalid --now value {value}: {err}"))?;
            }
            "--active-leases" => {
                let Some(value) = args.next() else {
                    return Err("--active-leases requires a worker count".to_string());
                };
                active_leases = Some(parse_u16_arg("--active-leases", &value)?);
            }
            "--queued-tasks" => {
                let Some(value) = args.next() else {
                    return Err("--queued-tasks requires a task count".to_string());
                };
                queued_tasks = Some(parse_u16_arg("--queued-tasks", &value)?);
            }
            _ => return Err(format!("unknown argument: {arg}\n{}", usage())),
        }
    }

    let utilization_input = if active_leases.is_some() || queued_tasks.is_some() {
        Some(UtilizationInput {
            active_leases: active_leases.unwrap_or_default(),
            queued_tasks: queued_tasks.unwrap_or_default(),
        })
    } else {
        None
    };

    Ok(Cli {
        command,
        manifest_path: PathBuf::from(manifest_path),
        state_path,
        utilization_input,
        now,
    })
}

fn parse_u16_arg(flag: &str, value: &str) -> Result<u16, String> {
    value
        .parse::<u16>()
        .map_err(|err| format!("invalid {flag} value {value}: {err}"))
}

fn current_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}
