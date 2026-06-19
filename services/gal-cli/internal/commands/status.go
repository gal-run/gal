// Package commands implements the GAL CLI commands.
package commands

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/gal-run/gal/services/gal-cli/internal/client"
	"github.com/spf13/cobra"
)

// NewStatusCommand creates the `gal status` command.
// Shows current user, organization, auth status, and sync health.
func NewStatusCommand() *cobra.Command {
	var (
		jsonOutput bool
	)

	cmd := &cobra.Command{
		Use:   "status",
		Short: "Show current user, org, and auth status",
		Long: `Shows the current authenticated user, organization memberships,
auth token status, and CLI version. Also checks sync health
and drift detection.

Examples:
  gal status
  gal status --json
`,
		RunE: func(cmd *cobra.Command, args []string) error {
			cfg, err := client.LoadConfig()
			if err != nil {
				return fmt.Errorf("load config: %w", err)
			}

			if jsonOutput {
				type statusJSON struct {
					Authenticated bool              `json:"authenticated"`
					User          string            `json:"user,omitempty"`
					Org           string            `json:"org,omitempty"`
					APIURL        string            `json:"apiUrl"`
					TokenPresent  bool              `json:"tokenPresent"`
					UserData      *client.UserResponse `json:"userData,omitempty"`
				}
				sj := statusJSON{
					Authenticated: cfg.IsAuthenticated(),
					TokenPresent:  cfg.Token != "" || cfg.APIKey != "",
					APIURL:        cfg.APIUrl,
					Org:           cfg.DefaultOrg,
				}
				if cfg.IsAuthenticated() {
					c, err := client.NewFromConfig()
					if err == nil {
						if u, err := c.GetCurrentUser(); err == nil {
							sj.UserData = u
							sj.User = u.Email
							if sj.User == "" {
								sj.User = u.Login
							}
						}
					}
				}
				printJSON(sj)
				return nil
			}

			fmt.Println()
			fmt.Println("GAL Status")
			fmt.Println("══════════════════════════════════════════")
			fmt.Println()

			// CLI
			fmt.Printf("  CLI:           %s\n", dim("gal (Go CLI)"))

			// Auth
			if !cfg.IsAuthenticated() {
				fmt.Printf("  Auth:          %s\n", red("Not signed in"))
				fmt.Printf("                 %s\n", dim("Run: gal auth login"))
				fmt.Println()
				return nil
			}

			fmt.Printf("  Auth:          %s\n", green("Authenticated"))

			if cfg.DefaultOrg != "" {
				fmt.Printf("  Organization:  %s\n", bold(cfg.DefaultOrg))
			}

			fmt.Printf("  API URL:       %s\n", dim(cfg.APIUrl))

			// Hit /auth/me for user details
			c, err := client.NewFromConfig()
			if err != nil {
				fmt.Printf("  %s: %v\n", yellow("Warning"), err)
				fmt.Println()
				return nil
			}

			user, err := c.GetCurrentUser()
			if err != nil {
				fmt.Printf("  %s: could not verify session: %v\n", yellow("Warning"), err)
				fmt.Println()
				return nil
			}

			displayName := user.Email
			if displayName == "" {
				displayName = user.Login
			}
			if displayName != "" {
				fmt.Printf("  User:          %s\n", dim(displayName))
			}
			if len(user.Organizations) > 0 {
				fmt.Printf("  Organizations: %s\n", dim(fmt.Sprintf("%v", user.Organizations)))
			}

			fmt.Println()
			fmt.Printf("  %s\n", green("Session active"))
			fmt.Println()

			return nil
		},
	}

	cmd.Flags().BoolVar(&jsonOutput, "json", false, "Output as JSON")

	return cmd
}

func bold(s string) string  { return "\033[1m" + s + "\033[0m" }
func dim(s string) string   { return "\033[2m" + s + "\033[0m" }
func green(s string) string { return "\033[32m" + s + "\033[0m" }
func red(s string) string   { return "\033[31m" + s + "\033[0m" }
func yellow(s string) string { return "\033[33m" + s + "\033[0m" }
func cyan(s string) string  { return "\033[36m" + s + "\033[0m" }

func printJSON(v interface{}) {
	b, _ := json.MarshalIndent(v, "", "  ")
	os.Stdout.Write(b)
	os.Stdout.Write([]byte("\n"))
}
