// gal-cli - GAL Command-Line Interface
//
// A Go CLI for managing org-approved AI agent configurations.
// Ported from the TypeScript GAL CLI at gal-run/gal-cli/.
package main

import (
	"fmt"
	"os"

	"github.com/gal-run/gal/services/gal-cli/internal/commands"
	"github.com/spf13/cobra"
)

func main() {
	root := &cobra.Command{
		Use:   "gal",
		Short: "GAL CLI - Manage your AI agent configurations",
		Long: `GAL CLI - Governance and Alignment Layer for AI agent configurations.

Manage CISO-approved organization-wide AI agent settings across all
major AI coding platforms (Claude Code, Cursor, Copilot, Gemini, Codex).

Environment:
  GAL_API_URL  API base URL (default: https://api.gal.run)
  GAL_TOKEN    JWT auth token

Config file: ~/.gal/config.json

Examples:
  gal status                    Show sync and auth status
  gal sync --pull               Pull approved config from API
  gal approved-config show      View org-approved configuration
  gal propose                   Propose config changes
  gal join --code <code>        Join an organization
  gal queue up                  Start agent queue worker
  gal admin list-orgs           List organizations (admin)
  gal workflow test <file>      Test a workflow config
`,
		SilenceUsage: true,
	}

	root.AddCommand(commands.NewStatusCommand())
	root.AddCommand(commands.NewSyncCommand())
	root.AddCommand(commands.NewConfigCommand())
	root.AddCommand(commands.NewProposeCommand())
	root.AddCommand(commands.NewJoinCommand())
	root.AddCommand(commands.NewSandboxCommand())
	root.AddCommand(commands.NewQueueCommand())
	root.AddCommand(commands.NewAdminCommand())
	root.AddCommand(commands.NewWorkflowCommand())

	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
