package ingest

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/gal-run/gal/services/lib/githubapp"
)

// fakeFetcher is an in-memory FileFetcher: no network. It returns the
// configured data/err for any call and records the args it saw.
type fakeFetcher struct {
	data        []byte
	sha         string
	err         error
	gotInstall  int64
	gotPath     string
	gotRef      string
	gotMaxBytes int64
	calls       int
}

func (f *fakeFetcher) FetchFile(_ context.Context, installID int64, _, _, path, ref string, maxBytes int64) ([]byte, string, error) {
	f.calls++
	f.gotInstall = installID
	f.gotPath = path
	f.gotRef = ref
	f.gotMaxBytes = maxBytes
	if f.err != nil {
		return nil, "", f.err
	}
	return f.data, f.sha, nil
}

func TestIsBinaryPath(t *testing.T) {
	binary := []string{"a/b.png", "logo.SVG", "lib.so", "app.exe", "x.woff2", "data.sqlite3"}
	for _, p := range binary {
		if !isBinaryPath(p) {
			t.Errorf("isBinaryPath(%q) = false, want true", p)
		}
	}
	text := []string{"main.go", "README.md", "src/app.ts", "noext", "config.yaml"}
	for _, p := range text {
		if isBinaryPath(p) {
			t.Errorf("isBinaryPath(%q) = true, want false", p)
		}
	}
}

func TestLooksBinary(t *testing.T) {
	if looksBinary([]byte("plain text\nwith newlines")) {
		t.Error("plain text flagged as binary")
	}
	if !looksBinary([]byte("has a \x00 nul byte")) {
		t.Error("NUL byte not detected as binary")
	}
	if !looksBinary([]byte{0xff, 0xfe, 0xfd}) {
		t.Error("invalid UTF-8 not detected as binary")
	}
	if looksBinary(nil) {
		t.Error("empty content should not be binary")
	}
}

func TestFetchContentSuccess(t *testing.T) {
	f := &fakeFetcher{data: []byte("package main\n")}
	got, err := FetchContent(context.Background(), f, 5, "o", "r", "main.go", "sha1")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if got != "package main\n" {
		t.Errorf("content = %q", got)
	}
	if f.gotInstall != 5 || f.gotPath != "main.go" || f.gotRef != "sha1" {
		t.Errorf("fetcher saw install=%d path=%q ref=%q", f.gotInstall, f.gotPath, f.gotRef)
	}
}

func TestFetchContentSkipsBinaryExtensionBeforeFetch(t *testing.T) {
	f := &fakeFetcher{data: []byte("should not be read")}
	_, err := FetchContent(context.Background(), f, 5, "o", "r", "logo.png", "main")
	if _, skip := skipReason(err); !skip {
		t.Fatalf("expected skip for binary extension, got %v", err)
	}
	if f.calls != 0 {
		t.Errorf("binary extension should be filtered BEFORE fetch; calls=%d", f.calls)
	}
}

func TestFetchContentSkipsOversized(t *testing.T) {
	big := make([]byte, MaxFileBytes+1)
	for i := range big {
		big[i] = 'a'
	}
	f := &fakeFetcher{data: big}
	_, err := FetchContent(context.Background(), f, 5, "o", "r", "big.go", "main")
	if _, skip := skipReason(err); !skip {
		t.Fatalf("expected skip for oversized file, got %v", err)
	}
}

func TestFetchContentSkipsBinaryContent(t *testing.T) {
	// Text-looking extension but binary bytes (NUL) → post-fetch skip.
	f := &fakeFetcher{data: []byte("text\x00binary")}
	_, err := FetchContent(context.Background(), f, 5, "o", "r", "weird.txt", "main")
	if _, skip := skipReason(err); !skip {
		t.Fatalf("expected skip for binary content, got %v", err)
	}
}

func TestFetchContentSkipsMissingInstallID(t *testing.T) {
	f := &fakeFetcher{data: []byte("x")}
	_, err := FetchContent(context.Background(), f, 0, "o", "r", "main.go", "main")
	if _, skip := skipReason(err); !skip {
		t.Fatalf("expected skip for missing install id, got %v", err)
	}
	if f.calls != 0 {
		t.Errorf("missing install id should not fetch; calls=%d", f.calls)
	}
}

func TestFetchContentSkipsEmptyPath(t *testing.T) {
	f := &fakeFetcher{data: []byte("x")}
	_, err := FetchContent(context.Background(), f, 5, "o", "r", "", "main")
	if _, skip := skipReason(err); !skip {
		t.Fatalf("expected skip for empty path, got %v", err)
	}
}

func TestFetchContent404IsSkip(t *testing.T) {
	f := &fakeFetcher{err: githubapp.ErrNotFound}
	_, err := FetchContent(context.Background(), f, 5, "o", "r", "gone.go", "main")
	if _, skip := skipReason(err); !skip {
		t.Fatalf("expected skip for 404, got %v", err)
	}
}

// A rate-limit error must NOT be a skip — i.e. the worker re-queues it
// (skipReason==false → processJob returns the error → MarkFailed re-queues).
func TestFetchContentRateLimitIsNotSkip(t *testing.T) {
	f := &fakeFetcher{err: &githubapp.RateLimitError{Status: 429, RetryAfter: time.Second}}
	_, err := FetchContent(context.Background(), f, 5, "o", "r", "x.go", "main")
	if _, skip := skipReason(err); skip {
		t.Fatalf("rate limit should NOT be a skip, got skip: %v", err)
	}
}

// An auth error must NOT be a skip — the worker re-queues it (then DLQs after
// MaxAttempts), rather than silently completing the job.
func TestFetchContentAuthIsNotSkip(t *testing.T) {
	f := &fakeFetcher{err: &githubapp.AuthError{Status: 403, Body: "no access"}}
	_, err := FetchContent(context.Background(), f, 5, "o", "r", "x.go", "main")
	if _, skip := skipReason(err); skip {
		t.Fatalf("auth error should NOT be a skip, got skip: %v", err)
	}
}

// FetchContent must request a bounded read (cap+1) so the client cannot make
// an unbounded allocation on a huge/slowloris response.
func TestFetchContentRequestsBoundedRead(t *testing.T) {
	f := &fakeFetcher{data: []byte("hello")}
	if _, err := FetchContent(context.Background(), f, 5, "o", "r", "x.go", "main"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if f.gotMaxBytes != MaxFileBytes+1 {
		t.Errorf("maxBytes passed to fetcher = %d, want %d", f.gotMaxBytes, MaxFileBytes+1)
	}
}

func TestSkipReasonWrapped(t *testing.T) {
	err := &errSkip{reason: "binary extension"}
	reason, ok := skipReason(err)
	if !ok || !strings.Contains(reason, "binary") {
		t.Errorf("skipReason = (%q, %v)", reason, ok)
	}
	if _, ok := skipReason(errors.New("other")); ok {
		t.Error("non-skip error reported as skip")
	}
}
