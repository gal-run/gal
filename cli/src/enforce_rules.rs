//! @gal/enforce-rules port — enforcement policy constants and validation.
//!
//! Ported from TypeScript:
//!   - gal-shared/packages/types/src/enforcement-mode.ts
//!
//! Constants and functions for checking tool enforcement rules
//! based on organization policy and session role.

use crate::types::{
    EnforcementCheckResult, SessionRole, WorkflowEnforcementMode,
    WorkflowEnforcementSettings,
};

use std::collections::HashMap;

// =============================================================================
// Constants — blocked tools, always-allowed tools, and bash patterns
// =============================================================================

/// Default tools blocked in 'background-only' mode for orchestrator sessions.
pub const BLOCKED_TOOLS: &[&str] = &[
    "Edit",
    "Write",
    "MultiEdit",
    "NotebookEdit",
];

/// Bash command patterns blocked in 'background-only' mode.
pub const BLOCKED_BASH_PATTERNS: &[&str] = &[
    "git push",
    "git commit",
    "git add",
    "git stash",
    "git rebase",
    "git merge",
    "git cherry-pick",
    "npm publish",
    "pnpm publish",
    "make deploy",
    "make release",
];

/// Tools that are always allowed regardless of enforcement mode.
/// These are orchestration/read-only tools.
pub const ALWAYS_ALLOWED_TOOLS: &[&str] = &[
    "Read",
    "Glob",
    "Grep",
    "LSP",
    "WebFetch",
    "WebSearch",
    "AskUserQuestion",
    "TodoWrite",
    "Task",
    "Skill",
    "EnterPlanMode",
    "ExitPlanMode",
];

/// Default block message template.
/// Supports {tool} and {org} placeholders.
pub const DEFAULT_BLOCK_MESSAGE: &str = "\
This action is blocked by your organization's enforcement policy.\n\
Your org ({org}) requires all implementation work to go through the background agent queue.\n\n\
To proceed:\n\
  1. Create a GitHub issue describing the work\n\
  2. Use `gal dispatch` or the dashboard to queue a background agent\n\
  3. Monitor and review the agent's output\n\n\
Blocked tool: {tool}";

/// Default enforcement settings when none are configured.
pub fn default_enforcement_mode_settings() -> WorkflowEnforcementSettings {
    WorkflowEnforcementSettings {
        mode: WorkflowEnforcementMode::Off,
        enabled: false,
        blocked_tools: None,
        block_message: None,
        exempt_users: None,
        updated_at: None,
        updated_by: None,
    }
}

// =============================================================================
// check_enforcement — evaluate whether a tool call should be allowed
// =============================================================================

/// Checks whether a tool call should be allowed based on enforcement settings.
///
/// # Arguments
/// * `tool_name` - The name of the tool being invoked
/// * `tool_input` - The input to the tool (used for Bash command inspection)
/// * `settings` - The org's enforcement settings
/// * `session_role` - The role of the current session
/// * `user_login` - Optional GitHub login of the current user (for exemption check)
///
/// # Returns
/// The enforcement decision
pub fn check_enforcement(
    tool_name: &str,
    tool_input: &HashMap<String, serde_json::Value>,
    settings: &WorkflowEnforcementSettings,
    session_role: SessionRole,
    user_login: Option<&str>,
) -> EnforcementCheckResult {
    // If enforcement is disabled or mode is off, always allow
    if !settings.enabled || settings.mode == WorkflowEnforcementMode::Off {
        return EnforcementCheckResult {
            allowed: true,
            mode: settings.mode,
            session_role,
            reason: None,
            is_warning: false,
        };
    }

    // Workers (background agents) are never restricted by this enforcement
    if session_role == SessionRole::Worker {
        return EnforcementCheckResult {
            allowed: true,
            mode: settings.mode,
            session_role,
            reason: None,
            is_warning: false,
        };
    }

    // Check if user is exempt
    if let Some(login) = user_login {
        if let Some(ref exempt_users) = settings.exempt_users {
            if exempt_users.iter().any(|u| u == login) {
                return EnforcementCheckResult {
                    allowed: true,
                    mode: settings.mode,
                    session_role,
                    reason: None,
                    is_warning: false,
                };
            }
        }
    }

    // Check if tool is always allowed
    if ALWAYS_ALLOWED_TOOLS.contains(&tool_name) {
        return EnforcementCheckResult {
            allowed: true,
            mode: settings.mode,
            session_role,
            reason: None,
            is_warning: false,
        };
    }

    // Determine blocked tools list
    let blocked_tools: Vec<&str> = if let Some(ref tools) = settings.blocked_tools {
        if !tools.is_empty() {
            tools.iter().map(|s| s.as_str()).collect()
        } else {
            BLOCKED_TOOLS.to_vec()
        }
    } else {
        BLOCKED_TOOLS.to_vec()
    };

    // Check direct tool blocking
    let is_blocked_tool = blocked_tools.contains(&tool_name);

    // Check Bash command patterns
    let is_blocked_bash = if tool_name == "Bash" {
        let command = tool_input
            .get("command")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        BLOCKED_BASH_PATTERNS
            .iter()
            .any(|pattern| command.contains(pattern))
    } else {
        false
    };

    let is_blocked = is_blocked_tool || is_blocked_bash;

    if !is_blocked {
        return EnforcementCheckResult {
            allowed: true,
            mode: settings.mode,
            session_role,
            reason: None,
            is_warning: false,
        };
    }

    // Build the reason message
    let org = "your organization";
    let block_message = settings
        .block_message
        .as_deref()
        .unwrap_or(DEFAULT_BLOCK_MESSAGE)
        .replace("{tool}", tool_name)
        .replace("{org}", org);

    if settings.mode == WorkflowEnforcementMode::Warn {
        return EnforcementCheckResult {
            allowed: true,
            mode: settings.mode,
            session_role,
            reason: Some(format!("WARNING: {}", block_message)),
            is_warning: true,
        };
    }

    // mode === 'background-only'
    EnforcementCheckResult {
        allowed: false,
        mode: settings.mode,
        session_role,
        reason: Some(block_message),
        is_warning: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{SessionRole, WorkflowEnforcementMode, WorkflowEnforcementSettings};

    fn make_settings(mode: WorkflowEnforcementMode, enabled: bool) -> WorkflowEnforcementSettings {
        WorkflowEnforcementSettings {
            mode,
            enabled,
            blocked_tools: None,
            block_message: None,
            exempt_users: None,
            updated_at: None,
            updated_by: None,
        }
    }

    #[test]
    fn test_disabled_always_allows() {
        let settings = make_settings(WorkflowEnforcementMode::Off, false);
        let result = check_enforcement(
            "Write",
            &HashMap::new(),
            &settings,
            SessionRole::Orchestrator,
            None,
        );
        assert!(result.allowed);
        assert!(!result.is_warning);
    }

    #[test]
    fn test_worker_not_restricted() {
        let settings = make_settings(WorkflowEnforcementMode::BackgroundOnly, true);
        let result = check_enforcement(
            "Write",
            &HashMap::new(),
            &settings,
            SessionRole::Worker,
            None,
        );
        assert!(result.allowed);
    }

    #[test]
    fn test_always_allowed_tools_pass() {
        let settings = make_settings(WorkflowEnforcementMode::BackgroundOnly, true);
        let result = check_enforcement(
            "Read",
            &HashMap::new(),
            &settings,
            SessionRole::Orchestrator,
            None,
        );
        assert!(result.allowed);
    }

    #[test]
    fn test_blocked_tool_in_background_only() {
        let settings = make_settings(WorkflowEnforcementMode::BackgroundOnly, true);
        let result = check_enforcement(
            "Write",
            &HashMap::new(),
            &settings,
            SessionRole::Orchestrator,
            None,
        );
        assert!(!result.allowed);
    }

    #[test]
    fn test_blocked_tool_in_warn_mode() {
        let settings = make_settings(WorkflowEnforcementMode::Warn, true);
        let result = check_enforcement(
            "Write",
            &HashMap::new(),
            &settings,
            SessionRole::Orchestrator,
            None,
        );
        assert!(result.allowed);
        assert!(result.is_warning);
    }

    #[test]
    fn test_exempt_user_bypasses() {
        let settings = WorkflowEnforcementSettings {
            mode: WorkflowEnforcementMode::BackgroundOnly,
            enabled: true,
            blocked_tools: None,
            block_message: None,
            exempt_users: Some(vec!["admin-user".to_string()]),
            updated_at: None,
            updated_by: None,
        };
        let result = check_enforcement(
            "Write",
            &HashMap::new(),
            &settings,
            SessionRole::Orchestrator,
            Some("admin-user"),
        );
        assert!(result.allowed);
    }

    #[test]
    fn test_blocked_bash_pattern() {
        let settings = make_settings(WorkflowEnforcementMode::BackgroundOnly, true);
        let mut input = HashMap::new();
        input.insert(
            "command".to_string(),
            serde_json::Value::String("git push origin main".to_string()),
        );
        let result = check_enforcement(
            "Bash",
            &input,
            &settings,
            SessionRole::Orchestrator,
            None,
        );
        assert!(!result.allowed);
    }

    #[test]
    fn test_unblocked_bash_allowed() {
        let settings = make_settings(WorkflowEnforcementMode::BackgroundOnly, true);
        let mut input = HashMap::new();
        input.insert(
            "command".to_string(),
            serde_json::Value::String("ls -la".to_string()),
        );
        let result = check_enforcement(
            "Bash",
            &input,
            &settings,
            SessionRole::Orchestrator,
            None,
        );
        assert!(result.allowed);
    }
}
