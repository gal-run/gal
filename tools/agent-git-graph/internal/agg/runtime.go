package agg

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

type SnapshotRuntimeOptions struct {
	WorkingDirectory string
	WorkspacePath    string
	SnapshotPath     string
	SnapshotScript   string
	FetchRemotes     bool
	UseCache         bool
	CacheTTLSeconds  int
	Stderr           io.Writer
}

// defaultWorkspaceMarker is the relative path agg looks for when auto-detecting
// the root of a multi-repository workspace. It is configurable via the
// AGG_WORKSPACE_MARKER environment variable so agg is not tied to any specific
// directory layout. The default is a generic marker directory.
const defaultWorkspaceMarker = ".git-evidence-snapshot"

// defaultSnapshotScriptRelPath is the default location, relative to the
// workspace root, of the executable that produces a git-evidence snapshot. It
// is configurable via the AGG_SNAPSHOT_SCRIPT environment variable (absolute or
// workspace-relative) or the SnapshotScript runtime option.
const defaultSnapshotScriptRelPath = "scripts/git-evidence-snapshot.sh"

func workspaceMarker() string {
	if value := strings.TrimSpace(os.Getenv("AGG_WORKSPACE_MARKER")); value != "" {
		return value
	}
	return defaultWorkspaceMarker
}

func resolveSnapshotScript(workspacePath, override string) string {
	candidate := strings.TrimSpace(override)
	if candidate == "" {
		candidate = strings.TrimSpace(os.Getenv("AGG_SNAPSHOT_SCRIPT"))
	}
	if candidate == "" {
		candidate = defaultSnapshotScriptRelPath
	}
	if filepath.IsAbs(candidate) {
		return candidate
	}
	return filepath.Join(workspacePath, filepath.FromSlash(candidate))
}

func FindWorkspaceRoot(startPath string) string {
	currentPath, err := canonicalPath(startPath)
	if err != nil {
		return ""
	}

	marker := filepath.FromSlash(workspaceMarker())
	for {
		if pathExists(filepath.Join(currentPath, marker)) {
			return currentPath
		}

		parentPath := filepath.Dir(currentPath)
		if parentPath == currentPath {
			return ""
		}
		currentPath = parentPath
	}
}

func InferCurrentLaneFilter(workspaceRoot, startPath string) string {
	laneRoot := gitRevParse(startPath, "--show-toplevel")
	if laneRoot == "" {
		return ""
	}
	return relativeToWorkspace(laneRoot, workspaceRoot)
}

func InferCurrentRepoFilter(workspaceRoot, startPath string) string {
	laneRoot := gitRevParse(startPath, "--show-toplevel")
	commonDir := gitRevParse(startPath, "--git-common-dir")
	if laneRoot == "" || commonDir == "" {
		return ""
	}

	commonDirPath := commonDir
	if !filepath.IsAbs(commonDirPath) {
		commonDirPath = filepath.Join(laneRoot, commonDirPath)
	}
	commonDirPath, err := filepath.Abs(commonDirPath)
	if err != nil {
		return ""
	}

	repoRoot := filepath.Dir(commonDirPath)
	return relativeToWorkspace(repoRoot, workspaceRoot)
}

func LoadSnapshot(options SnapshotRuntimeOptions) (*Snapshot, string, string, error) {
	workspacePath := options.WorkspacePath
	if workspacePath == "" && options.SnapshotPath == "" {
		workspacePath = FindWorkspaceRoot(options.WorkingDirectory)
	}
	if workspacePath != "" {
		resolvedWorkspace, err := filepath.Abs(workspacePath)
		if err != nil {
			return nil, "", "", err
		}
		workspacePath = resolvedWorkspace
	}

	snapshotPath := options.SnapshotPath
	cachePath := ""
	if snapshotPath == "" {
		if workspacePath == "" {
			return nil, "", "", fmt.Errorf("workspace path not provided and could not be inferred")
		}
		if !dirExists(workspacePath) {
			return nil, "", "", fmt.Errorf("workspace not found: %s", workspacePath)
		}

		snapshotScript := resolveSnapshotScript(workspacePath, options.SnapshotScript)
		if !fileExists(snapshotScript) {
			return nil, "", "", fmt.Errorf("git-evidence snapshot script not found: %s (set AGG_SNAPSHOT_SCRIPT or pass --snapshot-script, or provide --snapshot FILE)", snapshotScript)
		}

		if options.UseCache && !options.FetchRemotes {
			cachePath = cacheFileForWorkspace(workspacePath)
			if ageSeconds, ok := cachedSnapshotAgeSeconds(cachePath, options.CacheTTLSeconds); ok {
				fmt.Fprintf(options.Stderr, "[agg] using cached workspace snapshot %s (age %ds)\n", cachePath, ageSeconds)
				snapshotPath = cachePath
			}
		}

		if snapshotPath == "" {
			startedAt := time.Now()
			fmt.Fprintf(options.Stderr, "[agg] generating workspace snapshot for %s\n", workspacePath)
			output, err := runSnapshotScript(snapshotScript, workspacePath, options.FetchRemotes)
			if err != nil {
				return nil, "", "", err
			}
			fmt.Fprintf(options.Stderr, "[agg] snapshot ready in %ds\n", int(time.Since(startedAt).Seconds()))

			if cachePath != "" {
				if err := os.MkdirAll(filepath.Dir(cachePath), 0o755); err != nil {
					return nil, "", "", err
				}
				if err := os.WriteFile(cachePath, output, 0o644); err != nil {
					return nil, "", "", err
				}
				fmt.Fprintf(options.Stderr, "[agg] cached workspace snapshot at %s\n", cachePath)
				snapshotPath = cachePath
			} else {
				tempFile, err := os.CreateTemp("", "agg-scan-snapshot.*.json")
				if err != nil {
					return nil, "", "", err
				}
				if _, err := tempFile.Write(output); err != nil {
					tempFile.Close()
					return nil, "", "", err
				}
				if err := tempFile.Close(); err != nil {
					return nil, "", "", err
				}
				snapshotPath = tempFile.Name()
			}
		}
	}

	if snapshotPath == "" {
		return nil, "", "", fmt.Errorf("snapshot not found")
	}

	resolvedSnapshot, err := filepath.Abs(snapshotPath)
	if err != nil {
		return nil, "", "", err
	}

	rawSnapshot, err := os.ReadFile(resolvedSnapshot)
	if err != nil {
		return nil, "", "", fmt.Errorf("snapshot not found: %s", resolvedSnapshot)
	}

	snapshot, err := ParseSnapshot(rawSnapshot)
	if err != nil {
		return nil, "", "", fmt.Errorf("invalid git-evidence snapshot: %s", resolvedSnapshot)
	}

	return snapshot, resolvedSnapshot, workspacePath, nil
}

func cacheFileForWorkspace(workspaceRoot string) string {
	hash := sha256.Sum256([]byte(workspaceRoot))
	cacheRoot := cacheRootDir()
	return filepath.Join(cacheRoot, fmt.Sprintf("%x", hash), "snapshot.json")
}

func cacheRootDir() string {
	if value := os.Getenv("XDG_CACHE_HOME"); strings.TrimSpace(value) != "" {
		return filepath.Join(value, "agent-git-graph")
	}
	if value := os.Getenv("HOME"); strings.TrimSpace(value) != "" {
		return filepath.Join(value, ".cache", "agent-git-graph")
	}
	return filepath.Join(os.TempDir(), "agent-git-graph")
}

func cachedSnapshotAgeSeconds(cachePath string, maxAgeSeconds int) (int, bool) {
	info, err := os.Stat(cachePath)
	if err != nil {
		return 0, false
	}

	ageSeconds := int(time.Since(info.ModTime()).Seconds())
	if ageSeconds <= maxAgeSeconds {
		return ageSeconds, true
	}
	return 0, false
}

func runSnapshotScript(scriptPath, workspacePath string, fetchRemotes bool) ([]byte, error) {
	args := []string{workspacePath}
	if fetchRemotes {
		args = append(args, "--fetch")
	}

	command := exec.Command(scriptPath, args...)
	var stdoutBuffer bytes.Buffer
	var stderrBuffer bytes.Buffer
	command.Stdout = &stdoutBuffer
	command.Stderr = &stderrBuffer

	if err := command.Run(); err != nil {
		message := strings.TrimSpace(stderrBuffer.String())
		if message == "" {
			message = err.Error()
		}
		return nil, fmt.Errorf("workspace snapshot failed: %s", message)
	}

	return stdoutBuffer.Bytes(), nil
}

func gitRevParse(startPath string, args ...string) string {
	commandArgs := append([]string{"-C", startPath, "rev-parse"}, args...)
	output, err := exec.Command("git", commandArgs...).Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(output))
}

func relativeToWorkspace(absolutePath, workspaceRoot string) string {
	resolvedPath, err := canonicalPath(absolutePath)
	if err != nil {
		return ""
	}
	resolvedWorkspace, err := canonicalPath(workspaceRoot)
	if err != nil {
		return ""
	}

	if resolvedPath == resolvedWorkspace {
		return "."
	}
	prefix := resolvedWorkspace + string(os.PathSeparator)
	if strings.HasPrefix(resolvedPath, prefix) {
		return resolvedPath[len(prefix):]
	}
	return ""
}

func fileExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

func pathExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func canonicalPath(path string) (string, error) {
	absolutePath, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	resolvedPath, err := filepath.EvalSymlinks(absolutePath)
	if err == nil {
		return resolvedPath, nil
	}
	return absolutePath, nil
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	if err != nil {
		return false
	}
	return info.IsDir()
}

func parseCacheTTLSeconds(value string) (int, error) {
	parsedValue, err := strconv.Atoi(value)
	if err != nil || parsedValue < 0 {
		return 0, fmt.Errorf("--cache-ttl must be a non-negative integer")
	}
	return parsedValue, nil
}
