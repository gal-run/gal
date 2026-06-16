package agg

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"
)

type App struct {
	Stdout io.Writer
	Stderr io.Writer
	Cwd    string
}

func NewApp(stdout, stderr io.Writer, cwd string) *App {
	return &App{
		Stdout: stdout,
		Stderr: stderr,
		Cwd:    cwd,
	}
}

func (app *App) Run(args []string) int {
	if len(args) == 0 {
		app.writeTopLevelHelp()
		return 0
	}

	switch args[0] {
	case "scan":
		options, err := parseScanOptions(args[1:])
		if err != nil {
			if err == errHelpRequested {
				app.writeScanHelp(app.Stdout)
				return 0
			}
			fmt.Fprintln(app.Stderr, err.Error())
			app.writeScanHelp(app.Stderr)
			return 2
		}
		return app.runScan(options)
	case "graph":
		options, err := parseViewOptions(args[1:], "graph")
		if err != nil {
			if err == errHelpRequested {
				app.writeGraphHelp(app.Stdout)
				return 0
			}
			fmt.Fprintln(app.Stderr, err.Error())
			app.writeGraphHelp(app.Stderr)
			return 2
		}
		return app.runGraph(options)
	case "handoff":
		options, err := parseViewOptions(args[1:], "handoff")
		if err != nil {
			if err == errHelpRequested {
				app.writeHandoffHelp(app.Stdout)
				return 0
			}
			fmt.Fprintln(app.Stderr, err.Error())
			app.writeHandoffHelp(app.Stderr)
			return 2
		}
		return app.runHandoff(options)
	case "", "-h", "--help", "help":
		app.writeTopLevelHelp()
		return 0
	default:
		fmt.Fprintf(app.Stderr, "unknown command: %s\n", args[0])
		app.writeTopLevelHelpTo(app.Stderr)
		return 2
	}
}

type scanOptions struct {
	WorkspacePath   string
	SnapshotPath    string
	SnapshotScript  string
	RepoFilter      string
	CurrentScope    bool
	JSONOutput      bool
	FetchRemotes    bool
	UseCache        bool
	CacheTTLSeconds int
}

type viewOptions struct {
	WorkspacePath  string
	SnapshotPath   string
	SnapshotScript string
	RepoFilter     string
	JSONOutput     bool
	FetchRemotes   bool
	Command        string
}

func parseScanOptions(args []string) (scanOptions, error) {
	options := scanOptions{
		UseCache:        true,
		CacheTTLSeconds: 120,
	}

	if value := os.Getenv("AGG_CACHE_TTL_SECONDS"); value != "" {
		parsedValue, err := parseCacheTTLSeconds(value)
		if err != nil {
			return options, err
		}
		options.CacheTTLSeconds = parsedValue
	}

	for index := 0; index < len(args); index++ {
		switch args[index] {
		case "--snapshot":
			index++
			if index >= len(args) {
				return options, fmt.Errorf("--snapshot requires a file path")
			}
			options.SnapshotPath = args[index]
		case "--snapshot-script":
			index++
			if index >= len(args) {
				return options, fmt.Errorf("--snapshot-script requires a file path")
			}
			options.SnapshotScript = args[index]
		case "--repo":
			index++
			if index >= len(args) {
				return options, fmt.Errorf("--repo requires a repository slug or relative path")
			}
			options.RepoFilter = args[index]
		case "--current":
			options.CurrentScope = true
		case "--json":
			options.JSONOutput = true
		case "--fetch":
			options.FetchRemotes = true
		case "--no-cache":
			options.UseCache = false
		case "--cache-ttl":
			index++
			if index >= len(args) {
				return options, fmt.Errorf("--cache-ttl requires a number of seconds")
			}
			parsedValue, err := parseCacheTTLSeconds(args[index])
			if err != nil {
				return options, err
			}
			options.CacheTTLSeconds = parsedValue
		case "--help", "-h":
			return options, errHelpRequested
		default:
			if len(args[index]) > 0 && args[index][0] == '-' {
				return options, fmt.Errorf("unknown option: %s", args[index])
			}
			if options.WorkspacePath != "" {
				return options, fmt.Errorf("unexpected extra argument: %s", args[index])
			}
			options.WorkspacePath = args[index]
		}
	}

	return options, nil
}

func parseViewOptions(args []string, command string) (viewOptions, error) {
	options := viewOptions{Command: command}

	for index := 0; index < len(args); index++ {
		switch args[index] {
		case "--snapshot":
			index++
			if index >= len(args) {
				return options, fmt.Errorf("--snapshot requires a file path")
			}
			options.SnapshotPath = args[index]
		case "--snapshot-script":
			index++
			if index >= len(args) {
				return options, fmt.Errorf("--snapshot-script requires a file path")
			}
			options.SnapshotScript = args[index]
		case "--repo":
			index++
			if index >= len(args) {
				return options, fmt.Errorf("--repo requires an OWNER/REPO slug or repo root relative path")
			}
			options.RepoFilter = args[index]
		case "--json":
			options.JSONOutput = true
		case "--fetch":
			options.FetchRemotes = true
		case "--help", "-h":
			return options, errHelpRequested
		default:
			if len(args[index]) > 0 && args[index][0] == '-' {
				return options, fmt.Errorf("unknown option: %s", args[index])
			}
			if options.WorkspacePath != "" {
				return options, fmt.Errorf("unexpected extra argument: %s", args[index])
			}
			options.WorkspacePath = args[index]
		}
	}

	return options, nil
}

var errHelpRequested = fmt.Errorf("help requested")

func (app *App) runScan(options scanOptions) int {
	if options.WorkspacePath != "" {
		options.WorkspacePath = resolvePath(options.WorkspacePath)
	}
	if options.SnapshotPath != "" {
		options.SnapshotPath = resolvePath(options.SnapshotPath)
	}

	workspacePath := options.WorkspacePath
	if workspacePath == "" {
		workspacePath = FindWorkspaceRoot(app.Cwd)
	}
	repoFilter := options.RepoFilter
	if options.CurrentScope && repoFilter == "" {
		if workspacePath == "" {
			fmt.Fprintln(app.Stderr, "workspace path not provided and could not be inferred for --current")
			return 2
		}
		repoFilter = InferCurrentRepoFilter(workspacePath, app.Cwd)
		if repoFilter == "" {
			fmt.Fprintln(app.Stderr, "could not infer the current repository lane for --current")
			return 2
		}
	}

	startedAt := time.Now()
	snapshot, snapshotPath, _, err := LoadSnapshot(SnapshotRuntimeOptions{
		WorkingDirectory: app.Cwd,
		WorkspacePath:    workspacePath,
		SnapshotPath:     options.SnapshotPath,
		SnapshotScript:   options.SnapshotScript,
		FetchRemotes:     options.FetchRemotes,
		UseCache:         options.UseCache,
		CacheTTLSeconds:  options.CacheTTLSeconds,
		Stderr:           app.Stderr,
	})
	if err != nil {
		fmt.Fprintln(app.Stderr, err.Error())
		return 2
	}

	fmt.Fprintln(app.Stderr, "[agg] building scan model")
	report, err := BuildScanReport(snapshot, snapshotPath, repoFilter)
	if err != nil {
		fmt.Fprintln(app.Stderr, err.Error())
		return 1
	}
	fmt.Fprintf(app.Stderr, "[agg] scan ready in %ds: repos=%d attention=%d primary=%d forks=%d\n", int(time.Since(startedAt).Seconds()), report.Summary.RepoCount, report.Summary.AttentionCount, report.Summary.FirstPartyAttentionCount, report.Summary.ThirdPartyAttentionCount)

	if err := WriteScanOutput(app.Stdout, report, options.JSONOutput); err != nil {
		fmt.Fprintln(app.Stderr, err.Error())
		return 1
	}
	return 0
}

func (app *App) runGraph(options viewOptions) int {
	if options.WorkspacePath != "" {
		options.WorkspacePath = resolvePath(options.WorkspacePath)
	}
	if options.SnapshotPath != "" {
		options.SnapshotPath = resolvePath(options.SnapshotPath)
	}

	workspacePath := options.WorkspacePath
	if workspacePath == "" {
		workspacePath = FindWorkspaceRoot(app.Cwd)
	}
	repoFilter := options.RepoFilter
	if repoFilter == "" {
		if workspacePath == "" {
			fmt.Fprintln(app.Stderr, "agg graph requires --repo or a current workspace checkout")
			return 2
		}
		repoFilter = InferCurrentRepoFilter(workspacePath, app.Cwd)
		if repoFilter == "" {
			fmt.Fprintln(app.Stderr, "agg graph requires --repo or a current git checkout inside the workspace")
			return 2
		}
	}

	startedAt := time.Now()
	snapshot, snapshotPath, _, err := LoadSnapshot(SnapshotRuntimeOptions{
		WorkingDirectory: app.Cwd,
		WorkspacePath:    workspacePath,
		SnapshotPath:     options.SnapshotPath,
		SnapshotScript:   options.SnapshotScript,
		FetchRemotes:     options.FetchRemotes,
		UseCache:         true,
		CacheTTLSeconds:  120,
		Stderr:           app.Stderr,
	})
	if err != nil {
		fmt.Fprintln(app.Stderr, err.Error())
		return 2
	}

	fmt.Fprintln(app.Stderr, "[agg] building scan model")
	scanReport, err := BuildScanReport(snapshot, snapshotPath, repoFilter)
	if err != nil {
		fmt.Fprintln(app.Stderr, err.Error())
		return 1
	}
	fmt.Fprintf(app.Stderr, "[agg] scan ready in %ds: repos=%d attention=%d primary=%d forks=%d\n", int(time.Since(startedAt).Seconds()), scanReport.Summary.RepoCount, scanReport.Summary.AttentionCount, scanReport.Summary.FirstPartyAttentionCount, scanReport.Summary.ThirdPartyAttentionCount)
	graphReport, err := BuildGraphReport(scanReport)
	if err != nil {
		fmt.Fprintln(app.Stderr, err.Error())
		return 1
	}

	if err := WriteGraphOutput(app.Stdout, graphReport, options.JSONOutput); err != nil {
		fmt.Fprintln(app.Stderr, err.Error())
		return 1
	}
	return 0
}

func (app *App) runHandoff(options viewOptions) int {
	if options.WorkspacePath != "" {
		options.WorkspacePath = resolvePath(options.WorkspacePath)
	}
	if options.SnapshotPath != "" {
		options.SnapshotPath = resolvePath(options.SnapshotPath)
	}

	workspacePath := options.WorkspacePath
	if workspacePath == "" {
		workspacePath = FindWorkspaceRoot(app.Cwd)
	}
	repoFilter := options.RepoFilter
	if repoFilter == "" {
		if workspacePath == "" {
			fmt.Fprintln(app.Stderr, "agg handoff requires --repo or a current workspace checkout")
			return 2
		}
		repoFilter = InferCurrentLaneFilter(workspacePath, app.Cwd)
		if repoFilter == "" {
			fmt.Fprintln(app.Stderr, "agg handoff requires --repo or a current git checkout inside the workspace")
			return 2
		}
	}

	startedAt := time.Now()
	snapshot, snapshotPath, _, err := LoadSnapshot(SnapshotRuntimeOptions{
		WorkingDirectory: app.Cwd,
		WorkspacePath:    workspacePath,
		SnapshotPath:     options.SnapshotPath,
		SnapshotScript:   options.SnapshotScript,
		FetchRemotes:     options.FetchRemotes,
		UseCache:         true,
		CacheTTLSeconds:  120,
		Stderr:           app.Stderr,
	})
	if err != nil {
		fmt.Fprintln(app.Stderr, err.Error())
		return 2
	}

	fmt.Fprintln(app.Stderr, "[agg] building scan model")
	scanReport, err := BuildScanReport(snapshot, snapshotPath, repoFilter)
	if err != nil {
		fmt.Fprintln(app.Stderr, err.Error())
		return 1
	}
	fmt.Fprintf(app.Stderr, "[agg] scan ready in %ds: repos=%d attention=%d primary=%d forks=%d\n", int(time.Since(startedAt).Seconds()), scanReport.Summary.RepoCount, scanReport.Summary.AttentionCount, scanReport.Summary.FirstPartyAttentionCount, scanReport.Summary.ThirdPartyAttentionCount)
	handoffReport, err := BuildHandoffReport(scanReport)
	if err != nil {
		fmt.Fprintln(app.Stderr, err.Error())
		return 1
	}

	if err := WriteHandoffOutput(app.Stdout, handoffReport, options.JSONOutput); err != nil {
		fmt.Fprintln(app.Stderr, err.Error())
		return 1
	}
	return 0
}

func resolvePath(path string) string {
	resolvedPath, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	return resolvedPath
}

func (app *App) writeTopLevelHelp() {
	app.writeTopLevelHelpTo(app.Stdout)
}

func (app *App) writeTopLevelHelpTo(writer io.Writer) {
	fmt.Fprint(writer, `Usage:
  ./agg scan [WORKSPACE] [--snapshot FILE] [--repo OWNER/REPO|RELATIVE_PATH] [--current] [--fetch] [--no-cache] [--cache-ttl SECONDS] [--json]
  ./agg graph [WORKSPACE] [--repo OWNER/REPO|RELATIVE_PATH] [--snapshot FILE] [--fetch] [--json]
  ./agg handoff [WORKSPACE] [--repo OWNER/REPO|RELATIVE_PATH] [--snapshot FILE] [--fetch] [--json]

Commands:
  scan    Read a git-evidence snapshot and print a cleanliness report.
  graph   Show branch and worktree topology for one repository.
  handoff Decide whether repo lanes are safe to commit, hand off, or blocked.
`)
}

func (app *App) writeScanHelp(writer io.Writer) {
	fmt.Fprint(writer, `Usage:
  agg scan [WORKSPACE] [--snapshot FILE] [--repo OWNER/REPO|RELATIVE_PATH] [--current] [--fetch] [--no-cache] [--cache-ttl SECONDS] [--json]

Examples:
  ./agg scan /path/to/workspace
  ./agg scan --snapshot snapshot.json
  ./agg scan --repo acme/example
  ./agg scan --current
  ./agg scan --repo acme/example/worktrees/fix-lane --json
`)
}

func (app *App) writeGraphHelp(writer io.Writer) {
	fmt.Fprint(writer, `Usage:
  agg graph [WORKSPACE] [--repo OWNER/REPO|RELATIVE_PATH] [--snapshot FILE] [--fetch] [--json]

Examples:
  ./agg graph
  ./agg graph /path/to/workspace --repo acme/example
  ./agg graph --snapshot snapshot.json --repo acme/example --json
`)
}

func (app *App) writeHandoffHelp(writer io.Writer) {
	fmt.Fprint(writer, `Usage:
  agg handoff [WORKSPACE] [--repo OWNER/REPO|RELATIVE_PATH] [--snapshot FILE] [--fetch] [--json]

Examples:
  ./agg handoff
  ./agg handoff /path/to/workspace --repo acme/example
  ./agg handoff --snapshot snapshot.json --repo acme/example --json
`)
}
