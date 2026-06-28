//! Regression test for the `development` gate (see FEATURES.md).
//!
//! In-development CLI commands (`update`, `vscode`, `chrome-extension`) are
//! stubs — `update` fakes an update check, `vscode`/`chrome-extension` fall
//! back to a terminal MCP server while claiming to be IDE/browser integrations.
//! Until they really work they must be **neither advertised nor callable**
//! unless `GAL_DEVELOPMENT=1`, so the shipped surface stays honest.
//!
//! These cases invoke the built `gal` binary. The ungated commands error
//! immediately at dispatch (they never start the blocking stdio server), so the
//! test stays fast; we deliberately do NOT run `vscode`/`chrome-extension`
//! *with* the flag, since those would start a server and block.

use std::process::Command;

const BIN: &str = env!("CARGO_BIN_EXE_gal");

/// Without the flag, an in-development command is rejected as unavailable.
#[test]
fn update_rejected_when_flag_unset() {
    let out = Command::new(BIN)
        .args(["update", "update"])
        .env_remove("GAL_DEVELOPMENT")
        .output()
        .expect("run gal");
    assert!(
        !out.status.success(),
        "`gal update` must fail without GAL_DEVELOPMENT; exit was success"
    );
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(
        stderr.contains("in-development"),
        "expected an in-development gate message, got: {stderr}"
    );
}

/// With GAL_DEVELOPMENT=1 the gate opens and the command runs (the `update`
/// stub prints and returns Ok, so it exits cleanly).
#[test]
fn update_runs_when_flag_set() {
    let out = Command::new(BIN)
        .args(["update", "update"])
        .env("GAL_DEVELOPMENT", "1")
        .output()
        .expect("run gal");
    assert!(
        out.status.success(),
        "`gal update` must run with GAL_DEVELOPMENT=1; stderr: {}",
        String::from_utf8_lossy(&out.stderr)
    );
}

/// `vscode` and `chrome-extension` are gated the same way.
#[test]
fn ide_integrations_rejected_when_flag_unset() {
    for cmd in [
        vec!["vscode", "start"],
        vec!["chrome-extension", "mcp-server"],
    ] {
        let out = Command::new(BIN)
            .args(&cmd)
            .env_remove("GAL_DEVELOPMENT")
            .output()
            .expect("run gal");
        assert!(
            !out.status.success(),
            "`gal {}` must fail without GAL_DEVELOPMENT",
            cmd.join(" ")
        );
        let stderr = String::from_utf8_lossy(&out.stderr);
        assert!(
            stderr.contains("in-development"),
            "expected gate message for `gal {}`, got: {stderr}",
            cmd.join(" ")
        );
    }
}

/// The in-development commands must not be advertised in top-level `--help`.
#[test]
fn development_commands_hidden_from_help() {
    let out = Command::new(BIN)
        .arg("--help")
        .env_remove("GAL_DEVELOPMENT")
        .output()
        .expect("run gal --help");
    let help = String::from_utf8_lossy(&out.stdout);
    for doc in [
        "Update GAL CLI",
        "VS Code MCP server",
        "Chrome Extension MCP server",
    ] {
        assert!(
            !help.contains(doc),
            "in-development command `{doc}` must be hidden from --help"
        );
    }
}
