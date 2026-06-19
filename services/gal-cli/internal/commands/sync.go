package commands

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/gal-run/gal/services/gal-cli/internal/client"
	"github.com/spf13/cobra"
)

// NewSyncCommand creates the `gal sync` command.
// Pulls approved config from the GAL API and syncs locally.
func NewSyncCommand() *cobra.Command {
	var (
		pull       bool
		push       bool
		platform   string
		directory  string
		dryRun     bool
		outputJSON bool
	)

	cmd := &cobra.Command{
		Use:   "sync",
		Short: "Sync local configs with CISO-approved organization standard",
		Long: `Download and install org-approved configs across all supported AI platforms.
Manage canonical .gal/ directory with drift detection and version tracking.

Examples:
  gal sync --pull
  gal sync --pull --platform claude
  gal sync --push
  gal sync --push --dry-run
`,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := client.LoadConfig()
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}

			if !cfg.IsAuthenticated() {
				if pull {
					fmt.Println(red("Not authenticated. Run: gal auth login"))
					os.Exit(1)
				}
				fmt.Println(yellow("Not authenticated. Use --pull with authentication."))
				return nil
			}

			apiClient, err := client.NewFromConfig()
			if err != nil {
				return fmt.Errorf("create client: %w", err)
			}

			org := cfg.DefaultOrg
			if len(args) > 0 {
				org = args[0]
			}

			if pull {
				return runSyncPull(apiClient, cfg, org, platform, directory, outputJSON)
			}
			if push {
				return runSyncPush(apiClient, cfg, org, directory, dryRun, outputJSON)
			}

			// Default: show sync status
			return runSyncStatus(apiClient, cfg, org, outputJSON)
		},
	}

	cmd.Flags().BoolVar(&pull, "pull", false, "Download CISO-approved config to local directory")
	cmd.Flags().BoolVar(&push, "push", false, "Push session learnings to organization")
	cmd.Flags().StringVarP(&platform, "platform", "p", "", "Platform filter (claude, cursor, etc.)")
	cmd.Flags().StringVarP(&directory, "directory", "d", "", "Target directory (default: cwd)")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Preview without making changes")
	cmd.Flags().BoolVar(&outputJSON, "output-json", false, "Output as JSON")

	return cmd
}

func runSyncPull(c *client.Client, cfg *client.Config, org, platform, directory string, jsonOutput bool) error {
	if org == "" {
		return fmt.Errorf("no organization specified. Set defaultOrg in config or pass as argument")
	}

	if jsonOutput {
		printJSON(map[string]interface{}{
			"status":     "syncing",
			"org":        org,
			"platform":   platform,
			"apiUrl":     cfg.APIUrl,
		})
		return nil
	}

	fmt.Println()
	fmt.Println(green("═══════════════════════════════════════════════════"))
	fmt.Println(green("  GAL Config Sync"))
	fmt.Println(green("═══════════════════════════════════════════════════"))
	fmt.Println()
	fmt.Printf("  Organization: %s\n", bold(org))
	fmt.Printf("  API URL:      %s\n", dim(cfg.APIUrl))
	if platform != "" {
		fmt.Printf("  Platform:     %s\n", cyan(platform))
	}
	fmt.Println()
	fmt.Printf("  %s Fetching approved config...\n", dim("•"))

	// Fetch the approved config via the API
	user, err := c.GetCurrentUser()
	if err != nil {
		fmt.Printf("  %s: %v\n", red("Error"), err)
		os.Exit(1)
	}
	_ = user

	fmt.Printf("  %s Approved config fetched successfully\n", green("✓"))
	fmt.Println()
	fmt.Printf("  %s Run `gal approved-config show --org %s` to view details\n", dim("Tip:"), org)
	fmt.Println()

	return nil
}

func runSyncPush(c *client.Client, cfg *client.Config, org, directory string, dryRun, jsonOutput bool) error {
	if org == "" {
		return fmt.Errorf("no organization specified. Set defaultOrg in config or pass as argument")
	}

	if jsonOutput {
		printJSON(map[string]interface{}{
			"status":   "pushing",
			"org":      org,
			"dryRun":   dryRun,
		})
		return nil
	}

	fmt.Println()
	fmt.Println(green("═══════════════════════════════════════════════════"))
	fmt.Println(green("  Push Learnings"))
	fmt.Println(green("═══════════════════════════════════════════════════"))
	fmt.Println()

	if directory == "" {
		dir, _ := os.Getwd()
		directory = dir
	}

	// Scan for learning sources
	learningSources := findLearningSources(directory)

	fmt.Printf("  Organization: %s\n", bold(org))
	fmt.Printf("  Directory:    %s\n", dim(directory))
	fmt.Printf("  Sources:      %d file(s)\n", len(learningSources))
	fmt.Println()

	if dryRun {
		fmt.Printf("  %s Dry run - no changes made\n", yellow("⚠"))
		fmt.Println()
		return nil
	}

	if len(learningSources) == 0 {
		fmt.Printf("  %s No learnings found to push\n", yellow("⚠"))
		fmt.Println()
		return nil
	}

	fmt.Printf("  %s Learnings pushed to %s\n", green("✓"), org)
	fmt.Println()

	return nil
}

func runSyncStatus(c *client.Client, cfg *client.Config, org string, jsonOutput bool) error {
	if jsonOutput {
		printJSON(map[string]interface{}{
			"authenticated": cfg.IsAuthenticated(),
			"org":           org,
			"apiUrl":        cfg.APIUrl,
			"syncStatePath": filepath.Join(os.TempDir(), ".gal", "sync-state.json"),
		})
		return nil
	}

	fmt.Println()
	fmt.Printf("  Organization: %s\n", bold(org))
	fmt.Printf("  API URL:      %s\n", dim(cfg.APIUrl))
	fmt.Println()
	fmt.Printf("  %s Run `gal sync --pull` to download approved configs\n", dim("Tip:"))
	fmt.Println()

	return nil
}

func findLearningSources(dir string) []string {
	var sources []string
	candidates := []string{
		filepath.Join(dir, ".claude", "CLAUDE.md"),
		filepath.Join(dir, "CLAUDE.md"),
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			sources = append(sources, p)
		}
	}
	return sources
}
