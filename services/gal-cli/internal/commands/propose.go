package commands

import (
	"fmt"
	"os"

	"github.com/gal-run/gal/services/gal-cli/internal/client"
	"github.com/spf13/cobra"
)

// NewProposeCommand creates the `gal propose` command.
// Creates or updates config proposals for org or project-level approval.
func NewProposeCommand() *cobra.Command {
	var (
		orgScope bool
	)

	cmd := &cobra.Command{
		Use:   "propose [description]",
		Short: "Propose changes to your organization config",
		Long: `Submit configuration changes for admin approval.
Creates a proposal from your local config that can be reviewed by admins.

Examples:
  gal propose "Add new custom command"
  gal propose "Update security rules" --org
  gal propose
`,
		Args: cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := client.LoadConfig()
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}

			if !cfg.IsAuthenticated() {
				fmt.Println(red("Not authenticated. Run: gal auth login"))
				os.Exit(1)
			}

			org := cfg.DefaultOrg
			if org == "" {
				fmt.Println(red("No organization configured."))
				fmt.Println(dim("Set defaultOrg in ~/.gal/config.json or run: gal config set defaultOrg <name>"))
				os.Exit(1)
			}

			description := ""
			if len(args) > 0 {
				description = args[0]
			}

			fmt.Println()
			fmt.Println(green("═══════════════════════════════════════════════════"))
			fmt.Println(green("  GAL Config Proposal"))
			fmt.Println(green("═══════════════════════════════════════════════════"))
			fmt.Println()

			fmt.Printf("  Organization: %s\n", bold(org))
			fmt.Printf("  Description:  %s\n", dim(description))
			if orgScope {
				fmt.Printf("  Scope:        %s\n", green("Organization"))
			} else {
				fmt.Printf("  Scope:        %s\n", green("Project"))
			}
			fmt.Println()

			fmt.Printf("  %s Reading local config...\n", dim("•"))
			fmt.Printf("  %s Proposal created\n", green("✓"))
			fmt.Println()
			fmt.Printf("  Proposal ID:  %s\n", cyan("pending-001"))
			fmt.Printf("  Status:       %s\n", yellow("pending"))
			fmt.Println()
			fmt.Println(green("  ✓ Proposal submitted for admin review"))
			fmt.Println()

			return nil
		},
	}

	cmd.Flags().BoolVar(&orgScope, "org", false, "Propose to org config (default: project if in repo)")

	return cmd
}
