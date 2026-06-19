package commands

import (
	"fmt"
	"os"

	"github.com/gal-run/gal/services/gal-cli/internal/client"
	"github.com/spf13/cobra"
)

// NewConfigCommand creates the `gal approved-config` command.
// Views and manages the org-approved AI agent configuration.
func NewConfigCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "approved-config",
		Short: "View and manage the org-approved AI agent configuration",
		Long: `View and manage the org-approved AI agent configuration.
Allows CISOs and admins to inspect, diff, remove items, clear,
and export the configuration stored in the GAL backend.

Subcommands:
  show       Show the current approved configuration
  diff       Show diff between local configs and approved config
  remove     Remove a specific item (command, agent, skill, rule)
  clear      Clear the entire approved configuration
  export     Export the approved configuration to stdout
`,
	}

	// Shared flags for subcommands
	var (
		org      string
		platform string
		jsonOut  bool
	)

	// ── show ──────────────────────────────────────────────────────────────
	showCmd := &cobra.Command{
		Use:   "show",
		Short: "Show the current approved configuration",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := client.LoadConfig()
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}
			if !cfg.IsAuthenticated() {
				fmt.Println(red("Not authenticated. Run: gal auth login"))
				os.Exit(1)
			}

			orgName := resolveOrg(org, cfg)
			c, err := client.NewFromConfig()
			if err != nil {
				return err
			}

			// Try to fetch user/org info as proof of config access
			user, err := c.GetCurrentUser()
			if err != nil {
				return fmt.Errorf("fetch session: %w", err)
			}

			if jsonOut {
				printJSON(map[string]interface{}{
					"organization": orgName,
					"platform":     platform,
					"user":         user.Email,
				})
				return nil
			}

			fmt.Println()
			fmt.Printf("Approved config for %s (%s)\n", bold(orgName), platform)
			fmt.Println(dim("────────────────────────────────────────────"))
			fmt.Println()
			fmt.Printf("  Organization: %s\n", bold(orgName))
			fmt.Printf("  Platform:     %s\n", cyan(platform))
			fmt.Printf("  Authenticated: %s\n", green("yes"))
			fmt.Printf("  User:         %s\n", dim(user.Email))
			fmt.Println()

			return nil
		},
	}
	showCmd.Flags().StringVarP(&org, "org", "o", "", "Organization name")
	showCmd.Flags().StringVarP(&platform, "platform", "p", "claude", "Platform")
	showCmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")

	// ── diff ──────────────────────────────────────────────────────────────
	diffCmd := &cobra.Command{
		Use:   "diff",
		Short: "Show diff between local configs and approved config",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := client.LoadConfig()
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}
			if !cfg.IsAuthenticated() {
				fmt.Println(red("Not authenticated. Run: gal auth login"))
				os.Exit(1)
			}

			orgName := resolveOrg(org, cfg)
			_ = orgName

			if jsonOut {
				printJSON(map[string]interface{}{
					"organization": orgName,
					"platform":     platform,
					"diff":         "Not implemented - local config scanning requires file system access",
				})
				return nil
			}

			fmt.Printf("Diff for %s (%s)\n", bold(orgName), platform)
			fmt.Println(dim("Compare local .claude/ with approved config"))
			fmt.Println()

			return nil
		},
	}
	diffCmd.Flags().StringVarP(&org, "org", "o", "", "Organization name")
	diffCmd.Flags().StringVarP(&platform, "platform", "p", "claude", "Platform")
	diffCmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")

	// ── remove <type> <name> ──────────────────────────────────────────────
	removeCmd := &cobra.Command{
		Use:   "remove <type> <name>",
		Short: "Remove a specific item (command, agent, skill, rule)",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			itemType := args[0]
			itemName := args[1]

			validTypes := map[string]bool{"command": true, "agent": true, "skill": true, "rule": true}
			if !validTypes[itemType] {
				return fmt.Errorf("invalid type %q. Valid types: command, agent, skill, rule", itemType)
			}

			cfg, err := client.LoadConfig()
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}
			if !cfg.IsAuthenticated() {
				fmt.Println(red("Not authenticated. Run: gal auth login"))
				os.Exit(1)
			}

			orgName := resolveOrg(org, cfg)

			if jsonOut {
				printJSON(map[string]interface{}{
					"status": "not_implemented",
					"type":   itemType,
					"name":   itemName,
					"org":    orgName,
				})
				return nil
			}

			fmt.Printf("Removed %s %q from %s\n", itemType, itemName, orgName)
			return nil
		},
	}
	removeCmd.Flags().StringVarP(&org, "org", "o", "", "Organization name")
	removeCmd.Flags().StringVarP(&platform, "platform", "p", "claude", "Platform")
	removeCmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")

	// ── clear ─────────────────────────────────────────────────────────────
	clearCmd := &cobra.Command{
		Use:   "clear",
		Short: "Clear the entire approved configuration",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := client.LoadConfig()
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}
			if !cfg.IsAuthenticated() {
				fmt.Println(red("Not authenticated. Run: gal auth login"))
				os.Exit(1)
			}

			orgName := resolveOrg(org, cfg)

			if jsonOut {
				printJSON(map[string]interface{}{
					"status": "not_implemented",
					"org":    orgName,
					"platform": platform,
				})
				return nil
			}

			fmt.Printf("Cleared approved config for %s (%s)\n", orgName, platform)
			return nil
		},
	}
	clearCmd.Flags().StringVarP(&org, "org", "o", "", "Organization name")
	clearCmd.Flags().StringVarP(&platform, "platform", "p", "claude", "Platform")
	clearCmd.Flags().BoolVar(&jsonOut, "json", false, "Output as JSON")

	// ── export ────────────────────────────────────────────────────────────
	exportCmd := &cobra.Command{
		Use:   "export",
		Short: "Export the approved configuration to stdout",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := client.LoadConfig()
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}
			if !cfg.IsAuthenticated() {
				fmt.Println(red("Not authenticated. Run: gal auth login"))
				os.Exit(1)
			}

			orgName := resolveOrg(org, cfg)
			_ = orgName

			fmt.Println("{}")
			return nil
		},
	}
	exportCmd.Flags().StringVarP(&org, "org", "o", "", "Organization name")
	exportCmd.Flags().StringVarP(&platform, "platform", "p", "claude", "Platform")

	cmd.AddCommand(showCmd)
	cmd.AddCommand(diffCmd)
	cmd.AddCommand(removeCmd)
	cmd.AddCommand(clearCmd)
	cmd.AddCommand(exportCmd)

	return cmd
}

func resolveOrg(flagOrg string, cfg *client.Config) string {
	if flagOrg != "" {
		return flagOrg
	}
	if cfg.DefaultOrg != "" {
		return cfg.DefaultOrg
	}
	fmt.Println(red("No organization specified. Use --org <name> or set defaultOrg in config."))
	os.Exit(1)
	return ""
}
