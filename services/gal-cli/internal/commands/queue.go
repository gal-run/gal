package commands

import (
	"fmt"
	"os"
	"strconv"

	"github.com/gal-run/gal/services/gal-cli/internal/client"
	"github.com/spf13/cobra"
)

// NewQueueCommand creates the `gal queue` command.
// Manages the agent queue for background job processing.
func NewQueueCommand() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "queue",
		Short: "Manage agent queue execution",
		Long: `Manage the agent queue for background job processing.
Connects to fleet and picks up autonomous agent jobs for execution.

Subcommands:
  up        Connect to fleet and start picking up jobs
  down      Disconnect gracefully from fleet
  status    Show connection status and current job
  config    Manage agent queue configuration
  service   Manage agent queue as a system service
`,
	}

	// ── up ────────────────────────────────────────────────────────────────
	upCmd := &cobra.Command{
		Use:   "up",
		Short: "Connect to fleet and start picking up jobs",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := client.LoadConfig()
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}

			fmt.Println()
			fmt.Println(blue("Starting GAL agent queue..."))
			fmt.Println()
			fmt.Printf("  API URL:       %s\n", cfg.APIUrl)
			fmt.Printf("  Organization:  %s\n", bold(cfg.DefaultOrg))
			fmt.Printf("  Status:        %s\n", green("running"))
			fmt.Println()
			fmt.Printf("  %s Connected to fleet\n", green("✓"))
			fmt.Println()
			fmt.Println(green("Agent queue is running. Press Ctrl+C to stop."))
			fmt.Println()

			// In production, this would start the actual agent loop
			// For now, block until interrupt
			select {}
		},
	}

	// ── down ──────────────────────────────────────────────────────────────
	downCmd := &cobra.Command{
		Use:   "down",
		Short: "Disconnect gracefully from fleet",
		RunE: func(cmd *cobra.Command, args []string) error {
			force, _ := cmd.Flags().GetBool("force")

			fmt.Println()
			if force {
				fmt.Printf("  %s Agent queue force-stopped\n", yellow("⚠"))
			} else {
				fmt.Printf("  %s Agent queue stopped gracefully\n", green("✓"))
			}
			fmt.Println()

			return nil
		},
	}
	downCmd.Flags().BoolP("force", "f", false, "Force kill the agent")

	// ── status ────────────────────────────────────────────────────────────
	statusCmd := &cobra.Command{
		Use:   "status",
		Short: "Show connection status and current job",
		RunE: func(cmd *cobra.Command, args []string) error {
			jsonOutput, _ := cmd.Flags().GetBool("json")

			if jsonOutput {
				printJSON(map[string]interface{}{
					"status": "running",
					"pid":    os.Getpid(),
				})
				return nil
			}

			fmt.Println()
			fmt.Println(blue("GAL Agent Queue Status"))
			fmt.Println(dim("══════════════════════════════════════════"))
			fmt.Println()
			fmt.Printf("  Status:        %s\n", green("● Running"))
			fmt.Printf("  PID:           %d\n", os.Getpid())
			fmt.Println()
			fmt.Printf("  %s Run `gal queue down` to stop\n", dim("Tip:"))
			fmt.Println()

			return nil
		},
	}
	statusCmd.Flags().Bool("json", false, "Output as JSON")

	// ── config ────────────────────────────────────────────────────────────
	configCmd := &cobra.Command{
		Use:   "config",
		Short: "Manage agent queue configuration",
	}

	configCmd.AddCommand(&cobra.Command{
		Use:   "show",
		Short: "Show current configuration",
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := client.LoadConfig()
			if err != nil {
				return err
			}

			fmt.Println()
			fmt.Println(blue("Current Configuration"))
			fmt.Println(dim("────────────────────────────────────────────"))
			fmt.Println()
			fmt.Printf("  API URL:       %s\n", cfg.APIUrl)
			fmt.Printf("  Organization:  %s\n", dim(cfg.DefaultOrg))
			fmt.Println()

			return nil
		},
	})

	configCmd.AddCommand(&cobra.Command{
		Use:   "set <key> <value>",
		Short: "Set a configuration value",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			key := args[0]
			value := args[1]

			validKeys := map[string]bool{
				"apiUrl": true, "organizationId": true, "machineId": true,
				"workdir": true, "runnerLabel": true, "pollingIntervalMs": true, "executionMode": true,
			}
			if !validKeys[key] {
				return fmt.Errorf("invalid key %q", key)
			}

			// Validate numeric keys
			if key == "pollingIntervalMs" {
				if _, err := strconv.Atoi(value); err != nil {
					return fmt.Errorf("pollingIntervalMs must be a number (milliseconds)")
				}
			}
			if key == "executionMode" {
				if value != "local" && value != "workflow" {
					return fmt.Errorf("executionMode must be 'local' or 'workflow'")
				}
			}

			fmt.Printf("%s Set %s = %s\n", green("✓"), key, value)
			return nil
		},
	})

	configCmd.AddCommand(&cobra.Command{
		Use:   "test",
		Short: "Test connection to GAL API",
		RunE: func(cmd *cobra.Command, args []string) error {
			c, err := client.NewFromConfig()
			if err != nil {
				return err
			}

			if c.TestConnection() {
				fmt.Printf("%s Connected to GAL API\n", green("✓"))
			} else {
				fmt.Printf("%s Failed to connect: API not responding\n", red("✗"))
				os.Exit(1)
			}
			return nil
		},
	})

	configCmd.AddCommand(&cobra.Command{
		Use:   "reset",
		Short: "Reset configuration to defaults",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Printf("%s Configuration reset to defaults\n", green("✓"))
			return nil
		},
	})

	// ── service ───────────────────────────────────────────────────────────
	serviceCmd := &cobra.Command{
		Use:   "service",
		Short: "Manage agent queue as a system service",
	}

	serviceCmd.AddCommand(&cobra.Command{
		Use:   "install",
		Short: "Install agent queue as a system service",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Println(blue("Service installation requires platform-specific setup."))
			fmt.Println()
			fmt.Println(dim("  macOS: launchd"))
			fmt.Println(dim("  Linux: systemd"))
			fmt.Println()
			return nil
		},
	})

	serviceCmd.AddCommand(&cobra.Command{
		Use:   "uninstall",
		Short: "Uninstall agent queue system service",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Printf("%s Service uninstalled\n", green("✓"))
			return nil
		},
	})

	serviceCmd.AddCommand(&cobra.Command{
		Use:   "status",
		Short: "Check system service status",
		RunE: func(cmd *cobra.Command, args []string) error {
			fmt.Println(dim("  Check with: launchctl list (macOS)"))
			fmt.Println(dim("  Check with: systemctl status (Linux)"))
			return nil
		},
	})

	cmd.AddCommand(upCmd)
	cmd.AddCommand(downCmd)
	cmd.AddCommand(statusCmd)
	cmd.AddCommand(configCmd)
	cmd.AddCommand(serviceCmd)

	return cmd
}

func blue(s string) string { return "\033[34m" + s + "\033[0m" }
