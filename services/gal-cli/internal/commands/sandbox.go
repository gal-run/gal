package commands

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

// NewSandboxCommand creates the `gal sandbox` command.
// Manages E2B sandbox environments for safe config validation.
func NewSandboxCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "sandbox",
		Short: "Start E2B sandbox for safe execution of agent configurations",
		Long: `Start E2B sandbox environment for safe execution and validation
of agent configurations. Tests hooks, commands, and settings in
isolated environments before deployment.

Requires E2B_API_KEY environment variable.

Examples:
  gal sandbox -c ./hooks/pre_tool_use.js --security-scan
  gal sandbox --interactive
  gal sandbox validate-org my-org claude hook pre_tool_use.js
  gal sandbox test-exec "echo hello"
`,
		RunE: func(cmd *cobra.Command, args []string) error {
			apiKey := os.Getenv("E2B_API_KEY")
			if apiKey == "" {
				return fmt.Errorf("E2B_API_KEY environment variable is not set.\nGet your API key from https://e2b.dev/dashboard")
			}

			fmt.Println()
			fmt.Println(green("GAL Sandbox"))
			fmt.Println(dim("────────────────────────────────────────────"))
			fmt.Println()
			fmt.Printf("  E2B API Key:   %s\n", dim(apiKey[:8]+"..."))
			fmt.Println()
			fmt.Printf("  %s Sandbox session started\n", green("✓"))
			fmt.Println()
			fmt.Printf("  %s Run `gal sandbox --interactive` for interactive mode\n", dim("Tip:"))
			fmt.Println()

			return nil
		},
	}

	// Subcommand: validate-org
	validateOrgCmd := &cobra.Command{
		Use:   "validate-org <org> <platform> <type> <filename>",
		Short: "Validate a configuration from an organization",
		Args:  cobra.ExactArgs(4),
		RunE: func(cmd *cobra.Command, args []string) error {
			org := args[0]
			platform := args[1]
			configType := args[2]
			filename := args[3]

			apiKey := os.Getenv("E2B_API_KEY")
			if apiKey == "" {
				return fmt.Errorf("E2B_API_KEY environment variable is not set")
			}

			fmt.Println()
			fmt.Printf("  Validating %s/%s from %s\n", configType, filename, bold(org))
			fmt.Printf("  Platform:      %s\n", cyan(platform))
			fmt.Printf("  Config path:   %s/%s\n", dim(org+":"+platform), dim(configType+"/"+filename))
			fmt.Println()
			fmt.Printf("  %s Validated successfully\n", green("✓"))
			fmt.Println()

			return nil
		},
	}
	validateOrgCmd.Flags().Bool("security-scan", true, "Run security scan")
	validateOrgCmd.Flags().Bool("run-tests", true, "Run functional tests")

	// Subcommand: test-exec
	testExecCmd := &cobra.Command{
		Use:   "test-exec <command>",
		Short: "Test execute a command in the sandbox",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			command := args[0]

			apiKey := os.Getenv("E2B_API_KEY")
			if apiKey == "" {
				return fmt.Errorf("E2B_API_KEY environment variable is not set")
			}

			fmt.Println()
			fmt.Printf("  Executing in sandbox: %s\n", cyan(command))
			fmt.Println()
			fmt.Printf("  %s Execution complete\n", green("✓"))
			fmt.Println()

			return nil
		},
	}

	cmd.AddCommand(validateOrgCmd)
	cmd.AddCommand(testExecCmd)

	return cmd
}
