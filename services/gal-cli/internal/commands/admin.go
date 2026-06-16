package commands

import (
	"fmt"
	"os"

	"github.com/gal-run/gal/services/gal-cli/internal/client"
	"github.com/spf13/cobra"
)

// NewAdminCommand creates the `gal admin` command.
// Administrative operations for GAL platform management.
func NewAdminCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "admin",
		Short: "Administrative commands (requires admin access)",
		Long: `Administrative operations for GAL platform management.
Requires admin access to perform organization-level operations
and plan management.

Subcommands:
  grant-plan <org> <plan>    Grant a plan to an organization (bypasses Stripe)
  list-orgs                  List all organizations with their plans
`,
	}

	// ── grant-plan ─────────────────────────────────────────────────────────
	grantCmd := &cobra.Command{
		Use:   "grant-plan <org> <plan>",
		Short: "Grant a plan to an organization (bypasses Stripe)",
		Args:  cobra.ExactArgs(2),
		Long: `Grant a plan tier to an organization.

Plans: free, convenience, enforcement, enterprise

Examples:
  gal admin grant-plan MyOrg enterprise
  gal admin grant-plan MyOrg free --reason "Trial"
`,
		RunE: func(cmd *cobra.Command, args []string) error {
			org := args[0]
			plan := args[1]

			validPlans := map[string]bool{"free": true, "convenience": true, "enforcement": true, "enterprise": true}
			if !validPlans[plan] {
				return fmt.Errorf("plan must be one of: free, convenience, enforcement, enterprise")
			}

			reason, _ := cmd.Flags().GetString("reason")

			cfg, err := client.LoadConfig()
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}
			if !cfg.IsAuthenticated() {
				fmt.Println(red("Not authenticated. Need admin API key."))
				os.Exit(1)
			}

			c, err := client.NewFromConfig()
			if err != nil {
				return err
			}

			result, err := c.GrantPlan(org, plan, reason)
			if err != nil {
				return fmt.Errorf("grant plan: %w", err)
			}

			fmt.Println()
			fmt.Println(green("Plan granted successfully!"))
			fmt.Println()
			fmt.Println(blue("Grant Details:"))
			fmt.Printf("  Organization: %s\n", result.Organization)
			fmt.Printf("  Plan:         %s\n", cyan(result.PlanTier))
			fmt.Printf("  Seat Limit:   %d\n", result.SeatLimit)
			fmt.Printf("  Granted By:   %s\n", dim(result.GrantedBy))
			fmt.Println()

			return nil
		},
	}
	grantCmd.Flags().StringP("reason", "r", "Admin grant", "Reason for the grant")

	// ── list-orgs ──────────────────────────────────────────────────────────
	listOrgsCmd := &cobra.Command{
		Use:   "list-orgs",
		Short: "List all organizations with their plans",
		RunE: func(cmd *cobra.Command, args []string) error {
			jsonOutput, _ := cmd.Flags().GetBool("json")

			cfg, err := client.LoadConfig()
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}
			if !cfg.IsAuthenticated() {
				fmt.Println(red("Not authenticated. Need admin API key."))
				os.Exit(1)
			}

			c, err := client.NewFromConfig()
			if err != nil {
				return err
			}

			orgs, err := c.ListOrganizations()
			if err != nil {
				return fmt.Errorf("list organizations: %w", err)
			}

			if jsonOutput {
				printJSON(orgs)
				return nil
			}

			fmt.Println()
			fmt.Println(blue("Organizations"))
			fmt.Println(dim("────────────────────────────────────────────"))
			fmt.Println()

			for _, o := range orgs.Organizations {
				planColor := func(tier string) string {
					switch tier {
					case "enterprise":
						return "\033[35m" // magenta
					case "enforcement":
						return "\033[33m" // yellow
					case "convenience":
						return "\033[36m" // cyan
					default:
						return "\033[90m" // gray
					}
				}(o.PlanTier)

				fmt.Printf("  %s\n", bold(o.Name))
				fmt.Printf("    Plan: %s | Seats: %d | Configs: %d\n",
					planColor+o.PlanTier+"\033[0m", o.SeatLimit, o.TotalConfigs)

				if o.ManualGrant != nil {
					fmt.Printf("    %s\n", dim("[Legacy] Manual grant by "+o.ManualGrant.GrantedBy))
				}
				fmt.Println()
			}

			return nil
		},
	}
	listOrgsCmd.Flags().Bool("json", false, "Output as JSON")

	cmd.AddCommand(grantCmd)
	cmd.AddCommand(listOrgsCmd)

	return cmd
}
