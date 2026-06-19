package ingest

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/gal-run/gal/services/lib/githubapp"
)

// MaxFileBytes is the size cap for content we will embed. GitHub's raw
// media type happily returns large files, but anything past this is more
// likely a generated/minified asset than human-authored source and would
// blow the embedding token budget. Files over the cap are skipped (job
// completes as a no-op), not failed.
const MaxFileBytes = 1 << 20 // 1 MiB

// FileFetcher is the subset of the GitHub App client the worker needs. It
// is an interface so tests can inject a fake with no network access.
type FileFetcher interface {
	FetchFile(ctx context.Context, installID int64, owner, repo, path, ref string, maxBytes int64) ([]byte, string, error)
}

// errSkip is a sentinel wrapping a reason that a path should be skipped
// (binary, oversized, deleted). The worker treats it as complete-not-failed.
type errSkip struct{ reason string }

func (e *errSkip) Error() string { return "skip: " + e.reason }

// skipReason returns the human reason if err is a skip sentinel.
func skipReason(err error) (string, bool) {
	var s *errSkip
	if errors.As(err, &s) {
		return s.reason, true
	}
	return "", false
}

// Retry policy lives in the worker, not here: processJob completes the job
// when skipReason(err) is true (binary/oversized/deleted — permanent) and
// otherwise returns the error so store.MarkFailed re-queues it (up to
// MaxAttempts, then DLQ). Every non-skip fetch error (rate-limit, auth,
// transport) is therefore retried by that backstop — no separate classifier
// is needed, and adding one only risks drifting from the worker's actual
// behaviour.

// binaryExtensions are file extensions we never try to fetch+embed. These
// are checked before any network call (cheapest filter).
var binaryExtensions = map[string]struct{}{
	// images
	".png": {}, ".jpg": {}, ".jpeg": {}, ".gif": {}, ".bmp": {}, ".ico": {},
	".webp": {}, ".tiff": {}, ".svg": {}, // svg is text but rarely useful to embed
	// archives / binaries
	".zip": {}, ".gz": {}, ".tar": {}, ".tgz": {}, ".bz2": {}, ".xz": {},
	".7z": {}, ".rar": {}, ".jar": {}, ".war": {}, ".exe": {}, ".dll": {},
	".so": {}, ".dylib": {}, ".a": {}, ".o": {}, ".class": {}, ".bin": {},
	".wasm": {},
	// media
	".mp3": {}, ".mp4": {}, ".wav": {}, ".avi": {}, ".mov": {}, ".mkv": {},
	".flac": {}, ".ogg": {}, ".webm": {},
	// docs / fonts
	".pdf": {}, ".doc": {}, ".docx": {}, ".xls": {}, ".xlsx": {}, ".ppt": {},
	".pptx": {}, ".ttf": {}, ".otf": {}, ".woff": {}, ".woff2": {}, ".eot": {},
	// data blobs / db
	".db": {}, ".sqlite": {}, ".sqlite3": {}, ".pyc": {}, ".pdb": {},
}

// isBinaryPath reports whether the path's extension marks it as a binary
// asset we should skip without fetching.
func isBinaryPath(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	_, ok := binaryExtensions[ext]
	return ok
}

// looksBinary reports whether the fetched bytes are binary (not valid
// UTF-8, or contain a NUL byte). A post-fetch double-check that catches
// binaries with text-y or missing extensions.
func looksBinary(data []byte) bool {
	if len(data) == 0 {
		return false
	}
	// A NUL byte is the classic binary tell (git uses the same heuristic).
	if bytes.IndexByte(data, 0x00) >= 0 {
		return true
	}
	if !utf8.Valid(data) {
		return true
	}
	return false
}

// FetchContent fetches a file's text content for embedding. It applies the
// cheap pre-fetch skip filters (binary extension), then fetches via the
// GitHub App client, then applies the post-fetch checks (size cap, binary
// content). It returns:
//   - (content, nil)                   on success
//   - ("", *errSkip)                   for a permanent skip (binary/oversized/deleted)
//   - ("", <retryable err>)            for auth/rate-limit/transient failures
func FetchContent(ctx context.Context, f FileFetcher, installID int64, owner, repo, path, ref string) (string, error) {
	if f == nil {
		return "", &errSkip{reason: "no github fetcher configured"}
	}
	if installID == 0 {
		// No installation id means we can't authenticate; this is a
		// configuration/data gap for this repo, not a transient error.
		return "", &errSkip{reason: "missing installation id"}
	}
	if path == "" {
		// Pathless github_file job (legacy "scan-all" placeholder). There is
		// nothing to fetch here — the trees-enumeration backfill owns that.
		return "", &errSkip{reason: "empty path (scan-all placeholder)"}
	}
	if isBinaryPath(path) {
		return "", &errSkip{reason: fmt.Sprintf("binary extension %q", filepath.Ext(path))}
	}

	// Pass MaxFileBytes+1 so the client's read is bounded (no unbounded
	// allocation) yet we can still detect "over the cap" by length below.
	data, _, err := f.FetchFile(ctx, installID, owner, repo, path, ref, MaxFileBytes+1)
	if err != nil {
		if errors.Is(err, githubapp.ErrNotFound) {
			return "", &errSkip{reason: "404 (deleted or missing path)"}
		}
		// Auth / rate-limit / transient — surface as-is so the worker retries.
		return "", err
	}

	if len(data) > MaxFileBytes {
		return "", &errSkip{reason: fmt.Sprintf("file exceeds size cap (> %d bytes)", MaxFileBytes)}
	}
	if looksBinary(data) {
		return "", &errSkip{reason: "content is binary (NUL byte or invalid UTF-8)"}
	}
	return string(data), nil
}
