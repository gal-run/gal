package ingest

import (
	"context"
	"strings"
	"testing"

	"github.com/gal-run/gal/services/gal-rag/internal/contracts"
)

func TestContentHashStable(t *testing.T) {
	a := ContentHash("org1", "owner/repo", "path/to/file.go", 0, 100, "hello world")
	b := ContentHash("org1", "owner/repo", "path/to/file.go", 0, 100, "hello world")
	if a != b {
		t.Errorf("expected stable hash, got %q != %q", a, b)
	}
	if !strings.HasPrefix(a, "sha256:") {
		t.Errorf("expected sha256: prefix, got %q", a)
	}
}

func TestContentHashDiffersOnAnyField(t *testing.T) {
	base := ContentHash("o", "r/r", "p", 0, 10, "x")
	cases := map[string]string{
		"org":   ContentHash("o2", "r/r", "p", 0, 10, "x"),
		"repo":  ContentHash("o", "r2/r2", "p", 0, 10, "x"),
		"path":  ContentHash("o", "r/r", "p2", 0, 10, "x"),
		"start": ContentHash("o", "r/r", "p", 1, 10, "x"),
		"end":   ContentHash("o", "r/r", "p", 0, 11, "x"),
		"body":  ContentHash("o", "r/r", "p", 0, 10, "x2"),
	}
	for k, v := range cases {
		if v == base {
			t.Errorf("changing %s did not affect hash", k)
		}
	}
}

func TestBuildCanonicalURL(t *testing.T) {
	cases := []struct {
		name string
		ref  contracts.SourceRef
		want string
	}{
		{
			name: "file",
			ref:  contracts.SourceRef{Kind: contracts.SourceRefGitHubFile, Owner: "o", Repo: "r", Path: "x.go", Ref: "abc"},
			want: "https://github.com/o/r/blob/abc/x.go",
		},
		{
			name: "issue",
			ref:  contracts.SourceRef{Kind: contracts.SourceRefGitHubIssue, Owner: "o", Repo: "r", Ref: "42"},
			want: "https://github.com/o/r/issues/42",
		},
		{
			name: "pr",
			ref:  contracts.SourceRef{Kind: contracts.SourceRefGitHubPR, Owner: "o", Repo: "r", Ref: "7"},
			want: "https://github.com/o/r/pull/7",
		},
		{
			name: "memory passes through URL",
			ref:  contracts.SourceRef{Kind: contracts.SourceRefMemory, URL: "https://example.com/x"},
			want: "https://example.com/x",
		},
		{
			name: "missing owner → empty",
			ref:  contracts.SourceRef{Kind: contracts.SourceRefGitHubFile, Repo: "r", Ref: "abc"},
			want: "",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := BuildCanonicalURL(tc.ref)
			if got != tc.want {
				t.Errorf("got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestInferSourceTypeFromExt(t *testing.T) {
	cases := map[string]string{
		"go": ".go",
		"rust": ".rs",
		"ts": ".ts",
		"py": ".py",
		"md": ".md",
	}
	for want, ext := range cases {
		got := inferSourceType("github_file", "a/b/file"+ext)
		if got != want {
			t.Errorf("inferSourceType(.%s) = %q, want %q", ext, got, want)
		}
	}
	// Source kind wins over extension.
	if got := inferSourceType("github_issue", "a/b/anything.go"); got != "issue" {
		t.Errorf("kind=github_issue should override ext, got %q", got)
	}
}

// NoopUpserter satisfies the Upserter contract and records points.
func TestNoopUpserterRecords(t *testing.T) {
	up := &NoopUpserter{}
	if err := up.Upsert(context.Background(), []*Point{{ID: "a"}, {ID: "b"}}); err != nil {
		t.Fatalf("upsert: %v", err)
	}
	if got := len(up.Snapshot()); got != 2 {
		t.Errorf("expected 2 recorded points, got %d", got)
	}
	exists, err := up.ExistsByContentHash(context.Background(), "o", "h")
	if err != nil || exists {
		t.Errorf("expected noop ExistsByContentHash to return (false, nil); got (%v, %v)", exists, err)
	}
	if err := up.DeleteByContentHash(context.Background(), "o", "h"); err != nil {
		t.Errorf("noop delete: %v", err)
	}
	up.Reset()
	if got := len(up.Snapshot()); got != 0 {
		t.Errorf("expected 0 after reset, got %d", got)
	}
}
